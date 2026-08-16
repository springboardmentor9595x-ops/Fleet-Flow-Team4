from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.user import UserCreate, UserOut, Token, VerifyOTPRequest
from app.crud.user import get_user_by_email, create_user, set_verification_code, verify_user_otp
from app.core.security import normalize_password_for_user, create_access_token
from app.core.deps import get_current_user
from app.core.email import generate_verification_otp, send_email, send_verification_email

router = APIRouter()


def _send_auth_notification(email: str, full_name: str, subject: str, body: str, html: str) -> None:
    try:
        send_email(subject=subject, recipient=email, body=body, html=html)
    except Exception:
        pass


def _send_verification_email(db: Session, email: str, full_name: str) -> None:
    try:
        otp = generate_verification_otp()
        user = get_user_by_email(db, email)
        if not user:
            return
        set_verification_code(db, user, otp, expires_in_minutes=10)
        send_verification_email(recipient=email, full_name=full_name, otp=otp)
    except Exception:
        pass


@router.post("/signup", response_model=UserOut)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    existing_user = get_user_by_email(db, user_in.email)
    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(status_code=400, detail="Email already registered")
        else:
            db.delete(existing_user)
            db.commit()
    user = create_user(db, user_in.email, user_in.password, user_in.full_name, user_in.phone, user_in.role)

    # Send OTP verification email only — no extra welcome email
    _send_verification_email(db, user.email, user.full_name)

    return user


@router.post("/verify-otp", response_model=UserOut)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    user = verify_user_otp(db, payload.email, payload.otp)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    return user


@router.post("/resend-otp")
def resend_otp(email: str, db: Session = Depends(get_db)):
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = generate_verification_otp()
    set_verification_code(db, user, otp, expires_in_minutes=10)
    send_verification_email(recipient=user.email, full_name=user.full_name, otp=otp)
    return {"message": "A new verification code has been sent to your email."}


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_user_by_email(db, form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_verified:
        user.is_verified = True
        db.commit()

    original_password = user.password
    if not normalize_password_for_user(user, form_data.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.password != original_password:
        db.commit()

    token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me", response_model=UserOut)
def read_current_user(current_user = Depends(get_current_user)):
    return current_user

@router.delete("/me", status_code=204)
def delete_current_user(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(current_user)
    db.commit()

@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.models.user import User
    return db.query(User).all()