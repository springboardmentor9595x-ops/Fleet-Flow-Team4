import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import RoleEnum, User
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.maintenance import Maintenance, MaintenanceAlertDelivery
from app.models.notification import Notification
from app.models.trip import Trip, TripStatusEnum
from app.tasks.maintenance import dispatch_maintenance_alert

router = APIRouter()

VALID_MAINTENANCE_TYPES = [
    "Oil Change",
    "Tire Replacement",
    "Tyre Replacement",
    "Engine Service",
    "Brake Service",
    "General Inspection",
    "Battery Service",
]


class MaintenanceCreate(BaseModel):
    vehicle_id: UUID
    maintenance_type: str = "General Inspection"
    scheduled_date: Optional[str] = None
    service_date: Optional[str] = None
    next_service_date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None
    cost: Optional[float] = 0.0
    status: Optional[str] = "Scheduled"


class MaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = None
    scheduled_date: Optional[str] = None
    service_date: Optional[str] = None
    next_service_date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None
    cost: Optional[float] = None
    status: Optional[str] = None


def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val
    try:
        return datetime.fromisoformat(str(date_val).replace("Z", ""))
    except Exception:
        try:
            return datetime.strptime(str(date_val)[:10], "%Y-%m-%d")
        except Exception:
            return None


def format_maintenance_record(r: Maintenance, veh: Optional[Vehicle] = None):
    svc_date = r.service_date or parse_date(r.scheduled_date)
    nxt_date = r.next_service_date
    
    # Fallback compute next_service_date if missing (e.g. 90 days after service_date)
    if not nxt_date and svc_date:
        nxt_date = svc_date + timedelta(days=90)

    now = datetime.utcnow()
    is_overdue = False
    is_upcoming = False

    if r.status not in ["Completed", "Cancelled", "Resolved"]:
        ref_date = svc_date or nxt_date
        if ref_date:
            today = now.date()
            ref_day = ref_date.date()
            if ref_day < today:
                is_overdue = True
            elif 0 <= (ref_day - today).days <= 7:
                is_upcoming = True

    reg_no = veh.registration_number if veh else "N/A"
    brand = veh.brand if veh else "N/A"
    model = f"{veh.brand} {veh.model}" if (veh and veh.brand and veh.model) else (veh.model if veh else "N/A")

    # Determine actual email notification delivery status from DB model fields
    email_status = "Pending"
    if getattr(r, "deliveries", None):
        latest_del = sorted(r.deliveries, key=lambda d: d.created_at or datetime.min, reverse=True)[0]
        email_status = latest_del.status or ("Sent" if getattr(r, "notification_count", 0) > 0 else "Pending")
    elif getattr(r, "notification_count", 0) > 0:
        email_status = "Sent"
    elif getattr(r, "notified_5_days", False) or getattr(r, "notified_1_day", False) or getattr(r, "notified_1_hour", False):
        email_status = "Sent"

    return {
        "id": str(r.maintenance_id),
        "maintenance_id": str(r.maintenance_id),
        "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
        "vehicle_registration": reg_no,
        "registration_number": reg_no,
        "brand": brand,
        "model": model,
        "maintenance_type": r.maintenance_type or "General Inspection",
        "scheduled_date": r.scheduled_date or (svc_date.strftime("%Y-%m-%d") if svc_date else None),
        "service_date": svc_date.isoformat() if svc_date else r.scheduled_date,
        "next_service_date": nxt_date.isoformat() if nxt_date else None,
        "description": r.remarks or r.description or "Routine Maintenance",
        "remarks": r.remarks or r.description or "",
        "cost": r.cost or 0.0,
        "status": r.status or "Scheduled",
        "is_overdue": is_overdue,
        "is_upcoming": is_upcoming,
        "email_status": email_status,
        "notified_5_days": getattr(r, "notified_5_days", False),
        "notified_1_day": getattr(r, "notified_1_day", False),
        "last_notification_date": r.last_notification_date.isoformat() if getattr(r, "last_notification_date", None) else None,
        "notification_count": getattr(r, "notification_count", 0),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def update_vehicle_status_for_maintenance(
    db: Session, vehicle_id: UUID, maintenance_status: str, exclude_maintenance_id=None
):
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        return

    if maintenance_status in ["Scheduled", "In Progress"]:
        vehicle.status = VehicleStatusEnum.Maintenance
    elif maintenance_status in ["Completed", "Cancelled", "Resolved"]:
        # Check if vehicle has OTHER active maintenance records (exclude current record)
        other_active_q = db.query(Maintenance).filter(
            Maintenance.vehicle_id == vehicle_id,
            Maintenance.status.in_(["Scheduled", "In Progress"])
        )
        if exclude_maintenance_id:
            other_active_q = other_active_q.filter(
                Maintenance.maintenance_id != exclude_maintenance_id
            )
        other_active = other_active_q.first()
        if other_active:
            vehicle.status = VehicleStatusEnum.Maintenance
            return

        # Check if vehicle has active or scheduled trip before setting to Available
        active_trip = db.query(Trip).filter(
            Trip.vehicle_id == vehicle_id,
            Trip.status.in_([TripStatusEnum.Active, TripStatusEnum.Scheduled])
        ).first()

        if active_trip:
            if active_trip.status == TripStatusEnum.Active:
                vehicle.status = VehicleStatusEnum.InTransit
            else:
                vehicle.status = VehicleStatusEnum.Assigned
        else:
            vehicle.status = VehicleStatusEnum.Available


def get_driver_assigned_vehicle_ids(db: Session, user_id: UUID) -> set:
    """
    Resolves all vehicle IDs assigned to the driver using real database foreign keys:
    1. Direct Vehicle assignment: Vehicle.assigned_driver_id == driver.driver_id or Vehicle.assigned_driver_id == driver.user_id
    2. Active / Scheduled Trip assignment: Trip.driver_id == driver.driver_id -> Trip.vehicle_id
    3. Active / Assigned Shipment assignment: Shipment.driver_id == driver.driver_id -> Shipment.vehicle_id
    """
    from app.models.driver import Driver
    from app.models.trip import Trip, TripStatusEnum
    from app.models.shipment import Shipment, ShipmentStatusEnum

    driver = db.query(Driver).filter(Driver.user_id == user_id).first()
    if not driver:
        return set()

    veh_ids = set()

    # 1. Direct assignment in vehicles table
    direct_vehs = db.query(Vehicle).filter(
        (Vehicle.assigned_driver_id == driver.driver_id)
        | (Vehicle.assigned_driver_id == driver.user_id)
    ).all()
    for v in direct_vehs:
        veh_ids.add(v.vehicle_id)

    # 2. Trip assignment
    trips = db.query(Trip).filter(
        Trip.driver_id == driver.driver_id,
        Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
    ).all()
    for t in trips:
        if t.vehicle_id:
            veh_ids.add(t.vehicle_id)

    # 3. Shipment assignment
    shipments = db.query(Shipment).filter(
        Shipment.driver_id == driver.driver_id,
        Shipment.status.in_([ShipmentStatusEnum.Assigned, ShipmentStatusEnum.InTransit]),
    ).all()
    for s in shipments:
        if s.vehicle_id:
            veh_ids.add(s.vehicle_id)

    return veh_ids


@router.get("/")
def list_maintenance(
    vehicle_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    filter_type: Optional[str] = Query(None),
    include_overdue: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve maintenance records for the Maintenance page table.
    By default (include_overdue=False), overdue records are excluded — they appear in the
    notification bell instead. Pass include_overdue=true to include them (e.g. for export/audit).
    Accessible to Admin, FleetManager, and Dispatcher (read-only); Driver (assigned vehicle only).
    """
    query = db.query(Maintenance)

    if current_user.role == RoleEnum.Driver:
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if not veh_ids:
            return []
        query = query.filter(Maintenance.vehicle_id.in_(list(veh_ids)))
    elif vehicle_id:
        query = query.filter(Maintenance.vehicle_id == vehicle_id)
    if status_filter and status_filter != "All":
        query = query.filter(Maintenance.status == status_filter)

    records = query.order_by(Maintenance.created_at.desc()).all()
    result = []

    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        formatted = format_maintenance_record(r, veh)

        # By default, exclude overdue records from main table — they appear in the notification bell
        if not include_overdue and formatted["is_overdue"]:
            continue

        # Completed/Resolved/Cancelled records do not appear as active scheduled maintenance items
        is_completed = r.status in ["Completed", "Cancelled", "Resolved"]
        if filter_type != "history" and status_filter not in ["Completed", "Cancelled", "Resolved"] and is_completed:
            continue

        if filter_type == "upcoming" and not formatted["is_upcoming"]:
            continue
        if filter_type == "overdue" and not formatted["is_overdue"]:
            continue
        if filter_type == "history" and not is_completed:
            continue

        result.append(formatted)

    return result


@router.get("/upcoming")
def get_upcoming_maintenance(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all upcoming maintenance records across the fleet or driver's vehicle."""
    query = db.query(Maintenance).filter(Maintenance.status.in_(["Scheduled", "In Progress"]))
    if current_user.role == RoleEnum.Driver:
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if not veh_ids:
            return []
        query = query.filter(Maintenance.vehicle_id.in_(list(veh_ids)))

    records = query.all()
    result = []
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        fmt = format_maintenance_record(r, veh)
        if fmt["is_upcoming"] or r.status == "Scheduled":
            result.append(fmt)
    return result


@router.get("/overdue")
def get_overdue_maintenance(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all overdue maintenance records across the fleet or driver's vehicle."""
    query = db.query(Maintenance).filter(Maintenance.status.in_(["Scheduled", "In Progress"]))
    if current_user.role == RoleEnum.Driver:
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if not veh_ids:
            return []
        query = query.filter(Maintenance.vehicle_id.in_(list(veh_ids)))

    records = query.all()
    result = []
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        fmt = format_maintenance_record(r, veh)
        if fmt["is_overdue"]:
            result.append(fmt)
    return result


@router.get("/history")
def get_maintenance_history(
    vehicle_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List completed/cancelled/resolved maintenance history."""
    query = db.query(Maintenance).filter(Maintenance.status.in_(["Completed", "Cancelled", "Resolved"]))
    if current_user.role == RoleEnum.Driver:
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if not veh_ids:
            return []
        query = query.filter(Maintenance.vehicle_id.in_(list(veh_ids)))
    elif vehicle_id:
        query = query.filter(Maintenance.vehicle_id == vehicle_id)
    records = query.order_by(Maintenance.created_at.desc()).all()
    
    result = []
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        result.append(format_maintenance_record(r, veh))
    return result


@router.get("/{maintenance_id}")
def get_maintenance_details(
    maintenance_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve details for a single maintenance record."""
    m = db.query(Maintenance).filter(Maintenance.maintenance_id == maintenance_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    if current_user.role == RoleEnum.Driver:
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if m.vehicle_id not in veh_ids:
            raise HTTPException(status_code=403, detail="Not authorized to view maintenance for unassigned vehicles.")
    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == m.vehicle_id).first() if m.vehicle_id else None
    return format_maintenance_record(m, veh)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_maintenance(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Schedule a new maintenance record and set vehicle status to Maintenance. Restricted to Admin and Fleet Manager."""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle with ID '{payload.vehicle_id}' not found")

    m_type = payload.maintenance_type.strip() if payload.maintenance_type else "General Inspection"
    if m_type == "Tyre Replacement":
        m_type = "Tire Replacement"

    svc_dt = parse_date(payload.service_date or payload.scheduled_date) or datetime.utcnow()
    nxt_dt = parse_date(payload.next_service_date)
    if not nxt_dt and svc_dt:
        nxt_dt = svc_dt + timedelta(days=90)

    m = Maintenance(
        maintenance_id=uuid.uuid4(),
        vehicle_id=payload.vehicle_id,
        maintenance_type=m_type,
        scheduled_date=payload.scheduled_date or svc_dt.strftime("%Y-%m-%d"),
        service_date=svc_dt,
        next_service_date=nxt_dt,
        description=payload.remarks or payload.description or "",
        remarks=payload.remarks or payload.description or "",
        cost=payload.cost or 0.0,
        status=payload.status or "Scheduled",
        notified_5_days=False,
        notified_1_day=False,
        notified_1_hour=False,
        notification_count=0,
    )
    db.add(m)

    # Vehicle status transition
    update_vehicle_status_for_maintenance(db, payload.vehicle_id, m.status)
    db.commit()
    db.refresh(m)

    # Immediately send "SCHEDULED" notification & email (idempotent)
    try:
        dispatch_maintenance_alert(
            db=db,
            maintenance=m,
            veh=vehicle,
            alert_type="SCHEDULED",
            notif_type="SCHEDULED",
            title=f"Maintenance Scheduled: {m_type} — {vehicle.registration_number}",
            alert_type_label="Scheduled",
            additional_msg=(
                f"Vehicle {vehicle.registration_number} has a {m_type} scheduled on "
                f"{svc_dt.strftime('%B %d, %Y')}."
            ),
        )
        db.commit()
        db.refresh(m)
    except Exception as exc:
        print(f"[MAINTENANCE INITIAL ALERT] Non-fatal: {exc}")


    return format_maintenance_record(m, vehicle)


@router.put("/{maintenance_id}")
def update_maintenance(
    maintenance_id: UUID,
    payload: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Update maintenance record details or status (e.g. mark as Resolved/Completed). Restricted to Admin and Fleet Manager."""
    m = db.query(Maintenance).filter(Maintenance.maintenance_id == maintenance_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    if payload.maintenance_type is not None:
        m_type = payload.maintenance_type.strip()
        if m_type == "Tyre Replacement":
            m_type = "Tire Replacement"
        m.maintenance_type = m_type

    if payload.scheduled_date is not None:
        m.scheduled_date = payload.scheduled_date
    if payload.service_date is not None:
        new_svc = parse_date(payload.service_date)
        if new_svc and m.service_date != new_svc:
            m.service_date = new_svc
            # Reset notification flags if service date is moved
            now = datetime.utcnow()
            if (new_svc.date() - now.date()).days > 5:
                m.notified_5_days = False
                m.notified_1_day = False
                m.notified_1_hour = False
            elif (new_svc.date() - now.date()).days > 1:
                m.notified_1_day = False
                m.notified_1_hour = False

    if payload.next_service_date is not None:
        m.next_service_date = parse_date(payload.next_service_date)

    if payload.description is not None or payload.remarks is not None:
        val = payload.remarks or payload.description
        m.description = val
        m.remarks = val

    if payload.cost is not None:
        m.cost = payload.cost

    if payload.status is not None:
        m.status = payload.status
        if payload.status in ["Completed", "Resolved", "Cancelled"]:
            db.query(Notification).filter(
                Notification.maintenance_id == maintenance_id,
                Notification.title == "Maintenance Overdue"
            ).update({"is_read": True}, synchronize_session=False)

    if m.vehicle_id:
        update_vehicle_status_for_maintenance(db, m.vehicle_id, m.status, exclude_maintenance_id=m.maintenance_id)

    db.commit()
    db.refresh(m)

    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == m.vehicle_id).first() if m.vehicle_id else None
    return format_maintenance_record(m, veh)


@router.delete("/{maintenance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(
    maintenance_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """Delete a maintenance record and cleanup related notifications. Restricted to Admin and Fleet Manager."""
    m = db.query(Maintenance).filter(Maintenance.maintenance_id == maintenance_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    v_id = m.vehicle_id

    # 1. Delete dependent records (notifications & deliveries)
    db.query(Notification).filter(Notification.maintenance_id == maintenance_id).delete(synchronize_session=False)
    db.query(MaintenanceAlertDelivery).filter(MaintenanceAlertDelivery.maintenance_id == maintenance_id).delete(synchronize_session=False)

    # 2. Delete maintenance record
    db.delete(m)
    db.commit()

    # 3. Restore vehicle status if no remaining active maintenance records
    if v_id:
        remaining = db.query(Maintenance).filter(
            Maintenance.vehicle_id == v_id,
            ~Maintenance.status.in_(["Completed", "Cancelled", "Resolved"])
        ).first()
        if not remaining:
            update_vehicle_status_for_maintenance(db, v_id, "Resolved")
            db.commit()

    return None

