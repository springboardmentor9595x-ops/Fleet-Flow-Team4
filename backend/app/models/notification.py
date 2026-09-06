import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True, index=True)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    sender_name = Column(String(100), nullable=True)
    sender_role = Column(String(50), nullable=True, default="Fleet Manager")
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.vehicle_id", ondelete="SET NULL"), nullable=True)
    maintenance_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_maintenance.maintenance_id", ondelete="CASCADE"), nullable=True)
    shipment_id = Column(UUID(as_uuid=True), ForeignKey("shipments.shipment_id", ondelete="CASCADE"), nullable=True)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("trips.trip_id", ondelete="CASCADE"), nullable=True)
    title = Column(String(150), nullable=False, default="System Notification")
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False, default="system")  # maintenance | delivery | assignment | delay | route_change | system
    notification_type = Column(String(50), nullable=True, default="system_alert")
    recipient_email = Column(String(255), nullable=True)
    email_status = Column(String(20), default="Pending", nullable=False)  # Pending | Sent | Failed | Skipped
    email_sent_at = Column(DateTime, nullable=True)
    email_error = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    maintenance = relationship("Maintenance", back_populates="notifications")
    user = relationship("User", foreign_keys=[user_id])