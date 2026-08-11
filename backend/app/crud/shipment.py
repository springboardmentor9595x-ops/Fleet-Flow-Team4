from uuid import UUID
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.shipment import Shipment, ShipmentStatusEnum, ShipmentStatusHistory
from app.models.user import User, RoleEnum
from app.schemas.shipment import ShipmentCreate, ShipmentUpdate


def create_shipment(db: Session, shipment_in: ShipmentCreate) -> Shipment:
    shipment = Shipment(**shipment_in.model_dump())
    if not shipment.expected_delivery_at:
        # Default expected delivery to 24 hours from creation if not provided
        shipment.expected_delivery_at = datetime.utcnow() + timedelta(hours=24)
    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    # Log initial status history
    log_shipment_status_history(
        db,
        shipment_id=shipment.shipment_id,
        status=ShipmentStatusEnum.Created,
        location=f"Created at {shipment.source}",
    )
    return shipment


def get_shipment_by_id(db: Session, shipment_id: UUID) -> Optional[Shipment]:
    return db.query(Shipment).filter(Shipment.shipment_id == shipment_id).first()


def get_shipment_by_tracking_number(db: Session, tracking_number: str) -> Optional[Shipment]:
    return db.query(Shipment).filter(Shipment.tracking_number == tracking_number).first()


def get_shipments(
    db: Session,
    current_user: User,
    skip: int = 0,
    limit: int = 100,
    status: Optional[ShipmentStatusEnum] = None,
    customer_name: Optional[str] = None,
    vehicle_id: Optional[UUID] = None,
    driver_id: Optional[UUID] = None,
) -> List[Shipment]:
    query = db.query(Shipment)

    if current_user.role == RoleEnum.Driver:
        query = query.filter(Shipment.driver_id == current_user.user_id)
    elif driver_id:
        query = query.filter(Shipment.driver_id == driver_id)

    if status is not None:
        query = query.filter(Shipment.status == status)

    if customer_name:
        query = query.filter(Shipment.customer_name.ilike(f"%{customer_name}%"))

    if vehicle_id:
        query = query.filter(Shipment.vehicle_id == vehicle_id)

    return query.order_by(Shipment.created_at.desc()).offset(skip).limit(limit).all()


def update_shipment(db: Session, shipment_db: Shipment, shipment_in: ShipmentUpdate, updated_by: Optional[UUID] = None) -> Shipment:
    old_status = shipment_db.status
    update_data = shipment_in.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(shipment_db, field, value)
        
    db.commit()
    db.refresh(shipment_db)

    if "status" in update_data and update_data["status"] != old_status:
        log_shipment_status_history(
            db,
            shipment_id=shipment_db.shipment_id,
            status=shipment_db.status,
            location=f"Status updated to {shipment_db.status.value}",
            updated_by=updated_by,
        )

    return shipment_db


def update_shipment_status(
    db: Session,
    shipment_db: Shipment,
    new_status: ShipmentStatusEnum,
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    updated_by: Optional[UUID] = None,
) -> Shipment:
    shipment_db.status = new_status
    db.commit()
    db.refresh(shipment_db)

    log_shipment_status_history(
        db,
        shipment_id=shipment_db.shipment_id,
        status=new_status,
        location=location or f"Status changed to {new_status.value}",
        latitude=latitude,
        longitude=longitude,
        updated_by=updated_by,
    )
    return shipment_db


def delete_shipment(db: Session, shipment_id: UUID) -> bool:
    shipment = db.query(Shipment).filter(Shipment.shipment_id == shipment_id).first()
    if not shipment:
        return False
    
    # Clean up status history
    db.query(ShipmentStatusHistory).filter(ShipmentStatusHistory.shipment_id == shipment_id).delete()
    
    # Disassociate linked trips to prevent Foreign Key constraint violation
    from app.models.trip import Trip
    db.query(Trip).filter(Trip.shipment_id == shipment_id).update({"shipment_id": None})

    db.delete(shipment)
    db.commit()
    return True


def log_shipment_status_history(
    db: Session,
    shipment_id: UUID,
    status: ShipmentStatusEnum,
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    updated_by: Optional[UUID] = None,
) -> ShipmentStatusHistory:
    history = ShipmentStatusHistory(
        shipment_id=shipment_id,
        status=status,
        location=location,
        latitude=latitude,
        longitude=longitude,
        updated_by=updated_by,
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


def get_shipment_status_history(db: Session, shipment_id: UUID) -> List[ShipmentStatusHistory]:
    return (
        db.query(ShipmentStatusHistory)
        .filter(ShipmentStatusHistory.shipment_id == shipment_id)
        .order_by(ShipmentStatusHistory.changed_at.asc())
        .all()
    )


def get_shipment_alerts(db: Session) -> List[dict]:
    """
    Identifies shipments that are:
    1. Delayed (status == Delayed or past expected_delivery_at while not delivered/cancelled)
    2. Approaching expected delivery deadline (within 2 hours)
    """
    now = datetime.utcnow()
    approaching_threshold = now + timedelta(hours=2)

    active_shipments = (
        db.query(Shipment)
        .filter(Shipment.status.notin_([ShipmentStatusEnum.Delivered, ShipmentStatusEnum.Cancelled]))
        .all()
    )

    alerts = []
    for s in active_shipments:
        if s.status == ShipmentStatusEnum.Delayed or (s.expected_delivery_at and s.expected_delivery_at < now):
            alerts.append({
                "shipment_id": str(s.shipment_id),
                "tracking_number": s.tracking_number,
                "customer_name": s.customer_name,
                "status": s.status,
                "expected_delivery_at": s.expected_delivery_at,
                "alert_type": "DELAYED",
                "message": f"Shipment '{s.tracking_number}' is past expected delivery window!",
            })
        elif s.expected_delivery_at and now <= s.expected_delivery_at <= approaching_threshold:
            alerts.append({
                "shipment_id": str(s.shipment_id),
                "tracking_number": s.tracking_number,
                "customer_name": s.customer_name,
                "status": s.status,
                "expected_delivery_at": s.expected_delivery_at,
                "alert_type": "APPROACHING_DEADLINE",
                "message": f"Shipment '{s.tracking_number}' is approaching expected delivery deadline within 2 hours.",
            })
    return alerts