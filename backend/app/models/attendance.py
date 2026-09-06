import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, UniqueConstraint, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    status = Column(String(20), nullable=False, default="Present")  # Present, Leave, Absent
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("driver_id", "date", name="uq_driver_attendance_date"),
    )

    driver = relationship("Driver", backref="attendances")