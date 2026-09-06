import uuid
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.trip import Trip, TripStatusEnum
from app.models.fuel_record import FuelRecord

router = APIRouter()


class FuelCreate(BaseModel):
    vehicle_id: UUID
    driver_id: Optional[UUID] = None
    refill_date: Optional[str] = None
    fuel_type: Optional[str] = "Diesel"
    litres: float
    price_per_litre: float
    odometer_reading: Optional[float] = 0.0
    location: Optional[str] = "Fleet Station"
    notes: Optional[str] = None


class FuelUpdate(BaseModel):
    vehicle_id: Optional[UUID] = None
    driver_id: Optional[UUID] = None
    refill_date: Optional[str] = None
    fuel_type: Optional[str] = None
    litres: Optional[float] = None
    price_per_litre: Optional[float] = None
    odometer_reading: Optional[float] = None
    location: Optional[str] = None
    notes: Optional[str] = None


def calculate_vehicle_fuel_metrics(db: Session, vehicle_id: UUID):
    completed_trips = (
        db.query(Trip)
        .filter(Trip.vehicle_id == vehicle_id, Trip.status == TripStatusEnum.Completed)
        .all()
    )
    total_distance_km = round(sum(t.distance or 0.0 for t in completed_trips), 2)

    fuel_records = (
        db.query(FuelRecord)
        .filter(FuelRecord.vehicle_id == vehicle_id)
        .all()
    )
    total_litres = round(sum(f.litres or 0.0 for f in fuel_records), 2)
    total_cost = round(sum(f.total_cost or 0.0 for f in fuel_records), 2)

    fuel_efficiency_kml = (
        round(total_distance_km / total_litres, 2) if total_litres > 0 else 0.0
    )

    return {
        "total_distance_km": total_distance_km,
        "total_fuel_litres": total_litres,
        "total_fuel_cost": total_cost,
        "fuel_efficiency_kml": fuel_efficiency_kml,
    }


def format_fuel_record(r: FuelRecord, db: Session):
    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None

    driver_name = "Unassigned"
    if r.driver_id:
        drv = db.query(Driver).filter(Driver.driver_id == r.driver_id).first()
        if drv and drv.user_id:
            usr = db.query(User).filter(User.user_id == drv.user_id).first()
            if usr:
                driver_name = usr.full_name

    metrics = calculate_vehicle_fuel_metrics(db, r.vehicle_id) if r.vehicle_id else {"fuel_efficiency_kml": 0.0}

    return {
        "fuel_id": str(r.fuel_id),
        "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
        "driver_id": str(r.driver_id) if r.driver_id else None,
        "registration_number": veh.registration_number if veh else "N/A",
        "vehicle_brand": veh.brand if veh else "N/A",
        "vehicle_model": f"{veh.brand} {veh.model}" if veh else "N/A",
        "driver_name": driver_name,
        "refill_date": r.refill_date or str(r.created_at)[:10],
        "fuel_type": r.fuel_type or "Diesel",
        "litres": r.litres or 0.0,
        "price_per_litre": r.price_per_litre or 0.0,
        "total_cost": r.total_cost or round((r.litres * r.price_per_litre), 2),
        "odometer_reading": r.odometer_reading or 0.0,
        "location": r.location or "Fleet Station",
        "notes": r.notes or "-",
        "km_per_litre": metrics["fuel_efficiency_kml"],
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
def list_fuel_records(
    vehicle_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Retrieve fuel refill records.
    - Admin, FleetManager, Dispatcher: Full read access across entire fleet.
    - Driver: Scoped to their assigned vehicle only.
    """
    query = db.query(FuelRecord)

    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver:
            return []
        query = query.filter(FuelRecord.driver_id == driver.driver_id)
    elif vehicle_id:
        query = query.filter(FuelRecord.vehicle_id == vehicle_id)

    records = query.order_by(FuelRecord.created_at.desc()).all()
    return [format_fuel_record(r, db) for r in records]


@router.get("/reports")
def get_fuel_reports(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Vehicle-wise fuel consumption and efficiency report.
    - Admin, FleetManager, Dispatcher: Full read access.
    - Driver: 403 Forbidden.
    """
    if current_user.role == RoleEnum.Driver:
        raise HTTPException(status_code=403, detail="Not authorized to view fleet-wide fuel reports.")

    fuel_vehicle_ids = (
        db.query(FuelRecord.vehicle_id)
        .filter(FuelRecord.vehicle_id.isnot(None), FuelRecord.litres > 0)
        .distinct()
        .all()
    )
    v_ids = [row[0] for row in fuel_vehicle_ids if row[0] is not None]

    if not v_ids:
        return []

    vehicles = db.query(Vehicle).filter(Vehicle.vehicle_id.in_(v_ids)).all()
    reports = []

    for v in vehicles:
        metrics = calculate_vehicle_fuel_metrics(db, v.vehicle_id)
        if metrics["total_fuel_litres"] <= 0:
            continue

        driver_name = "Unassigned"
        if v.assigned_driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == v.assigned_driver_id).first()
            if drv and drv.user_id:
                usr = db.query(User).filter(User.user_id == drv.user_id).first()
                if usr:
                    driver_name = usr.full_name

        reports.append({
            "vehicle_id": str(v.vehicle_id),
            "registration_number": v.registration_number,
            "vehicle_type": v.vehicle_type,
            "model": f"{v.brand} {v.model}".strip() or "Standard Vehicle",
            "assigned_driver_name": driver_name,
            "total_distance_km": metrics["total_distance_km"],
            "total_fuel_litres": metrics["total_fuel_litres"],
            "total_fuel_cost": metrics["total_fuel_cost"],
            "fuel_efficiency_kml": metrics["fuel_efficiency_kml"],
            "status": v.status,
        })

    return reports


@router.get("/{fuel_id}")
def get_fuel_record_details(
    fuel_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve details for a single fuel refill record with ownership check for Driver."""
    f = db.query(FuelRecord).filter(FuelRecord.fuel_id == fuel_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fuel record not found")

    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver or f.driver_id != driver.driver_id:
            raise HTTPException(status_code=403, detail="Not authorized to view another driver's fuel record.")

    return format_fuel_record(f, db)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_fuel_record(
    payload: FuelCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Driver)),
):
    """
    Log a new fuel refill entry.
    - Admin, FleetManager: Can log for any vehicle.
    - Driver: Can log only for their assigned vehicle.
    - Dispatcher: 403 Forbidden.
    """
    if payload.litres <= 0:
        raise HTTPException(status_code=400, detail="Fuel litres must be greater than 0")
    if payload.price_per_litre <= 0:
        raise HTTPException(status_code=400, detail="Price per litre must be greater than 0")

    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver or veh.assigned_driver_id != driver.driver_id:
            raise HTTPException(status_code=403, detail="Drivers can only log fuel for their assigned vehicle.")
        effective_driver_id = driver.driver_id
    else:
        effective_driver_id = payload.driver_id or veh.assigned_driver_id

    total = round(payload.litres * payload.price_per_litre, 2)

    f = FuelRecord(
        fuel_id=uuid.uuid4(),
        vehicle_id=payload.vehicle_id,
        driver_id=effective_driver_id,
        refill_date=payload.refill_date,
        fuel_type=payload.fuel_type or veh.fuel_type or "Diesel",
        litres=payload.litres,
        price_per_litre=payload.price_per_litre,
        total_cost=total,
        odometer_reading=payload.odometer_reading or 0.0,
        location=payload.location or "Fleet Station",
        notes=payload.notes or "",
    )
    db.add(f)
    db.commit()
    db.refresh(f)

    return format_fuel_record(f, db)


@router.put("/{fuel_id}")
@router.patch("/{fuel_id}")
def update_fuel_record(
    fuel_id: UUID,
    payload: FuelUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Driver)),
):
    """
    Update a fuel refill record.
    - Admin, FleetManager: Full update access.
    - Driver: Can update only if the record belongs to the logged-in driver.
    - Dispatcher: 403 Forbidden.
    """
    f = db.query(FuelRecord).filter(FuelRecord.fuel_id == fuel_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fuel record not found")

    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver:
            raise HTTPException(status_code=403, detail="Driver profile not found.")
        if f.driver_id != driver.driver_id:
            raise HTTPException(status_code=403, detail="Drivers can only edit their own fuel refill records.")

    if payload.vehicle_id is not None and current_user.role in [RoleEnum.Admin, RoleEnum.FleetManager]:
        f.vehicle_id = payload.vehicle_id
    if payload.driver_id is not None and current_user.role in [RoleEnum.Admin, RoleEnum.FleetManager]:
        f.driver_id = payload.driver_id
    if payload.refill_date is not None:
        f.refill_date = payload.refill_date
    if payload.fuel_type is not None:
        f.fuel_type = payload.fuel_type
    if payload.litres is not None:
        if payload.litres <= 0:
            raise HTTPException(status_code=400, detail="Fuel litres must be greater than 0")
        f.litres = payload.litres
    if payload.price_per_litre is not None:
        if payload.price_per_litre <= 0:
            raise HTTPException(status_code=400, detail="Price per litre must be greater than 0")
        f.price_per_litre = payload.price_per_litre
    if payload.odometer_reading is not None:
        f.odometer_reading = payload.odometer_reading
    if payload.location is not None:
        f.location = payload.location
    if payload.notes is not None:
        f.notes = payload.notes

    f.total_cost = round((f.litres or 0.0) * (f.price_per_litre or 0.0), 2)
    db.commit()
    db.refresh(f)

    return format_fuel_record(f, db)


@router.delete("/{fuel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fuel_record(
    fuel_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Delete a fuel refill record (Admin and Fleet Manager only).
    """
    f = db.query(FuelRecord).filter(FuelRecord.fuel_id == fuel_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fuel record not found")
    db.delete(f)
    db.commit()
    return None
