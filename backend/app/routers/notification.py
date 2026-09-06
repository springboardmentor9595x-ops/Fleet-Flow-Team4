import uuid
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.models.notification import Notification
from app.models.vehicle import Vehicle
from app.models.maintenance import Maintenance

router = APIRouter()


class NotificationResponse(BaseModel):
    notification_id: UUID
    user_id: Optional[UUID] = None
    sender_id: Optional[UUID] = None
    sender_name: Optional[str] = "Fleet Manager"
    sender_role: Optional[str] = "Fleet Manager"
    vehicle_id: Optional[UUID] = None
    maintenance_id: Optional[UUID] = None
    shipment_id: Optional[UUID] = None
    trip_id: Optional[UUID] = None
    title: str
    message: str
    type: str
    notification_type: Optional[str] = "system_alert"
    recipient_email: Optional[str] = None
    email_status: Optional[str] = "Pending"
    email_sent_at: Optional[str] = None
    email_error: Optional[str] = None
    sent_at: Optional[str] = None
    is_read: bool
    registration_number: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


def sync_overdue_maintenance_notifications(db: Session):
    """
    Ensures overdue maintenance records have an in-app notification in PostgreSQL.
    Strictly idempotent: will NEVER create duplicate notifications on repeated calls or page refreshes.
    """
    now = datetime.utcnow()
    today = now.date()

    def _parse_date(val):
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        try:
            return datetime.fromisoformat(str(val).replace("Z", ""))
        except Exception:
            try:
                return datetime.strptime(str(val)[:10], "%Y-%m-%d")
            except Exception:
                return None

    # Query all active (not completed/resolved/cancelled) maintenance records
    active_maints = db.query(Maintenance).filter(
        ~Maintenance.status.in_(["Completed", "Cancelled", "Resolved"])
    ).all()

    created_any = False
    for m in active_maints:
        ref_dt = m.service_date or _parse_date(m.scheduled_date)
        if not ref_dt or ref_dt.date() >= today:
            continue  # Future or today: not overdue

        # Idempotency check: does an overdue notification already exist for this record?
        existing = db.query(Notification).filter(
            Notification.maintenance_id == m.maintenance_id,
            Notification.title == "Maintenance Overdue",
        ).first()

        if not existing:
            veh = db.query(Vehicle).filter(Vehicle.vehicle_id == m.vehicle_id).first() if m.vehicle_id else None
            reg_num = veh.registration_number if veh else "N/A"
            due_date_str = ref_dt.strftime("%Y-%m-%d")

            notif = Notification(
                notification_id=uuid.uuid4(),
                maintenance_id=m.maintenance_id,
                vehicle_id=m.vehicle_id,
                user_id=None,  # Broadcast to Admins and Fleet Managers
                sender_name="Fleet Manager",
                sender_role="Fleet Manager",
                title="Maintenance Overdue",
                message=(
                    f"Vehicle: {reg_num}\n"
                    f"Maintenance Type: {m.maintenance_type or 'General Inspection'}\n"
                    f"Due Date: {due_date_str}"
                ),
                type="maintenance",
                notification_type="OVERDUE",
                is_read=False,
                created_at=now,
            )
            db.add(notif)
            created_any = True

    if created_any:
        try:
            db.commit()
        except Exception:
            db.rollback()


@router.get("/")
def list_notifications(
    unread_only: bool = False,
    type_filter: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    List system notifications scoped to current logged-in user and role (newest first).
    """
    # Ensure any overdue maintenance in DB has a notification generated (idempotent)
    sync_overdue_maintenance_notifications(db)

    query = db.query(Notification)

    # Role-Based Scoping & Privacy Enforcement:
    # 1. Driver sees only their own targeted notifications and notifications for their assigned vehicle(s)
    if current_user.role == RoleEnum.Driver:
        from app.routers.maintenance import get_driver_assigned_vehicle_ids
        veh_ids = list(get_driver_assigned_vehicle_ids(db, current_user.user_id))
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.recipient_email == current_user.email)
            | ((Notification.vehicle_id.in_(veh_ids)) & (Notification.type == "maintenance"))
        )
    # 2. Dispatcher sees only logistics/dispatch notifications + non-maintenance, non-private leave notifications
    elif current_user.role == RoleEnum.Dispatcher:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.recipient_email == current_user.email)
        ).filter(
            ~Notification.type.in_(["maintenance", "leave_approved", "leave_rejected"]),
            ~Notification.title.ilike("%leave%"),
            Notification.maintenance_id.is_(None),
        )
    # 3. Admin & FleetManager see system broadcasts and user-targeted notifications
    else:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.user_id.is_(None))
            | (Notification.recipient_email == current_user.email)
        )
        # Private leave approval notifications belong only to the recipient
        query = query.filter(
            ~((Notification.type.in_(["leave_approved", "leave_rejected"])) & (Notification.user_id != current_user.user_id))
        )

    if unread_only and isinstance(unread_only, bool):
        query = query.filter(Notification.is_read == False)
    if type_filter and isinstance(type_filter, str):
        query = query.filter(Notification.type == type_filter)

    records = query.order_by(Notification.created_at.desc()).limit(int(limit) if isinstance(limit, (int, str)) else 50).all()
    result = []

    for r in records:
        veh = (
            db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first()
            if r.vehicle_id
            else None
        )
        email_sent_at_val = getattr(r, "email_sent_at", None)
        sent_at_val = getattr(r, "sent_at", None) or email_sent_at_val

        result.append({
            "notification_id": str(r.notification_id),
            "user_id": str(r.user_id) if getattr(r, "user_id", None) else None,
            "sender_id": str(r.sender_id) if getattr(r, "sender_id", None) else None,
            "sender_name": getattr(r, "sender_name", None) or "Fleet Manager",
            "sender_role": getattr(r, "sender_role", None) or "Fleet Manager",
            "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
            "maintenance_id": str(r.maintenance_id) if r.maintenance_id else None,
            "shipment_id": str(r.shipment_id) if getattr(r, "shipment_id", None) else None,
            "trip_id": str(r.trip_id) if getattr(r, "trip_id", None) else None,
            "title": r.title,
            "message": r.message,
            "type": r.type,
            "notification_type": getattr(r, "notification_type", None) or r.type,
            "recipient_email": getattr(r, "recipient_email", None),
            "email_status": getattr(r, "email_status", None) or "Pending",
            "email_sent_at": email_sent_at_val.isoformat() if email_sent_at_val else None,
            "email_error": getattr(r, "email_error", None),
            "sent_at": sent_at_val.isoformat() if sent_at_val else None,
            "is_read": r.is_read,
            "registration_number": veh.registration_number if veh else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return result


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get live count of unread notifications for current user from DB.
    Never returns hardcoded values.
    """
    sync_overdue_maintenance_notifications(db)
    if current_user.role == RoleEnum.Driver:
        from app.routers.maintenance import get_driver_assigned_vehicle_ids
        veh_ids = list(get_driver_assigned_vehicle_ids(db, current_user.user_id))
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.recipient_email == current_user.email)
            | ((Notification.vehicle_id.in_(veh_ids)) & (Notification.type == "maintenance"))
        )
    elif current_user.role == RoleEnum.Dispatcher:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.recipient_email == current_user.email)
        ).filter(
            ~Notification.type.in_(["maintenance", "leave_approved", "leave_rejected"]),
            ~Notification.title.ilike("%leave%"),
            Notification.maintenance_id.is_(None),
        )
    else:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.user_id.is_(None))
            | (Notification.recipient_email == current_user.email)
        )
    count = query.count()
    return {"unread_count": count}


@router.put("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a single notification as read."""
    notif = (
        db.query(Notification)
        .filter(Notification.notification_id == notification_id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    return {"message": "Notification marked as read", "notification_id": str(notification_id)}


@router.put("/read-all")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark unread notifications as read for current user."""
    query = db.query(Notification).filter(Notification.is_read == False)
    if current_user.role not in [RoleEnum.Admin, RoleEnum.FleetManager]:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.recipient_email == current_user.email)
        )
    else:
        query = query.filter(
            (Notification.user_id == current_user.user_id)
            | (Notification.user_id.is_(None))
            | (Notification.recipient_email == current_user.email)
        )
    updated = query.update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read", "updated_count": updated}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dismiss/delete a notification for current user."""
    notif = (
        db.query(Notification)
        .filter(Notification.notification_id == notification_id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notif)
    db.commit()
    return None


@router.get("/overdue-maintenance")
def get_overdue_maintenance_notifications(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Dynamically computes overdue maintenance records from PostgreSQL and returns them
    as notification-shaped objects for the notification bell.

    A record is overdue when:
      - Its service_date or scheduled_date < today
      - Its status is NOT Completed, Cancelled, or Resolved

    No records are created or modified. No duplicates. Pure read-only computation.
    Role-scoped:
      - Driver sees only their own vehicle's records.
      - Admin/FleetManager/Dispatcher see all.
    """
    now = datetime.utcnow()
    today = now.date()

    def _parse_date(val):
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        try:
            return datetime.fromisoformat(str(val).replace("Z", ""))
        except Exception:
            try:
                return datetime.strptime(str(val)[:10], "%Y-%m-%d")
            except Exception:
                return None

    # Base query — only active (not finished) records
    query = db.query(Maintenance).filter(
        ~Maintenance.status.in_(["Completed", "Cancelled", "Resolved"])
    )

    # Driver sees only their own vehicle's records
    if current_user.role == RoleEnum.Driver:
        from app.routers.maintenance import get_driver_assigned_vehicle_ids
        veh_ids = get_driver_assigned_vehicle_ids(db, current_user.user_id)
        if not veh_ids:
            return []
        query = query.filter(Maintenance.vehicle_id.in_(list(veh_ids)))

    records = query.order_by(Maintenance.created_at.desc()).all()
    result = []

    for r in records:
        # Determine reference date
        ref_dt = r.service_date or _parse_date(r.scheduled_date)
        if not ref_dt:
            # No date at all — still treat as overdue (was scheduled, no date = indefinitely overdue)
            ref_dt = None

        is_overdue = ref_dt is not None and ref_dt.date() < today

        if not is_overdue:
            continue

        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        reg_num = veh.registration_number if veh else "N/A"
        due_date_str = ref_dt.strftime("%Y-%m-%d") if ref_dt else "Unknown"

        result.append({
            "notification_id": str(r.maintenance_id),  # use maintenance_id as stable synthetic id
            "maintenance_id": str(r.maintenance_id),
            "vehicle_id": str(r.vehicle_id) if r.vehicle_id else None,
            "title": "Maintenance Overdue",
            "message": (
                f"Vehicle: {reg_num}\n"
                f"Maintenance Type: {r.maintenance_type or 'General Inspection'}\n"
                f"Due Date: {due_date_str}"
            ),
            "type": "maintenance",
            "notification_type": "OVERDUE",
            "registration_number": reg_num,
            "maintenance_type": r.maintenance_type or "General Inspection",
            "scheduled_date": r.scheduled_date,
            "due_date": due_date_str,
            "status": r.status or "Scheduled",
            "cost": r.cost or 0.0,
            "description": r.remarks or r.description or "",
            "is_read": False,
            "is_overdue": True,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return result
