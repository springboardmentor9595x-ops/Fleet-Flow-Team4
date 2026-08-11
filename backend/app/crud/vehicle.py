from uuid import UUID
from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.schemas.vehicle import VehicleCreate, VehicleUpdate


def create_vehicle(db: Session, vehicle_in: VehicleCreate) -> Vehicle:
    vehicle = Vehicle(**vehicle_in.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


def get_vehicle_by_id(db: Session, vehicle_id: UUID) -> Optional[Vehicle]:
    return db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()


def get_vehicle_by_registration(db: Session, registration_number: str) -> Optional[Vehicle]:
    return db.query(Vehicle).filter(Vehicle.registration_number == registration_number).first()


def get_vehicles(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[VehicleStatusEnum] = None,
    vehicle_type: Optional[str] = None,
) -> List[Vehicle]:
    query = db.query(Vehicle)
    if status is not None:
        query = query.filter(Vehicle.status == status)
    if vehicle_type:
        query = query.filter(Vehicle.vehicle_type.ilike(f"%{vehicle_type}%"))
    return query.offset(skip).limit(limit).all()


def update_vehicle(db: Session, vehicle_db: Vehicle, vehicle_in: VehicleUpdate) -> Vehicle:
    update_data = vehicle_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle_db, field, value)
    db.commit()
    db.refresh(vehicle_db)
    return vehicle_db


def delete_vehicle(db: Session, vehicle_id: UUID) -> bool:
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        return False
    db.delete(vehicle)
    db.commit()
    return True


def get_vehicle_status_counts(db: Session) -> dict:
    results = (
        db.query(Vehicle.status, func.count(Vehicle.vehicle_id))
        .group_by(Vehicle.status)
        .all()
    )
    counts_map = {status: count for status, count in results}

    total = db.query(func.count(Vehicle.vehicle_id)).scalar() or 0
    available = counts_map.get(VehicleStatusEnum.Available, 0)
    assigned = counts_map.get(VehicleStatusEnum.Assigned, 0)
    maintenance = counts_map.get(VehicleStatusEnum.Maintenance, 0)
    in_transit = counts_map.get(VehicleStatusEnum.InTransit, 0)

    return {
        "total_vehicles": total,
        "available": available,
        "assigned": assigned,
        "maintenance": maintenance,
        "in_transit": in_transit,
    }
