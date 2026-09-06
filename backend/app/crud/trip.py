from uuid import UUID
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.trip import Trip, TripStatusEnum
from app.models.gps_tracking import GPSTracking
from app.schemas.trip import TripCreate, TripUpdate
from app.schemas.gps_tracking import GPSTrackingCreate


def create_trip(db: Session, trip_in: TripCreate) -> Trip:
    trip_data = trip_in.model_dump()
    trip = Trip(**trip_data)
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip


def get_trip_by_id(db: Session, trip_id: UUID) -> Optional[Trip]:
    return db.query(Trip).filter(Trip.trip_id == trip_id).first()


def get_trips(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[TripStatusEnum] = None,
    driver_id: Optional[UUID] = None,
    vehicle_id: Optional[UUID] = None,
) -> List[Trip]:
    query = db.query(Trip)
    if status is not None:
        query = query.filter(Trip.status == status)
    if driver_id is not None:
        query = query.filter(Trip.driver_id == driver_id)
    if vehicle_id is not None:
        query = query.filter(Trip.vehicle_id == vehicle_id)
    return query.order_by(Trip.created_at.desc()).offset(skip).limit(limit).all()


def update_trip(db: Session, trip_db: Trip, trip_in: TripUpdate) -> Trip:
    update_data = trip_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(trip_db, field, value)
    db.commit()
    db.refresh(trip_db)
    return trip_db


def delete_trip(db: Session, trip_id: UUID) -> bool:
    trip = db.query(Trip).filter(Trip.trip_id == trip_id).first()
    if not trip:
        return False
    db.query(GPSTracking).filter(GPSTracking.trip_id == trip_id).delete()
    db.delete(trip)
    db.commit()
    return True


def create_gps_ping(db: Session, gps_in: GPSTrackingCreate) -> GPSTracking:
    gps_data = gps_in.model_dump()
    ping = GPSTracking(**gps_data)
    db.add(ping)
    db.commit()
    db.refresh(ping)
    return ping


def get_trip_telemetry(db: Session, trip_id: UUID) -> List[GPSTracking]:
    return (
        db.query(GPSTracking)
        .filter(GPSTracking.trip_id == trip_id)
        .order_by(GPSTracking.timestamp.asc())
        .all()
    )
