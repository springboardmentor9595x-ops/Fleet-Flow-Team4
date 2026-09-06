import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    request_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False, index=True)
    leave_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="Pending")  # Pending, Approved, Rejected
    manager_comment = Column(Text, nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    driver = relationship("Driver", backref="leave_requests")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
