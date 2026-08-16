import uuid
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import hash_password
from app.models.driver import Driver
from app.models.user import User, RoleEnum
from app.models.vehicle import Vehicle
from app.models.trip import Trip, TripStatusEnum

router = APIRouter()


class DriverCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    status: Optional[str] = "Available"
    password: Optional[str] = "driver123"


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
def list_drivers(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Return all drivers with driver_id, user_id, full_name, phone, email,
    license_number, license_expiry, status, assigned_vehicle, and current_trip.
    """
    drivers = db.query(Driver).all()
    result = []

    for d in drivers:
        user = db.query(User).filter(User.user_id == d.user_id).first()
        
        # Check active trip for driver
        active_trip = (
            db.query(Trip)
            .filter(Trip.driver_id == d.driver_id, Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]))
            .first()
        )
        
        # Check assigned vehicle
        assigned_veh = (
            db.query(Vehicle)
            .filter(Vehicle.assigned_driver_id == d.driver_id)
            .first()
        )

        # Dynamic status
        driver_status = getattr(d, "status", None) or "Available"
        if active_trip and active_trip.status == TripStatusEnum.Active:
            driver_status = "On Trip"

        result.append({
            "driver_id": str(d.driver_id),
            "user_id": str(d.user_id) if d.user_id else None,
            "full_name": user.full_name if user else "Driver",
            "email": user.email if user else "N/A",
            "phone": user.phone if user else "N/A",
            "license_number": getattr(d, "license_number", None) or f"LIC-{str(d.driver_id)[:6].upper()}",
            "license_expiry": getattr(d, "license_expiry", None) or "2028-12-31",
            "status": driver_status,
            "assigned_vehicle": assigned_veh.registration_number if assigned_veh else "None",
            "current_trip_id": str(active_trip.trip_id) if active_trip else None,
            "current_trip": f"{active_trip.start_lat},{active_trip.start_lng} → {active_trip.end_lat},{active_trip.end_lng}" if active_trip else "None",
        })
    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Create a new driver account and driver profile."""
    existing_user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if existing_user:
        user = existing_user
    else:
        user = User(
            email=payload.email.strip().lower(),
            password=hash_password(payload.password or "driver123"),
            full_name=payload.full_name.strip(),
            phone=payload.phone,
            role=RoleEnum.Driver,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    existing_driver = db.query(Driver).filter(Driver.user_id == user.user_id).first()
    if existing_driver:
        driver = existing_driver
    else:
        driver = Driver(driver_id=uuid.uuid4(), user_id=user.user_id)
        db.add(driver)

    driver.license_number = payload.license_number or f"LIC-{str(driver.driver_id)[:6].upper()}"
    driver.license_expiry = payload.license_expiry or "2028-12-31"
    driver.status = payload.status or "Available"
    db.commit()
    db.refresh(driver)

    return {
        "driver_id": str(driver.driver_id),
        "user_id": str(user.user_id),
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "status": driver.status,
    }


@router.put("/{driver_id}")
def update_driver(
    driver_id: UUID,
    payload: DriverUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Update driver details, license info, or status."""
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    user = db.query(User).filter(User.user_id == driver.user_id).first()

    if payload.full_name and user:
        user.full_name = payload.full_name.strip()
    if payload.phone and user:
        user.phone = payload.phone
    if payload.email and user:
        user.email = payload.email.strip().lower()

    if payload.license_number is not None:
        driver.license_number = payload.license_number
    if payload.license_expiry is not None:
        driver.license_expiry = payload.license_expiry
    if payload.status is not None:
        driver.status = payload.status

    db.commit()
    return {"message": "Driver updated successfully"}


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Deactivate or remove driver."""
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    user = db.query(User).filter(User.user_id == driver.user_id).first()
    db.delete(driver)
    if user:
        db.delete(user)
    db.commit()
    return None
