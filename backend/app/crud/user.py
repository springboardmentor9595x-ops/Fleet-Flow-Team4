from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.user import User
from app.core.security import hash_password


def get_user_by_email(db: Session, email: str):
    if not email:
        return None
    cleaned_email = email.strip().lower()
    return db.query(User).filter(User.email == cleaned_email).first()


def create_user(db: Session, email: str, password: str, full_name: str, phone: str, role):
    cleaned_email = email.strip().lower() if email else ""
    user = User(
        email=cleaned_email,
        password=hash_password(password),
        full_name=full_name.strip() if full_name else "",
        phone=phone,
        role=role,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
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