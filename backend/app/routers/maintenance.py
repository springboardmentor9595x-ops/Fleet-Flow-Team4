import uuid
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import RoleEnum
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.maintenance import Maintenance

router = APIRouter()


class MaintenanceCreate(BaseModel):
    vehicle_id: UUID
    maintenance_type: str = "General Inspection"
    scheduled_date: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[float] = 0.0
    status: Optional[str] = "Scheduled"


class MaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = None
    scheduled_date: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[float] = None
    status: Optional[str] = None


@router.get("/")
def list_maintenance(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Retrieve all maintenance records with vehicle registration & model details."""
    records = db.query(Maintenance).order_by(Maintenance.created_at.desc()).all()
    result = []
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        result.append({
            "maintenance_id": str(r.maintenance_id),
            "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
            "registration_number": veh.registration_number if veh else "N/A",
            "model": f"{veh.brand} {veh.model}" if veh else "N/A",
            "maintenance_type": r.maintenance_type or "General Inspection",
            "scheduled_date": r.scheduled_date or "2026-08-15",
            "description": r.description or "Routine Maintenance",
            "cost": r.cost or 0.0,
            "status": r.status or "Scheduled",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_maintenance(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Schedule a new maintenance record and set vehicle status to Maintenance."""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    m = Maintenance(
        maintenance_id=uuid.uuid4(),
        vehicle_id=payload.vehicle_id,
        maintenance_type=payload.maintenance_type,
        scheduled_date=payload.scheduled_date or datetime.utcnow().strftime("%Y-%m-%d"),
        description=payload.description,
        cost=payload.cost or 0.0,
        status=payload.status or "Scheduled",
    )
    db.add(m)

    # Set vehicle status to Maintenance when service is scheduled/in progress
    if m.status in ["Scheduled", "In Progress"]:
        vehicle.status = VehicleStatusEnum.Maintenance

    db.commit()
    db.refresh(m)

    return {
        "maintenance_id": str(m.maintenance_id),
        "vehicle_id": str(m.vehicle_id),
        "registration_number": vehicle.registration_number,
        "maintenance_type": m.maintenance_type,
        "status": m.status,
    }


@router.put("/{maintenance_id}")
def update_maintenance(
    maintenance_id: UUID,
    payload: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Update maintenance record. Restores vehicle status to Available when Completed."""
    m = db.query(Maintenance).filter(Maintenance.maintenance_id == maintenance_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    if payload.maintenance_type is not None:
        m.maintenance_type = payload.maintenance_type
    if payload.scheduled_date is not None:
        m.scheduled_date = payload.scheduled_date
    if payload.description is not None:
        m.description = payload.description
    if payload.cost is not None:
        m.cost = payload.cost
    if payload.status is not None:
        m.status = payload.status

    # If completed or cancelled, restore vehicle status to Available
    if m.vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == m.vehicle_id).first()
        if vehicle:
            if m.status in ["Completed", "Cancelled"]:
                vehicle.status = VehicleStatusEnum.Available
            elif m.status in ["Scheduled", "In Progress"]:
                vehicle.status = VehicleStatusEnum.Maintenance

    db.commit()
    return {"message": "Maintenance record updated successfully"}


@router.delete("/{maintenance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(
    maintenance_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Delete a maintenance record."""
    m = db.query(Maintenance).filter(Maintenance.maintenance_id == maintenance_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    if m.vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == m.vehicle_id).first()
        if vehicle and vehicle.status == VehicleStatusEnum.Maintenance:
            vehicle.status = VehicleStatusEnum.Available

    db.delete(m)
    db.commit()
    return None
