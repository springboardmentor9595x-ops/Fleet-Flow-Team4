import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Boolean, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Maintenance(Base):
    __tablename__ = "vehicle_maintenance"

    maintenance_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id"), nullable=True)
    maintenance_type = Column(String(100), nullable=True, default="General Inspection")
    scheduled_date = Column(String(50), nullable=True)
    service_date = Column(DateTime, nullable=True)
    next_service_date = Column(DateTime, nullable=True)
    description = Column(String(255), nullable=True)
    remarks = Column(String(255), nullable=True)
    cost = Column(Float, nullable=True, default=0.0)
    status = Column(String(30), nullable=True, default="Scheduled")  # Scheduled, In Progress, Completed, Cancelled, Resolved
    notified_5_days = Column(Boolean, default=False, nullable=False)
    notified_1_day = Column(Boolean, default=False, nullable=False)
    notified_1_hour = Column(Boolean, default=False, nullable=False)
    last_notification_date = Column(DateTime, nullable=True)

    notification_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="maintenances")
    notifications = relationship("Notification", back_populates="maintenance", cascade="all, delete-orphan", passive_deletes=True)
    deliveries = relationship("MaintenanceAlertDelivery", back_populates="maintenance", cascade="all, delete-orphan", passive_deletes=True)


class MaintenanceAlertDelivery(Base):
    __tablename__ = "maintenance_alert_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    maintenance_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_maintenance.maintenance_id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    recipient_email = Column(String(255), nullable=False)
    alert_type = Column(String(50), nullable=False)  # SCHEDULED, 5_DAYS_BEFORE, 1_DAY_BEFORE, 1_HOUR_BEFORE, DUE, OVERDUE
    sent_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="Sent")  # Sent, Failed, Skipped
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("maintenance_id", "recipient_email", "alert_type", name="uq_maintenance_alert_delivery"),
    )

    maintenance = relationship("Maintenance", back_populates="deliveries")
    recipient_user = relationship("User", foreign_keys=[recipient_user_id])