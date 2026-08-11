from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.shipment import ShipmentStatusEnum
from app.models.user import RoleEnum
from app.schemas.shipment import (
    ShipmentCreate, ShipmentResponse, ShipmentUpdate,
    ShipmentStatusHistoryResponse, ShipmentStatusUpdateRequest, ShipmentAlertResponse
)
from app.crud import shipment as shipment_crud
from app.core.deps import get_current_user, require_roles

router = APIRouter()


@router.post("/", response_model=ShipmentResponse, status_code=status.HTTP_201_CREATED)
def create_shipment(
    shipment_in: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """Create a new shipment."""
    existing = shipment_crud.get_shipment_by_tracking_number(db, shipment_in.tracking_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shipment with tracking number '{shipment_in.tracking_number}' already exists.",
        )
    return shipment_crud.create_shipment(db, shipment_in=shipment_in)


@router.get("/alerts", response_model=List[ShipmentAlertResponse])
def get_shipment_alerts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve active alerts for shipments approaching deadline or delayed."""
    return shipment_crud.get_shipment_alerts(db)


@router.get("/", response_model=List[ShipmentResponse])
def list_shipments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    shipment_status: Optional[ShipmentStatusEnum] = None,
    customer_name: Optional[str] = None,
    vehicle_id: Optional[UUID] = None,
    driver_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List shipments with filters (status, customer name, vehicle ID, driver ID), scoped by role."""
    return shipment_crud.get_shipments(
        db,
        current_user=current_user,
        skip=skip,
        limit=limit,
        status=shipment_status,
        customer_name=customer_name,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
    )


@router.get("/{shipment_id}", response_model=ShipmentResponse)
def get_shipment(
    shipment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Fetch details of a single shipment."""
    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=shipment_id)
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    if current_user.role == RoleEnum.Driver and shipment.driver_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    return shipment


@router.put("/{shipment_id}", response_model=ShipmentResponse)
def update_shipment(
    shipment_id: UUID,
    shipment_in: ShipmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """Update shipment details or reassign vehicle/driver."""
    shipment_db = shipment_crud.get_shipment_by_id(db, shipment_id=shipment_id)
    if not shipment_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    if shipment_in.tracking_number and shipment_in.tracking_number != shipment_db.tracking_number:
        existing = shipment_crud.get_shipment_by_tracking_number(db, shipment_in.tracking_number)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Shipment with tracking number '{shipment_in.tracking_number}' already exists.",
            )

    return shipment_crud.update_shipment(db, shipment_db=shipment_db, shipment_in=shipment_in, updated_by=current_user.user_id)


@router.post("/{shipment_id}/status", response_model=ShipmentResponse)
def update_delivery_status(
    shipment_id: UUID,
    status_req: ShipmentStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Progress delivery status stage by stage (Created -> Assigned -> In Transit -> Delivered / Delayed / Cancelled)."""
    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=shipment_id)
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    if current_user.role == RoleEnum.Driver and shipment.driver_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this shipment status.")

    return shipment_crud.update_shipment_status(
        db,
        shipment_db=shipment,
        new_status=status_req.status,
        location=status_req.location,
        latitude=status_req.latitude,
        longitude=status_req.longitude,
        updated_by=current_user.user_id,
    )


@router.post("/{shipment_id}/cancel", response_model=ShipmentResponse)
def cancel_shipment(
    shipment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """Cancel a shipment."""
    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=shipment_id)
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    return shipment_crud.update_shipment_status(
        db,
        shipment_db=shipment,
        new_status=ShipmentStatusEnum.Cancelled,
        location="Cancelled by dispatcher/manager",
        updated_by=current_user.user_id,
    )


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shipment(
    shipment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Delete a shipment."""
    success = shipment_crud.delete_shipment(db, shipment_id=shipment_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    return None


@router.get("/{shipment_id}/history", response_model=List[ShipmentStatusHistoryResponse])
def get_shipment_history(
    shipment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve the lifecycle timeline of status changes for a shipment."""
    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=shipment_id)
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    return shipment_crud.get_shipment_status_history(db, shipment_id=shipment_id)