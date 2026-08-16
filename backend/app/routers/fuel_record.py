import uuid
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.user import User
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


@router.get("/")
def list_fuel_records(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Return all fuel refill records with joined vehicle, driver, and calculated fuel efficiency."""
    records = db.query(FuelRecord).order_by(FuelRecord.created_at.desc()).all()
    result = []
    
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        
        driver_name = "Unassigned"
        if r.driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == r.driver_id).first()
            if drv and drv.user_id:
                usr = db.query(User).filter(User.user_id == drv.user_id).first()
                if usr:
                    driver_name = usr.full_name

        # Calculate estimated distance travelled by vehicle for efficiency (KM / L)
        trips = db.query(Trip).filter(Trip.vehicle_id == r.vehicle_id, Trip.status == TripStatusEnum.Completed).all()
        total_distance = sum(t.distance or 0.0 for t in trips)
        km_per_litre = round(total_distance / r.litres, 2) if r.litres and r.litres > 0 else 12.5

        result.append({
            "fuel_id": str(r.fuel_id),
            "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
            "driver_id": str(r.driver_id) if r.driver_id else None,
            "registration_number": veh.registration_number if veh else "N/A",
            "vehicle_brand": veh.brand if veh else "N/A",
            "driver_name": driver_name,
            "refill_date": r.refill_date or str(r.created_at)[:10],
            "fuel_type": r.fuel_type or "Diesel",
            "litres": r.litres or 0.0,
            "price_per_litre": r.price_per_litre or 0.0,
            "total_cost": r.total_cost or (r.litres * r.price_per_litre),
            "odometer_reading": r.odometer_reading or 0.0,
            "location": r.location or "HQ Station",
            "notes": r.notes or "-",
            "km_per_litre": km_per_litre,
        })
    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_fuel_record(
    payload: FuelCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Log a new fuel refill record into PostgreSQL with strict validations."""
    if payload.litres <= 0:
        raise HTTPException(status_code=400, detail="Fuel litres must be greater than 0")
    if payload.price_per_litre <= 0:
        raise HTTPException(status_code=400, detail="Price per litre must be greater than 0")

    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    total = round(payload.litres * payload.price_per_litre, 2)

    f = FuelRecord(
        fuel_id=uuid.uuid4(),
        vehicle_id=payload.vehicle_id,
        driver_id=payload.driver_id,
        refill_date=payload.refill_date,
        fuel_type=payload.fuel_type or "Diesel",
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

    return {
        "fuel_id": str(f.fuel_id),
        "vehicle_id": str(f.vehicle_id),
        "litres": f.litres,
        "price_per_litre": f.price_per_litre,
        "total_cost": f.total_cost,
        "message": "Fuel refill logged successfully in PostgreSQL",
    }


@router.delete("/{fuel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fuel_record(
    fuel_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a fuel refill record."""
    f = db.query(FuelRecord).filter(FuelRecord.fuel_id == fuel_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fuel record not found")
    db.delete(f)
    db.commit()
    return None
