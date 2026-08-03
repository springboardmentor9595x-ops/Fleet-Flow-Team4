import uuid
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    vehicle_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)