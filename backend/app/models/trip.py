import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class TripStatusEnum(str, enum.Enum):
    Scheduled = "Scheduled"
    Active = "Active"
    Completed = "Completed"
    Cancelled = "Cancelled"


class Trip(Base):
    __tablename__ = "trips"

    trip_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id"), nullable=True)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id"), nullable=True)
    shipment_id = Column(UUID(as_uuid=True), ForeignKey("shipments.shipment_id"), nullable=True)
    
    status = Column(
        Enum(TripStatusEnum, name="trip_status_enum"),
        nullable=False,
        default=TripStatusEnum.Scheduled,
    )
    
    start_lat = Column(Float, nullable=False)
    start_lng = Column(Float, nullable=False)
    end_lat = Column(Float, nullable=False)
    end_lng = Column(Float, nullable=False)
    
    distance = Column(Float, nullable=True)  # distance in km
    duration = Column(Float, nullable=True)  # duration in minutes
    eta = Column(DateTime, nullable=True)
    route_path = Column(Text, nullable=True)  # JSON-encoded array of route coordinates or polyline
    route_type = Column(String(50), nullable=True, default="fastest")  # fastest, shortest, traffic_avoidance, fuel_efficient
    
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)