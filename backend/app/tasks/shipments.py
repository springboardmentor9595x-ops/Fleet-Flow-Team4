from datetime import datetime, timedelta
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.shipment import Shipment, ShipmentStatusEnum
from app.services.notification_service import dispatch_system_notification


@celery_app.task(name="app.tasks.shipments.check_delayed_shipments")
def check_delayed_shipments():
    """
    Periodic task running every 10 minutes to detect shipments that have been In Transit
    past their deadline/threshold, mark them Delayed, and dispatch notifications.
    """
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=24)
        overdue = db.query(Shipment).filter(
            Shipment.status == ShipmentStatusEnum.InTransit,
            Shipment.created_at <= cutoff,
        ).all()

        for shipment in overdue:
            shipment.status = ShipmentStatusEnum.Delayed
            dispatch_system_notification(
                db=db,
                title=f"Shipment {shipment.tracking_number} Delayed",
                message=f"Shipment {shipment.tracking_number} to {shipment.destination} has exceeded standard transit duration and was marked Delayed.",
                event_type="shipment_delayed",
                shipment_id=shipment.shipment_id,
                vehicle_id=shipment.vehicle_id,
            )
            print(f"[SHIPMENT ALERT] {shipment.tracking_number} marked as Delayed")

        db.commit()
        return f"Checked shipments — {len(overdue)} marked Delayed"
    finally:
        db.close()
