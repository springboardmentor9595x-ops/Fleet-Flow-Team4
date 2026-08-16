import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    driver_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), unique=True)
    license_number = Column(String(50), nullable=True)
    license_expiry = Column(String(30), nullable=True)
    status = Column(String(30), nullable=True, default="Available")  # Available, On Trip, Inactive