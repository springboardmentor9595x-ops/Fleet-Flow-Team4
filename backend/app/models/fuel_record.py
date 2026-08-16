import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class FuelRecord(Base):
    __tablename__ = "fuel_records"

    fuel_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id"), nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id"), nullable=True)
    refill_date = Column(String(50), nullable=True)
    fuel_type = Column(String(50), nullable=True, default="Diesel")
    litres = Column(Float, nullable=False, default=0.0)
    price_per_litre = Column(Float, nullable=False, default=0.0)
    total_cost = Column(Float, nullable=False, default=0.0)
    odometer_reading = Column(Float, nullable=True, default=0.0)
    location = Column(String(100), nullable=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)