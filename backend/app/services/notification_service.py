"""
Centralized Notification Dispatcher Service.
Implements the Milestone 4 role-based notification workflow:
- Admin: Receives all system-level notifications fleet-wide.
- Fleet Manager: Receives operational notifications (maintenance, driver assignment, shipment status).
- Dispatcher: Receives shipment-specific notifications (status changes, delays, route recalculation, delivery).
- Driver: Receives ONLY notifications relevant to their assigned vehicle, trip, or shipment.
- Enforces database idempotency to prevent duplicate in-app notifications and duplicate emails.
"""

import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict
from sqlalchemy.orm import Session

from app.models.user import User, RoleEnum
from app.models.notification import Notification
from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.shipment import Shipment
from app.models.trip import Trip
from app.core.email import send_email
from app.tasks.maintenance import is_valid_real_email

logger = logging.getLogger(__name__)


def get_recipients_for_event(
    db: Session,
    event_type: str,
    vehicle_id: Optional[uuid.UUID] = None,
    shipment_id: Optional[uuid.UUID] = None,
    trip_id: Optional[uuid.UUID] = None,
    driver_user_id: Optional[uuid.UUID] = None,
) -> Dict[uuid.UUID, User]:
    """
    Resolves the exact recipient users based on the event type and role matrix.
    Returns a dictionary of {user_id: User} to guarantee deduplication.
    """
    recipients: Dict[uuid.UUID, User] = {}

    # Query active role-based users from DB
    admins = db.query(User).filter(User.role == RoleEnum.Admin).all()
    fleet_managers = db.query(User).filter(User.role == RoleEnum.FleetManager).all()
    dispatchers = db.query(User).filter(User.role == RoleEnum.Dispatcher).all()

    # 1. Admin receives all system-level events fleet-wide
    for a in admins:
        recipients[a.user_id] = a

    # 2. Fleet Manager receives operational events
    for fm in fleet_managers:
        recipients[fm.user_id] = fm

    # 3. Dispatcher receives shipment-related events and maintenance visibility
    if event_type in [
        "shipment_delivered",
        "shipment_delayed",
        "shipment_cancelled",
        "route_recalculated",
        "maintenance_scheduled",
        "maintenance_alert",
        "driver_assigned",
        "trip_assigned",
        "shipment_assigned",
    ]:
        for d in dispatchers:
            recipients[d.user_id] = d

    # 4. Driver: Scoped ONLY to their own assignments
    # Case A: Explicit driver_user_id passed
    if driver_user_id:
        driver_user = db.query(User).filter(User.user_id == driver_user_id).first()
        if driver_user and driver_user.role == RoleEnum.Driver:
            recipients[driver_user.user_id] = driver_user

    # Case B: Driver assigned to the vehicle (for maintenance or vehicle assignment alerts)
    if vehicle_id:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
        if veh and veh.assigned_driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == veh.assigned_driver_id).first()
            if drv and drv.user_id:
                driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
                if driver_user:
                    recipients[driver_user.user_id] = driver_user

    # Case C: Driver assigned to the shipment/trip
    if shipment_id:
        shp = db.query(Shipment).filter(Shipment.shipment_id == shipment_id).first()
        if shp and shp.driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == shp.driver_id).first()
            if drv and drv.user_id:
                driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
                if driver_user:
                    recipients[driver_user.user_id] = driver_user

    if trip_id:
        trp = db.query(Trip).filter(Trip.trip_id == trip_id).first()
        if trp and trp.driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == trp.driver_id).first()
            if drv and drv.user_id:
                driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
                if driver_user:
                    recipients[driver_user.user_id] = driver_user

    return recipients


def dispatch_system_notification(
    db: Session,
    title: str,
    message: str,
    event_type: str = "system",
    notification_type: str = "general",
    vehicle_id: Optional[uuid.UUID] = None,
    maintenance_id: Optional[uuid.UUID] = None,
    shipment_id: Optional[uuid.UUID] = None,
    trip_id: Optional[uuid.UUID] = None,
    driver_user_id: Optional[uuid.UUID] = None,
    sender_id: Optional[uuid.UUID] = None,
    sender_name: str = "FleetFlow System",
    sender_role: str = "Fleet Manager",
    send_email_alert: bool = True,
) -> int:
    """
    Dispatches in-app notifications and optional email alerts to all authorized recipients.
    Enforces idempotency to prevent duplicate notification creation.
    Returns count of new notifications created.
    """
    now = datetime.utcnow()
    recipients = get_recipients_for_event(
        db=db,
        event_type=event_type,
        vehicle_id=vehicle_id,
        shipment_id=shipment_id,
        trip_id=trip_id,
        driver_user_id=driver_user_id,
    )

    created_count = 0

    for uid, user in recipients.items():
        # Check database-level duplicate prevention for this event
        existing_query = db.query(Notification).filter(
            Notification.user_id == uid,
            Notification.title == title,
            Notification.type == event_type,
        )
        if maintenance_id:
            existing_query = existing_query.filter(Notification.maintenance_id == maintenance_id)
        if shipment_id:
            existing_query = existing_query.filter(Notification.shipment_id == shipment_id)
        if trip_id:
            existing_query = existing_query.filter(Notification.trip_id == trip_id)

        existing = existing_query.first()
        if existing:
            continue

        email_status = "Pending"
        email_sent_at = None
        email_error = None

        if send_email_alert and user.email and is_valid_real_email(user.email):
            try:
                email_html = (
                    f"<div style='font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; color: #1e293b;'>"
                    f"<h2 style='color: #2563eb; margin-top: 0;'>{title}</h2>"
                    f"<div style='background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;'>"
                    f"<p style='margin: 6px 0; font-size: 14px; font-weight: 500;'>{message}</p>"
                    f"<p style='margin: 6px 0; font-size: 12px; color: #64748b;'><strong>Sender:</strong> {sender_name} ({sender_role})</p>"
                    f"</div>"
                    f"<p style='font-size: 11px; color: #94a3b8; margin-top: 20px;'>FleetFlow Automated Logistics & Fleet Management System</p>"
                    f"</div>"
                )
                send_email(subject=f"FleetFlow Alert: {title}", recipient=user.email, body=message, html=email_html)
                email_status = "Sent"
                email_sent_at = now
            except Exception as ex:
                email_status = "Failed"
                email_error = str(ex)
        else:
            email_status = "Skipped"

        notif = Notification(
            notification_id=uuid.uuid4(),
            user_id=uid,
            sender_id=sender_id,
            sender_name=sender_name,
            sender_role=sender_role,
            vehicle_id=vehicle_id,
            maintenance_id=maintenance_id,
            shipment_id=shipment_id,
            trip_id=trip_id,
            title=title,
            message=message,
            type=event_type,
            notification_type=notification_type,
            recipient_email=user.email,
            email_status=email_status,
            email_sent_at=email_sent_at,
            email_error=email_error,
            sent_at=now,
            is_read=False,
            created_at=now,
        )
        db.add(notif)
        created_count += 1

    if created_count > 0:
        db.commit()

    return created_count
