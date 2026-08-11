import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Integer,
    DateTime,
    ForeignKey,
    Enum,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class VehicleStatusEnum(str, enum.Enum):
    Available = "Available"
    Assigned = "Assigned"
    Maintenance = "Maintenance"
    InTransit = "In Transit"


class Vehicle(Base):
    __tablename__ = "vehicles"

    vehicle_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    registration_number = Column(
        String(30),
        unique=True,
        nullable=False,
        index=True
    )

    vehicle_type = Column(
        String(50),
        nullable=False
    )

    brand = Column(
        String(50),
        nullable=False
    )

    model = Column(
        String(50),
        nullable=False
    )

    manufacture_year = Column(
        Integer,
        nullable=False
    )

    fuel_type = Column(
        String(30),
        nullable=False
    )

    capacity = Column(
        Integer,
        nullable=False
    )

    assigned_driver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("drivers.driver_id"),
        nullable=True
    )

    status = Column(
        Enum(
            VehicleStatusEnum,
            name="vehicle_status_enum",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=VehicleStatusEnum.Available
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )