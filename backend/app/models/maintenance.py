import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Maintenance(Base):
    __tablename__ = "vehicle_maintenance"

    maintenance_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id"), nullable=True)
    maintenance_type = Column(String(100), nullable=True, default="General Inspection")
    scheduled_date = Column(String(50), nullable=True)
    description = Column(String(255), nullable=True)
    cost = Column(Float, nullable=True, default=0.0)
    status = Column(String(30), nullable=True, default="Scheduled")  # Scheduled, In Progress, Completed, Cancelled
    created_at = Column(DateTime, default=datetime.utcnow)