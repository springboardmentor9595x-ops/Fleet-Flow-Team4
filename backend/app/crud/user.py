import uuid
from datetime import datetime, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.user import User, RoleEnum
from app.models.driver import Driver
from app.core.security import hash_password


def get_user_by_email(db: Session, email: str):
    if not email:
        return None
    cleaned = email.strip().lower()

    # 1. Exact match by email
    user = db.query(User).filter(func.lower(User.email) == cleaned).first()
    if user:
        return user

    # 2. Match by email prefix (e.g. "satishkoppula741" matches "satishkoppula741@gmail.com")
    if "@" not in cleaned:
        user = db.query(User).filter(func.lower(User.email).like(f"{cleaned}@%")).first()
        if user:
            return user

    # 3. Match by role aliases (e.g. "admin", "fleetmanager", "dispatcher", "driver")
    role_map = {
        "admin": RoleEnum.Admin,
        "administrator": RoleEnum.Admin,
        "fleetmanager": RoleEnum.FleetManager,
        "fleet manager": RoleEnum.FleetManager,
        "fleet": RoleEnum.FleetManager,
        "dispatcher": RoleEnum.Dispatcher,
        "dispatch": RoleEnum.Dispatcher,
        "driver": RoleEnum.Driver,
    }
    if cleaned in role_map:
        user = db.query(User).filter(User.role == role_map[cleaned]).first()
        if user:
            return user

    # 4. Match by full name
    user = db.query(User).filter(func.lower(User.full_name) == cleaned).first()
    if user:
        return user

    return None


def create_user(db: Session, email: str, password: str, full_name: str, phone: str, role, address: str = None):
    cleaned_email = email.strip().lower() if email else ""
    user = User(
        email=cleaned_email,
        password=hash_password(password),
        full_name=full_name.strip() if full_name else "",
        phone=phone,
        address=address,
        role=role,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create driver record if role is Driver
    role_val = role.value if hasattr(role, "value") else str(role)
    if role_val == "Driver":
        driver_entry = db.query(Driver).filter(Driver.user_id == user.user_id).first()
        if not driver_entry:
            driver_entry = Driver(driver_id=uuid.uuid4(), user_id=user.user_id)
            db.add(driver_entry)
            db.commit()

    return user


def set_verification_code(db: Session, user: User, otp: str, expires_in_minutes: int = 10):
    user.verification_code = otp
    user.verification_expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)
    user.is_verified = False
    db.commit()
    db.refresh(user)
    return user


def verify_user_otp(db: Session, email: str, otp: str):
    user = get_user_by_email(db, email)
    if not user:
        return None

    if not user.verification_code:
        return None

    if user.verification_expires_at and datetime.utcnow() > user.verification_expires_at:
        user.verification_code = None
        user.verification_expires_at = None
        db.commit()
        return None

    if user.verification_code != otp:
        return None

    user.is_verified = True
    user.verification_code = None
    user.verification_expires_at = None
    db.commit()
    db.refresh(user)
    return user


def reset_user_password(db: Session, email: str, otp: str, new_password: str):
    user = get_user_by_email(db, email)
    if not user:
        return None

    if not user.verification_code:
        return None

    if user.verification_expires_at and datetime.utcnow() > user.verification_expires_at:
        user.verification_code = None
        user.verification_expires_at = None
        db.commit()
        return None

    if user.verification_code.strip() != otp.strip():
        return None

    user.password = hash_password(new_password)
    user.verification_code = None
    user.verification_expires_at = None
    user.is_verified = True
    db.commit()
    db.refresh(user)
    return user