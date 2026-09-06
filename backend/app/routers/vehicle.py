from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.vehicle import VehicleStatusEnum
from app.models.user import RoleEnum
from app.schemas.vehicle import (
    VehicleCreate,
    VehicleResponse,
    VehicleStatusCountResponse,
    VehicleUpdate,
)
from app.crud import vehicle as vehicle_crud
from app.core.deps import get_current_user, require_roles

router = APIRouter()


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Create a new vehicle record."""
    existing_vehicle = vehicle_crud.get_vehicle_by_registration(
        db, registration_number=vehicle_in.registration_number
    )
    if existing_vehicle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle with registration number '{vehicle_in.registration_number}' already exists.",
        )
    return vehicle_crud.create_vehicle(db, vehicle_in=vehicle_in)


@router.get("/status-counts", response_model=VehicleStatusCountResponse)
def get_vehicle_status_counts(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Get vehicle count metrics broken down by status for dashboard overview."""
    return vehicle_crud.get_vehicle_status_counts(db)


from app.models.driver import Driver
from app.models.user import User


def format_vehicle_response(v, db: Session):
    driver_name = None
    if v.assigned_driver_id:
        drv = db.query(Driver).filter(Driver.driver_id == v.assigned_driver_id).first()
        if drv and drv.user_id:
            usr = db.query(User).filter(User.user_id == drv.user_id).first()
            if usr:
                driver_name = usr.full_name

    return {
        "vehicle_id": v.vehicle_id,
        "registration_number": v.registration_number,
        "vehicle_type": v.vehicle_type,
        "brand": v.brand,
        "model": v.model,
        "manufacture_year": v.manufacture_year,
        "fuel_type": v.fuel_type,
        "capacity": v.capacity,
        "assigned_driver_id": v.assigned_driver_id,
        "assigned_driver_name": driver_name or "Unassigned",
        "status": v.status,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
    }


@router.get("/", response_model=List[VehicleResponse])
def list_vehicles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    vehicle_status: Optional[VehicleStatusEnum] = None,
    vehicle_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Retrieve all vehicles with optional pagination and filtering by status/type."""
    vehicles = vehicle_crud.get_vehicles(
        db, skip=skip, limit=limit, status=vehicle_status, vehicle_type=vehicle_type
    )
    return [format_vehicle_response(v, db) for v in vehicles]


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Get details of a single vehicle by UUID."""
    vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=vehicle_id)
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID '{vehicle_id}' not found.",
        )
    return format_vehicle_response(vehicle, db)


@router.put("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: UUID,
    vehicle_in: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Update details of an existing vehicle."""
    vehicle_db = vehicle_crud.get_vehicle_by_id(db, vehicle_id=vehicle_id)
    if not vehicle_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID '{vehicle_id}' not found.",
        )

    if (
        vehicle_in.registration_number
        and vehicle_in.registration_number != vehicle_db.registration_number
    ):
        existing_reg = vehicle_crud.get_vehicle_by_registration(
            db, registration_number=vehicle_in.registration_number
        )
        if existing_reg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vehicle with registration number '{vehicle_in.registration_number}' already exists.",
            )

    return vehicle_crud.update_vehicle(db, vehicle_db=vehicle_db, vehicle_in=vehicle_in)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Delete a vehicle record by UUID."""
    success = vehicle_crud.delete_vehicle(db, vehicle_id=vehicle_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID '{vehicle_id}' not found.",
        )
    return None