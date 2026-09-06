import uuid
from typing import Optional, Union
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import hash_password
from app.models.driver import Driver
from app.models.user import User, RoleEnum
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.trip import Trip, TripStatusEnum
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.fuel_record import FuelRecord
from app.models.attendance import Attendance
from app.models.notification import Notification

router = APIRouter()


class DriverCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    status: Optional[str] = "Available"
    password: Optional[str] = "driver123"
    assigned_vehicle_id: Optional[Union[UUID, str]] = None


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    status: Optional[str] = None
    assigned_vehicle_id: Optional[Union[UUID, str]] = None


class DriverAssignPayload(BaseModel):
    vehicle_id: UUID


def format_driver_response(d: Driver, db: Session):
    user = db.query(User).filter(User.user_id == d.user_id).first()

    # Check active trip for driver
    active_trip = (
        db.query(Trip)
        .filter(
            Trip.driver_id == d.driver_id,
            Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
        )
        .first()
    )

    # Check assigned vehicle
    assigned_veh = (
        db.query(Vehicle)
        .filter(Vehicle.assigned_driver_id == d.driver_id)
        .first()
    )

    # Dynamic status check
    driver_status = getattr(d, "status", None) or "Available"
    if active_trip and active_trip.status == TripStatusEnum.Active:
        driver_status = "On Trip"

    return {
        "driver_id": str(d.driver_id),
        "user_id": str(d.user_id) if d.user_id else None,
        "full_name": user.full_name if user else "Driver",
        "email": user.email if user else "N/A",
        "phone": user.phone if user else "N/A",
        "license_number": getattr(d, "license_number", None)
        or f"LIC-{str(d.driver_id)[:6].upper()}",
        "license_expiry": getattr(d, "license_expiry", None) or "2028-12-31",
        "status": driver_status,
        "assigned_vehicle_id": str(assigned_veh.vehicle_id) if assigned_veh else None,
        "assigned_vehicle": assigned_veh.registration_number if assigned_veh else "None",
        "assigned_vehicle_model": f"{assigned_veh.brand} {assigned_veh.model}" if assigned_veh else "None",
        "current_trip_id": str(active_trip.trip_id) if active_trip else None,
        "current_trip": f"{active_trip.start_location} → {active_trip.destination}"
        if active_trip and hasattr(active_trip, "start_location")
        else ("Active Trip" if active_trip else "None"),
    }


@router.get("/")
def list_drivers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Retrieve driver list with role enforcement.
    - Admin, FleetManager, Dispatcher: See all drivers.
    - Driver: See ONLY their own driver profile.
    """
    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver:
            return []
        return [format_driver_response(driver, db)]

    drivers = db.query(Driver).all()
    return [format_driver_response(d, db) for d in drivers]


@router.get("/available")
def list_available_drivers(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """List drivers who are Available and not currently on an active trip."""
    drivers = db.query(Driver).filter(Driver.status == "Available").all()
    result = []
    for d in drivers:
        active_trip = (
            db.query(Trip)
            .filter(
                Trip.driver_id == d.driver_id,
                Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
            )
            .first()
        )
        if not active_trip:
            result.append(format_driver_response(d, db))
    return result


@router.get("/{driver_id}")
def get_driver_details(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Retrieve single driver details.
    Role enforcement: Driver can only view their own driver profile.
    """
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if current_user.role == RoleEnum.Driver and driver.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not enough permissions to view other drivers")

    return format_driver_response(driver, db)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Create a new driver account and profile (Admin and Fleet Manager only)."""
    # 1. Pre-validate vehicle if provided
    target_vehicle = None
    if payload.assigned_vehicle_id:
        raw_val = str(payload.assigned_vehicle_id).strip()
        if raw_val and raw_val.lower() != "none":
            try:
                target_uuid = UUID(raw_val)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid vehicle UUID")

            target_vehicle = (
                db.query(Vehicle).filter(Vehicle.vehicle_id == target_uuid).first()
            )
            if not target_vehicle:
                raise HTTPException(status_code=404, detail="Selected vehicle not found")
            if target_vehicle.status == VehicleStatusEnum.Maintenance:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot assign driver to a vehicle currently undergoing maintenance",
                )
            if target_vehicle.assigned_driver_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Vehicle '{target_vehicle.registration_number}' is already assigned to another driver",
                )

    existing_user = (
        db.query(User).filter(User.email == payload.email.strip().lower()).first()
    )
    if existing_user:
        user = existing_user
        if payload.full_name:
            user.full_name = payload.full_name.strip()
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

    driver.license_number = (
        payload.license_number or f"LIC-{str(driver.driver_id)[:6].upper()}"
    )
    driver.license_expiry = payload.license_expiry or "2028-12-31"
    driver.status = payload.status or "Available"
    db.commit()
    db.refresh(driver)

    # If vehicle selected, assign it
    if target_vehicle:
        target_vehicle.assigned_driver_id = driver.driver_id
        if target_vehicle.status == VehicleStatusEnum.Available:
            target_vehicle.status = VehicleStatusEnum.Assigned
        db.commit()
        db.refresh(target_vehicle)

        from app.services.notification_service import dispatch_system_notification
        driver_name = user.full_name if user else "Driver"
        dispatch_system_notification(
            db=db,
            title=f"Driver Assigned to Vehicle {target_vehicle.registration_number}",
            message=f"Driver {driver_name} has been registered and assigned to vehicle {target_vehicle.registration_number} ({target_vehicle.brand} {target_vehicle.model}).",
            event_type="driver_assigned",
            vehicle_id=target_vehicle.vehicle_id,
            driver_user_id=driver.user_id,
            sender_id=current_user.user_id,
            sender_name=current_user.full_name,
            sender_role=current_user.role.value,
        )

    return format_driver_response(driver, db)


@router.put("/{driver_id}")
def update_driver(
    driver_id: UUID,
    payload: DriverUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Update driver details (Admin and Fleet Manager only)."""
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

    if payload.assigned_vehicle_id is not None:
        raw_val = str(payload.assigned_vehicle_id).strip()
        if not raw_val or raw_val.lower() == "none":
            # Unassign all vehicles currently assigned to this driver
            prev_vehs = db.query(Vehicle).filter(Vehicle.assigned_driver_id == driver.driver_id).all()
            for pv in prev_vehs:
                pv.assigned_driver_id = None
                if pv.status == VehicleStatusEnum.Assigned:
                    pv.status = VehicleStatusEnum.Available
        else:
            try:
                target_uuid = UUID(raw_val)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid vehicle UUID")

            target_vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == target_uuid).first()
            if not target_vehicle:
                raise HTTPException(status_code=404, detail="Selected vehicle not found")
            if target_vehicle.status == VehicleStatusEnum.Maintenance:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot assign driver to a vehicle currently undergoing maintenance",
                )
            if target_vehicle.assigned_driver_id and target_vehicle.assigned_driver_id != driver.driver_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Vehicle '{target_vehicle.registration_number}' is already assigned to another driver",
                )

            # Unassign driver from other vehicles
            prev_vehs = db.query(Vehicle).filter(Vehicle.assigned_driver_id == driver.driver_id).all()
            for pv in prev_vehs:
                if pv.vehicle_id != target_vehicle.vehicle_id:
                    pv.assigned_driver_id = None
                    if pv.status == VehicleStatusEnum.Assigned:
                        pv.status = VehicleStatusEnum.Available

            # Assign new vehicle
            target_vehicle.assigned_driver_id = driver.driver_id
            if target_vehicle.status == VehicleStatusEnum.Available:
                target_vehicle.status = VehicleStatusEnum.Assigned

    db.commit()
    db.refresh(driver)
    return format_driver_response(driver, db)


@router.put("/{driver_id}/assign")
def assign_driver_to_vehicle(
    driver_id: UUID,
    payload: DriverAssignPayload,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Assign or reassign driver to a vehicle (Admin and Fleet Manager only).
    Enforces availability and business rules.
    """
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Rule 8: Prevent assigning an unavailable driver
    active_trip = (
        db.query(Trip)
        .filter(
            Trip.driver_id == driver.driver_id,
            Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
        )
        .first()
    )
    if driver.status in ["Off Duty", "Inactive"] or active_trip:
        raise HTTPException(
            status_code=400,
            detail="Cannot assign an unavailable driver (Driver is currently Off Duty, Inactive, or on an Active Trip)",
        )

    # Check target vehicle
    target_vehicle = (
        db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    )
    if not target_vehicle:
        raise HTTPException(status_code=404, detail="Target vehicle not found")

    # Rule 9: Check vehicle status
    if target_vehicle.status == VehicleStatusEnum.Maintenance:
        raise HTTPException(
            status_code=400,
            detail="Cannot assign driver to a vehicle currently undergoing maintenance",
        )

    # Unassign driver from previous vehicle if currently assigned to another
    prev_assigned_veh = (
        db.query(Vehicle)
        .filter(Vehicle.assigned_driver_id == driver.driver_id)
        .first()
    )
    if prev_assigned_veh and prev_assigned_veh.vehicle_id != target_vehicle.vehicle_id:
        prev_assigned_veh.assigned_driver_id = None
        if prev_assigned_veh.status == VehicleStatusEnum.Assigned:
            prev_assigned_veh.status = VehicleStatusEnum.Available

    # Reassign target vehicle if currently assigned to another driver
    if (
        target_vehicle.assigned_driver_id
        and target_vehicle.assigned_driver_id != driver.driver_id
    ):
        prev_driver = (
            db.query(Driver)
            .filter(Driver.driver_id == target_vehicle.assigned_driver_id)
            .first()
        )
        target_vehicle.assigned_driver_id = None

    # Link driver to target vehicle
    target_vehicle.assigned_driver_id = driver.driver_id
    if target_vehicle.status == VehicleStatusEnum.Available:
        target_vehicle.status = VehicleStatusEnum.Assigned

    db.commit()
    db.refresh(driver)
    db.refresh(target_vehicle)

    from app.services.notification_service import dispatch_system_notification
    driver_user = db.query(User).filter(User.user_id == driver.user_id).first() if driver.user_id else None
    driver_name = driver_user.full_name if driver_user else "Driver"

    dispatch_system_notification(
        db=db,
        title=f"Driver Assigned to Vehicle {target_vehicle.registration_number}",
        message=f"Driver {driver_name} has been assigned to vehicle {target_vehicle.registration_number} ({target_vehicle.brand} {target_vehicle.model}).",
        event_type="driver_assigned",
        vehicle_id=target_vehicle.vehicle_id,
        driver_user_id=driver.user_id,
        sender_id=current_user.user_id,
        sender_name=current_user.full_name,
        sender_role=current_user.role.value,
    )

    return {
        "message": f"Driver assigned to vehicle {target_vehicle.registration_number} successfully",
        "driver": format_driver_response(driver, db),
        "assigned_vehicle": {
            "vehicle_id": str(target_vehicle.vehicle_id),
            "registration_number": target_vehicle.registration_number,
            "status": target_vehicle.status,
        },
    }



@router.put("/{driver_id}/unassign")
def unassign_driver_from_vehicle(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Unassign driver from currently assigned vehicle (Admin and Fleet Manager only)."""
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    assigned_veh = (
        db.query(Vehicle)
        .filter(Vehicle.assigned_driver_id == driver.driver_id)
        .first()
    )

    if not assigned_veh:
        return {"message": "Driver is not currently assigned to any vehicle"}

    assigned_veh.assigned_driver_id = None
    if assigned_veh.status == VehicleStatusEnum.Assigned:
        assigned_veh.status = VehicleStatusEnum.Available

    db.commit()
    return {
        "message": f"Driver unassigned from vehicle {assigned_veh.registration_number} successfully",
        "driver": format_driver_response(driver, db),
    }


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Safely delete a driver profile (Admin and Fleet Manager only).
    Preserves all historical operational records (Trips, Shipments, Fuel Refills, Notifications)
    by nullifying the foreign-key references safely before removal.
    """
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # 1. Unassign all vehicles assigned to this driver and set status back to Available
    assigned_vehicles = db.query(Vehicle).filter(Vehicle.assigned_driver_id == driver.driver_id).all()
    for veh in assigned_vehicles:
        veh.assigned_driver_id = None
        if veh.status == VehicleStatusEnum.Assigned:
            veh.status = VehicleStatusEnum.Available

    # 2. Preserve trips: safely nullify driver_id
    db.query(Trip).filter(Trip.driver_id == driver.driver_id).update(
        {Trip.driver_id: None}, synchronize_session=False
    )

    # 3. Preserve shipments: safely nullify driver_id
    db.query(Shipment).filter(Shipment.driver_id == driver.driver_id).update(
        {Shipment.driver_id: None}, synchronize_session=False
    )

    # 4. Preserve fuel records: safely nullify driver_id
    db.query(FuelRecord).filter(FuelRecord.driver_id == driver.driver_id).update(
        {FuelRecord.driver_id: None}, synchronize_session=False
    )

    # 5. Clean up attendance records for this driver
    db.query(Attendance).filter(Attendance.driver_id == driver.driver_id).delete(
        synchronize_session=False
    )

    # 6. Safely handle the associated user account if one exists
    if driver.user_id:
        user = db.query(User).filter(User.user_id == driver.user_id).first()
        driver.user_id = None
        db.flush()
        if user and user.role == RoleEnum.Driver:
            # Preserve / clean up notifications and status histories referencing this user
            db.query(Notification).filter(Notification.user_id == user.user_id).delete(
                synchronize_session=False
            )
            db.query(Notification).filter(Notification.sender_id == user.user_id).update(
                {Notification.sender_id: None}, synchronize_session=False
            )
            db.query(ShipmentStatusHistory).filter(ShipmentStatusHistory.updated_by == user.user_id).update(
                {ShipmentStatusHistory.updated_by: None}, synchronize_session=False
            )
            db.delete(user)

    # 7. Delete driver record
    db.delete(driver)
    db.commit()
    return None
