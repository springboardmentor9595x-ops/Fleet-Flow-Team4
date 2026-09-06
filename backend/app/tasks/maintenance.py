"""
Full Maintenance Notification System — Celery Task
=================================================
Implements the exact specification:

  Stage 1 — 5 days before service_date  -> send once (notified_5_days flag)
  Stage 2 — 1 day before service_date   -> send once (notified_1_day flag)
  Stage 3 — On / after due date, status != Resolved -> recurring daily reminder
             using last_notification_date with 23-hour cooldown (so once per day max)
  All stages stop immediately when status is Resolved / Completed / Cancelled.
  Deduplication:
    One-shot stages (5-day, 1-day) -> Boolean flags on the record + unique
    delivery row enforced by DB UniqueConstraint.
    Daily overdue reminders -> composite alert_type key includes date suffix
    e.g. "OVERDUE_2026-08-31", ensuring one row per (maintenance, email, date).
"""
import uuid
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple
from sqlalchemy.exc import IntegrityError

from app.celery_app import celery_app
from app.config import settings
from app.core.email import send_email
from app.database import SessionLocal
from app.models.maintenance import Maintenance, MaintenanceAlertDelivery
from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.notification import Notification
from app.models.user import User, RoleEnum


# ─── Email helpers ───────────────────────────────────────────────────────────
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
DISALLOWED_EMAIL_DOMAINS = {"example.com", "test.com", "invalid.com", "sample.com"}


def is_valid_real_email(email: Optional[str]) -> bool:
    if not email:
        return False
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return False
    domain = email.split("@")[-1]
    if domain in DISALLOWED_EMAIL_DOMAINS or domain.endswith(".example.com"):
        return False
    return True


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


# ─── Recipient resolver ───────────────────────────────────────────────────────
def get_real_maintenance_recipients(db, veh: Optional[Vehicle]) -> Dict[str, User]:
    """
    Returns dict {email_lowercase: User} for all valid recipients:
    - Admin
    - FleetManager
    - Dispatcher
    - Driver assigned to the vehicle (if any)
    Excludes any fake / example.com addresses.
    """
    recipients_by_email: Dict[str, User] = {}

    role_users = (
        db.query(User)
        .filter(User.role.in_([RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher]))
        .all()
    )
    for u in role_users:
        if is_valid_real_email(u.email):
            recipients_by_email[u.email.strip().lower()] = u

    if veh:
        driver_user = None
        if veh.assigned_driver_id:
            driver = db.query(Driver).filter(Driver.driver_id == veh.assigned_driver_id).first()
            if driver and driver.user_id:
                driver_user = db.query(User).filter(User.user_id == driver.user_id).first()
            if not driver_user:
                driver_user = db.query(User).filter(User.user_id == veh.assigned_driver_id).first()
        if not driver_user:
            from app.models.trip import Trip, TripStatusEnum
            trip = db.query(Trip).filter(
                Trip.vehicle_id == veh.vehicle_id,
                Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
            ).first()
            if trip and trip.driver_id:
                d = db.query(Driver).filter(Driver.driver_id == trip.driver_id).first()
                if d and d.user_id:
                    driver_user = db.query(User).filter(User.user_id == d.user_id).first()
        if driver_user and is_valid_real_email(driver_user.email):
            recipients_by_email[driver_user.email.strip().lower()] = driver_user

    return recipients_by_email


# ─── Email sender ─────────────────────────────────────────────────────────────
def send_maintenance_alert_email(
    recipient_email: str,
    subject: str,
    reg_num: str,
    maintenance_type: str,
    service_date_str: str,
    alert_type_label: str,
    additional_msg: str = "",
) -> Tuple[str, Optional[datetime], Optional[str]]:
    body = (
        f"Maintenance Alert — {alert_type_label}\n\n"
        f"Vehicle: {reg_num}\n"
        f"Maintenance Type: {maintenance_type}\n"
        f"Service Date: {service_date_str}\n"
        f"Alert Stage: {alert_type_label}\n"
        f"Sender: Fleet Manager\n"
    )
    if additional_msg:
        body += f"\nDetails: {additional_msg}\n"

    extra_html = (
        f"<p style='font-size:13px;color:#a1a1aa;'>{additional_msg}</p>"
        if additional_msg
        else ""
    )
    html = (
        f"<div style='font-family:Arial,sans-serif;max-width:600px;padding:24px;"
        f"border:1px solid #1e3a5f;background-color:#0f172a;color:#f1f5f9;border-radius:12px;'>"
        f"<h2 style='color:#38bdf8;margin-top:0;'>FleetFlow — Maintenance Alert</h2>"
        f"<div style='background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:16px 0;'>"
        f"<p style='margin:6px 0;font-size:14px;'><strong>Alert Stage:</strong> "
        f"<span style='color:#f59e0b;font-weight:bold;'>{alert_type_label}</span></p>"
        f"<p style='margin:6px 0;font-size:14px;'><strong>Vehicle:</strong> "
        f"<span style='color:#38bdf8;'>{reg_num}</span></p>"
        f"<p style='margin:6px 0;font-size:14px;'><strong>Maintenance Type:</strong> {maintenance_type}</p>"
        f"<p style='margin:6px 0;font-size:14px;'><strong>Service Date:</strong> {service_date_str}</p>"
        f"<p style='margin:6px 0;font-size:14px;'><strong>Sender:</strong> Fleet Manager</p>"
        f"</div>"
        f"{extra_html}"
        f"<p style='font-size:11px;color:#64748b;margin-top:20px;'>"
        f"FleetFlow Automated Fleet Management Platform — Do not reply</p>"
        f"</div>"
    )

    now = datetime.utcnow()
    try:
        if not is_valid_real_email(recipient_email):
            raise ValueError(f"Invalid or fake email: '{recipient_email}'")
        send_email(subject=subject, recipient=recipient_email, body=body, html=html)
        return "Sent", now, None
    except Exception as exc:
        return "Failed", None, str(exc)


# ─── Core alert dispatcher ────────────────────────────────────────────────────
def dispatch_maintenance_alert(
    db,
    maintenance: Maintenance,
    veh: Optional[Vehicle],
    alert_type: str,
    notif_type: str,
    title: str,
    alert_type_label: str,
    additional_msg: str = "",
    subject_override: Optional[str] = None,
) -> int:
    """
    Sends email + creates in-app notification for every valid recipient.
    Uses strict DB-level idempotency:
    - MaintenanceAlertDelivery unique on (maintenance_id, recipient_email, alert_type)
    - Notification unique on (maintenance_id, user_id, notification_type)
    Returns number of new emails sent.
    """
    now = datetime.utcnow()
    reg_num = veh.registration_number if veh else "N/A"
    m_type = maintenance.maintenance_type or "General Inspection"
    svc_dt = maintenance.service_date or parse_date(maintenance.scheduled_date) or now
    svc_date_str = svc_dt.strftime("%B %d, %Y")  # e.g. "August 31, 2026"

    fleet_manager = (
        db.query(User)
        .filter(User.role == RoleEnum.FleetManager)
        .order_by(User.created_at.asc())
        .first()
    )
    sender_id = fleet_manager.user_id if fleet_manager else None

    recipients = get_real_maintenance_recipients(db, veh)
    if not recipients and fleet_manager and is_valid_real_email(fleet_manager.email):
        recipients = {fleet_manager.email.strip().lower(): fleet_manager}

    if not recipients:
        print(f"[MAINTENANCE ALERT] No valid recipients found for maintenance {maintenance.maintenance_id}")
        return 0

    subject = subject_override or f"FleetFlow Maintenance Alert — {alert_type_label} — {reg_num}"
    msg = (
        f"Vehicle {reg_num} has a {m_type} scheduled on {svc_date_str}. "
        f"{additional_msg}"
    )

    print(
        f"\n[MAINTENANCE ALERT]\n"
        f"  Maintenance ID : {maintenance.maintenance_id}\n"
        f"  Vehicle        : {reg_num}\n"
        f"  Type           : {m_type}\n"
        f"  Alert          : {alert_type}\n"
        f"  Recipients     : {list(recipients.keys())}"
    )

    sent_count = 0
    for email, user in recipients.items():
        # --- Email deduplication check ---
        existing_delivery = (
            db.query(MaintenanceAlertDelivery)
            .filter(
                MaintenanceAlertDelivery.maintenance_id == maintenance.maintenance_id,
                MaintenanceAlertDelivery.recipient_email == email,
                MaintenanceAlertDelivery.alert_type == alert_type,
            )
            .first()
        )
        if existing_delivery:
            print(f"  [SKIP] Already sent {alert_type} to {email}")
            continue

        email_status, email_sent_at, email_error = send_maintenance_alert_email(
            recipient_email=email,
            subject=subject,
            reg_num=reg_num,
            maintenance_type=m_type,
            service_date_str=svc_date_str,
            alert_type_label=alert_type_label,
            additional_msg=additional_msg,
        )

        # Record delivery (INSERT — if duplicate key race, silently skip)
        delivery = MaintenanceAlertDelivery(
            maintenance_id=maintenance.maintenance_id,
            recipient_user_id=user.user_id if user else None,
            recipient_email=email,
            alert_type=alert_type,
            sent_at=email_sent_at,
            status=email_status,
            error_message=email_error,
            created_at=now,
        )
        try:
            db.add(delivery)
            db.flush()
        except IntegrityError:
            db.rollback()
            print(f"  [SKIP-RACE] Delivery record already exists for {alert_type} -> {email}")
            continue

        if email_status == "Sent":
            print(f"  [SENT] {alert_type} -> {email}")
            sent_count += 1
        else:
            print(f"  [FAILED] {alert_type} -> {email}: {email_error}")

        # --- In-app notification deduplication check ---
        existing_notif = None
        if user:
            existing_notif = (
                db.query(Notification)
                .filter(
                    Notification.maintenance_id == maintenance.maintenance_id,
                    Notification.user_id == user.user_id,
                    Notification.notification_type == notif_type,
                )
                .first()
            )

        if not existing_notif:
            notif = Notification(
                notification_id=uuid.uuid4(),
                maintenance_id=maintenance.maintenance_id,
                vehicle_id=maintenance.vehicle_id,
                user_id=user.user_id if user else None,
                sender_id=sender_id,
                sender_name=(fleet_manager.full_name if fleet_manager else "Fleet Manager"),
                sender_role="Fleet Manager",
                title=title,
                message=msg,
                type="maintenance",
                notification_type=notif_type,
                recipient_email=email,
                email_status=email_status,
                email_sent_at=email_sent_at,
                email_error=email_error,
                sent_at=email_sent_at,
                is_read=False,
                created_at=now,
            )
            try:
                db.add(notif)
                db.flush()
            except IntegrityError:
                db.rollback()

    return sent_count


# ─── Celery task ──────────────────────────────────────────────────────────────
@celery_app.task(name="app.tasks.maintenance.check_maintenance_alerts")
def check_maintenance_alerts():
    """
    Periodic maintenance alert scheduler.

    Rules:
    ──────
    1. Skip records where status is 'Resolved', 'Completed', or 'Cancelled'.
    2. Skip records without a service_date.

    3. Stage 1 — 5 days before:
       Condition : days_until_service == 5 (window: 4 < days_left <= 5)
       Flag      : record.notified_5_days
       Send once : check flag first; set flag + record delivery row.

    4. Stage 2 — 1 day before:
       Condition : days_until_service == 1 (window: 0 < days_left <= 1)
       Flag      : record.notified_1_day
       Send once : check flag first; set flag + record delivery row.

    5. Stage 3 — Due / Overdue (days_left <= 0, status not Resolved):
       Reminder interval: at most once per 23 hours (controlled via last_notification_date).
       Alert type key: "DUE_<date>" or "OVERDUE_<date>" — one per calendar day per recipient.
       Continue until status = Resolved.
    """
    db = SessionLocal()
    total_sent = 0
    try:
        now = datetime.utcnow()
        today = now.date()

        active_records = (
            db.query(Maintenance)
            .filter(
                Maintenance.status.isnot(None),
                ~Maintenance.status.in_(["Resolved", "Completed", "Cancelled"]),
            )
            .all()
        )

        print(f"\n[MAINTENANCE SCHEDULER] Running at {now.isoformat()} UTC — {len(active_records)} active record(s)")

        for record in active_records:
            # Resolved guard (re-check in case it changed mid-loop)
            if record.status in ("Resolved", "Completed", "Cancelled"):
                continue

            veh = (
                db.query(Vehicle).filter(Vehicle.vehicle_id == record.vehicle_id).first()
                if record.vehicle_id
                else None
            )
            reg_num = veh.registration_number if veh else "N/A"
            m_type = record.maintenance_type or "General Inspection"

            svc_dt = record.service_date or parse_date(record.scheduled_date)
            if not svc_dt:
                continue

            # Normalise to midnight for clean day comparisons
            svc_date_only = svc_dt.date()
            days_until = (svc_date_only - today).days  # positive = future, 0 = today, negative = overdue
            svc_date_str = svc_dt.strftime("%B %d, %Y")

            print(
                f"  -> Maintenance {record.maintenance_id} | {reg_num} | {m_type} | "
                f"Service: {svc_date_only} | days_until={days_until} | status={record.status}"
            )

            # ── Stage 1: 5-day alert (send exactly once) ──────────────────────
            if days_until == 5 and not record.notified_5_days:
                sent = dispatch_maintenance_alert(
                    db=db,
                    maintenance=record,
                    veh=veh,
                    alert_type="5_DAYS_BEFORE",
                    notif_type="5_DAYS_BEFORE",
                    title=f"Maintenance Alert – 5 Days Before ({reg_num})",
                    alert_type_label="5 Days Before",
                    additional_msg=(
                        f"Vehicle {reg_num} has a {m_type} scheduled on {svc_date_str}. "
                        f"This maintenance is due in 5 days."
                    ),
                )
                record.notified_5_days = True
                record.last_notification_date = now
                record.notification_count = (record.notification_count or 0) + 1
                total_sent += sent

            # ── Stage 2: 1-day alert (send exactly once) ──────────────────────
            elif days_until == 1 and not record.notified_1_day:
                sent = dispatch_maintenance_alert(
                    db=db,
                    maintenance=record,
                    veh=veh,
                    alert_type="1_DAY_BEFORE",
                    notif_type="1_DAY_BEFORE",
                    title=f"Maintenance Alert – 1 Day Before ({reg_num})",
                    alert_type_label="1 Day Before",
                    additional_msg=(
                        f"Vehicle {reg_num} has a {m_type} scheduled for tomorrow, {svc_date_str}."
                    ),
                )
                record.notified_1_day = True
                record.last_notification_date = now
                record.notification_count = (record.notification_count or 0) + 1
                total_sent += sent

            # ── Stage 3: Due / Overdue (daily reminder, rate-limited) ─────────
            elif days_until <= 0:
                # Rate limit: skip if notified within last 23 hours
                if record.last_notification_date:
                    hours_since = (now - record.last_notification_date).total_seconds() / 3600
                    if hours_since < 23:
                        print(
                            f"    [RATE-LIMITED] Last notified {hours_since:.1f}h ago — "
                            f"skipping due/overdue reminder."
                        )
                        continue

                is_due_today = (days_until == 0)
                overdue_days = abs(days_until)
                # Use a date-stamped alert_type key so DB unique constraint enforces
                # at most one row per (maintenance, email, calendar day)
                alert_key_date = today.strftime("%Y-%m-%d")
                alert_type_key = f"DUE_{alert_key_date}" if is_due_today else f"OVERDUE_{alert_key_date}"
                alert_label = (
                    "Maintenance Due Today"
                    if is_due_today
                    else f"Maintenance Overdue ({overdue_days} day{'s' if overdue_days != 1 else ''})"
                )
                title = (
                    f"Maintenance Due – {reg_num}"
                    if is_due_today
                    else f"Overdue Maintenance Alert – {reg_num}"
                )
                extra = (
                    f"Vehicle {reg_num} has a {m_type} that was scheduled on {svc_date_str} "
                    + ("and is DUE TODAY." if is_due_today else f"and is OVERDUE by {overdue_days} day(s).")
                    + " Please take action or mark as Resolved."
                )

                sent = dispatch_maintenance_alert(
                    db=db,
                    maintenance=record,
                    veh=veh,
                    alert_type=alert_type_key,
                    notif_type=alert_type_key,
                    title=title,
                    alert_type_label=alert_label,
                    additional_msg=extra,
                )
                record.last_notification_date = now
                record.notification_count = (record.notification_count or 0) + 1
                total_sent += sent

        db.commit()
        print(f"\n[MAINTENANCE SCHEDULER] Done — {total_sent} alert(s) dispatched.\n")
        return f"Checked maintenance — {total_sent} alert(s) dispatched."

    except Exception as e:
        db.rollback()
        print(f"[MAINTENANCE SCHEDULER ERROR] {e}")
        raise e
    finally:
        db.close()
