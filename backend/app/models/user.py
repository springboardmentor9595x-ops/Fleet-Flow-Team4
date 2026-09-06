import uuid
import enum
from sqlalchemy import Boolean, Column, String, DateTime, Enum, Integer
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from app.database import Base


class RoleEnum(str, enum.Enum):
    Admin = "Admin"
    FleetManager = "FleetManager"
    Driver = "Driver"
    Dispatcher = "Dispatcher"


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    phone = Column(String(15))
    address = Column(String(255), nullable=True)
    role = Column(Enum(RoleEnum, name="roleenum"), nullable=False, default=RoleEnum.Driver)
    is_verified = Column(Boolean, nullable=False, default=False)
    verification_code = Column(String(10), nullable=True)
    verification_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    email = Column(String(100), primary_key=True)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    address = Column(String(255), nullable=True)
    role = Column(Enum(RoleEnum, name="roleenum"), nullable=False, default=RoleEnum.Driver)
    password_hash = Column(String(255), nullable=False)
    otp_code = Column(String(10), nullable=False)
    otp_expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)