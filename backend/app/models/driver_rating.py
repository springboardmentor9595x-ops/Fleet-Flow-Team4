import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class DriverRating(Base):
    __tablename__ = "driver_ratings"

    rating_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False, index=True)
    rated_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="check_valid_rating_range"),
    )

    driver = relationship("Driver", backref="ratings")
    rater = relationship("User", foreign_keys=[rated_by])
