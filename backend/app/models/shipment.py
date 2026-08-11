import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ShipmentStatusEnum(str, enum.Enum):
    Created = "Created"
    Assigned = "Assigned"
    InTransit = "In Transit"
    Delayed = "Delayed"
    Delivered = "Delivered"
    Cancelled = "Cancelled"


class Shipment(Base):
    __tablename__ = "shipments"

    shipment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tracking_number = Column(String(30), unique=True, nullable=False, index=True)
    source = Column(String(150), nullable=False)
    destination = Column(String(150), nullable=False)
    customer_name = Column(String(100), nullable=False)
    shipment_weight = Column(Float, nullable=False)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id"), nullable=True)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id"), nullable=True)
    status = Column(
        Enum(ShipmentStatusEnum, name="shipment_status_enum", create_type=False),
        nullable=False,
        default=ShipmentStatusEnum.Created,
    )
    expected_delivery_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShipmentStatusHistory(Base):
    __tablename__ = "shipment_status_history"

    history_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(UUID(as_uuid=True), ForeignKey("shipments.shipment_id"), nullable=False)
    status = Column(
        Enum(ShipmentStatusEnum, name="shipment_status_enum", create_type=False),
        nullable=False,
    )
    location = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)