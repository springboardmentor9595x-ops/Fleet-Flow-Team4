import re
import uuid
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.user import (
    UserCreate,
    SignupResponse,
    UserOut,
    UserProfileOut,
    UserProfileUpdate,
    UserRoleUpdate,
    AdminUserListItem,
    Token,
    VerifyOTPRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.crud.user import get_user_by_email, create_user, set_verification_code, verify_user_otp, reset_user_password
from app.core.security import normalize_password_for_user, create_access_token, verify_password, hash_password
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleEnum, PendingRegistration
from app.models.driver import Driver
from app.models.vehicle import Vehicle
from app.core.email import generate_verification_otp, send_email, send_verification_email, send_password_reset_email

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


@router.post("/signup", response_model=SignupResponse)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    # 1. Validate required fields
    if not user_in.full_name or not user_in.full_name.strip():
        raise HTTPException(status_code=400, detail="Full Name is required")
    if not user_in.email or not str(user_in.email).strip():
        raise HTTPException(status_code=400, detail="Valid Email Address is required")
    if not user_in.phone or not user_in.phone.strip():
        raise HTTPException(status_code=400, detail="Phone Number is required")
    if not user_in.password:
        raise HTTPException(status_code=400, detail="Password is required")

    # 2. Validate phone number format (at least 7 to 15 digits/symbols)
    phone_clean = user_in.phone.strip()
    if not re.match(r"^\+?[0-9\s\-]{7,15}$", phone_clean):
        raise HTTPException(status_code=400, detail="Please enter a valid phone number (e.g. +91 9876543210)")

    # 3. Validate password length
    if len(user_in.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    # 4. Validate password and confirm password match
    if user_in.confirm_password and user_in.password != user_in.confirm_password:
        raise HTTPException(status_code=400, detail="Password and Confirm Password do not match")

    # 5. Check if email already exists in real users table
    email_clean = str(user_in.email).strip().lower()
    existing_user_email = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if existing_user_email:
        raise HTTPException(status_code=400, detail="Email address is already registered")

    # 6. Check if phone number already exists in real users table
    existing_user_phone = db.query(User).filter(User.phone == phone_clean).first()
    if existing_user_phone:
        raise HTTPException(status_code=400, detail="Phone number is already registered")

    # 7. Generate secure random OTP (never hardcoded, never exposed in API response)
    otp = generate_verification_otp()

    # 8. Store in pending_registrations table (DO NOT create User account until OTP verified)
    pending = db.query(PendingRegistration).filter(PendingRegistration.email == email_clean).first()
    if not pending:
        pending = PendingRegistration(email=email_clean)
        db.add(pending)

    pending.full_name = user_in.full_name.strip()
    pending.phone = phone_clean
    pending.address = user_in.address.strip() if user_in.address else None
    pending.role = user_in.role
    pending.password_hash = hash_password(user_in.password)
    pending.otp_code = otp
    pending.otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    pending.attempts = 0
    db.commit()

    # 9. Send OTP to user's email contact
    sent = send_verification_email(recipient=email_clean, full_name=user_in.full_name, otp=otp)
    if not sent:
        db.delete(pending)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="Failed to send verification code email. Please check your email address or server configuration.",
        )

    return SignupResponse(
        message="Verification code sent to your email. Please verify to activate your account.",
        email=email_clean,
    )


@router.post("/verify-otp", response_model=UserOut)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    email_clean = str(payload.email).strip().lower()
    entered_otp = payload.otp.strip() if payload.otp else ""

    # Check pending_registrations table first
    pending = db.query(PendingRegistration).filter(PendingRegistration.email == email_clean).first()
    if not pending:
        # Fallback for users that might already be in users table
        existing_user = get_user_by_email(db, email_clean)
        if existing_user:
            if existing_user.is_verified:
                return existing_user
            verified = verify_user_otp(db, email_clean, entered_otp)
            if verified:
                return verified
        raise HTTPException(status_code=400, detail="No pending registration found for this email. Please sign up again.")

    # Check attempt limit
    if pending.attempts >= 5:
        db.delete(pending)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many invalid attempts. Verification code has been invalidated. Please sign up again.",
        )

    # Check expiration
    if datetime.utcnow() > pending.otp_expires_at:
        raise HTTPException(
            status_code=400,
            detail="Verification code has expired. Please request a new code.",
        )

    # Validate OTP code
    if pending.otp_code.strip() != entered_otp:
        pending.attempts += 1
        db.commit()
        remaining = 5 - pending.attempts
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    # Step 5: Only after successful OTP verification:
    # Create the user in the REAL PostgreSQL database.
    new_user = User(
        user_id=uuid.uuid4(),
        email=pending.email,
        password=pending.password_hash,
        full_name=pending.full_name,
        phone=pending.phone,
        address=pending.address,
        role=pending.role,
        is_verified=True,
        created_at=datetime.utcnow(),
    )
    db.add(new_user)
    db.flush()

    # If role is Driver, auto-provision driver record
    role_val = pending.role.value if hasattr(pending.role, "value") else str(pending.role)
    if role_val == "Driver":
        driver_entry = Driver(driver_id=uuid.uuid4(), user_id=new_user.user_id, status="Available")
        db.add(driver_entry)

    # Clean up pending registration
    db.delete(pending)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/resend-otp")
def resend_otp(email: str, db: Session = Depends(get_db)):
    email_clean = email.strip().lower() if email else ""

    # Check pending registration
    pending = db.query(PendingRegistration).filter(PendingRegistration.email == email_clean).first()
    if pending:
        new_otp = generate_verification_otp()
        pending.otp_code = new_otp
        pending.otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
        pending.attempts = 0
        db.commit()
        sent = send_verification_email(recipient=pending.email, full_name=pending.full_name, otp=new_otp)
        if not sent:
            raise HTTPException(
                status_code=502,
                detail="Failed to send verification code email. Please try again later.",
            )
        return {"message": "A new verification code has been sent to your email."}

    # Check existing unverified user in users table
    user = get_user_by_email(db, email_clean)
    if user:
        if user.is_verified:
            return {"message": "Your account is already verified. You can log in directly."}
        new_otp = generate_verification_otp()
        set_verification_code(db, user, new_otp, expires_in_minutes=10)
        sent = send_verification_email(recipient=user.email, full_name=user.full_name, otp=new_otp)
        if not sent:
            raise HTTPException(
                status_code=502,
                detail="Failed to send verification code email. Please try again later.",
            )
        return {"message": "A new verification code has been sent to your email."}

    raise HTTPException(status_code=404, detail="No registration found for this email.")


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=404, detail="User with this email not found")

    otp = generate_verification_otp()
    set_verification_code(db, user, otp, expires_in_minutes=10)
    sent = send_password_reset_email(recipient=user.email, full_name=user.full_name or "User", otp=otp)
    if not sent:
        raise HTTPException(
            status_code=502,
            detail="Failed to send password reset email. Please try again later.",
        )
    return {"message": "Password reset code sent to your email."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    user = reset_user_password(db, payload.email, payload.otp, payload.new_password)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    return {"message": "Password reset successfully. You can now login with your new password."}


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    db: Session = Depends(get_db)
):
    cleaned_username = ""
    password = ""

    content_type = request.headers.get("content-type", "").lower()
    print(f"[AUTH LOGIN] Content-Type: {content_type!r}", flush=True)

    if "application/json" in content_type:
        try:
            body = await request.json()
            cleaned_username = (body.get("email") or body.get("username") or "").strip()
            password = body.get("password") or ""
            print(f"[AUTH LOGIN] Parsed JSON body: username={cleaned_username!r}, pwd_len={len(password)}", flush=True)
        except Exception as e:
            print(f"[AUTH LOGIN] JSON parse error: {e}", flush=True)
    else:
        try:
            form = await request.form()
            cleaned_username = (form.get("username") or form.get("email") or "").strip()
            password = form.get("password") or ""
            print(f"[AUTH LOGIN] Parsed Form body: username={cleaned_username!r}, pwd_len={len(password)}, form_keys={list(form.keys())}", flush=True)
        except Exception as e:
            print(f"[AUTH LOGIN] Form parse error: {e}", flush=True)
            # Try raw body as fallback
            try:
                raw_body = (await request.body()).decode("utf-8")
                from urllib.parse import parse_qs
                parsed = parse_qs(raw_body)
                cleaned_username = (parsed.get("username", [""])[0] or parsed.get("email", [""])[0]).strip()
                password = parsed.get("password", [""])[0]
                print(f"[AUTH LOGIN] Fallback raw parse: username={cleaned_username!r}, pwd_len={len(password)}", flush=True)
            except Exception as e2:
                print(f"[AUTH LOGIN] Fallback raw parse error: {e2}", flush=True)

    user = get_user_by_email(db, cleaned_username)
    if not user:
        print(f"[AUTH LOGIN] User not found for identifier: {cleaned_username!r}", flush=True)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    is_valid = verify_password(password, user.password)
    print(f"[AUTH LOGIN] Password check for {user.email}: valid={is_valid}", flush=True)

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(data={"sub": user.email, "role": role_val})
    return {"access_token": token, "token_type": "bearer"}

def _get_user_assigned_vehicle(db: Session, user: User) -> Optional[dict]:
    if user.role != RoleEnum.Driver:
        return None
    driver = db.query(Driver).filter(Driver.user_id == user.user_id).first()
    if not driver:
        return None
    vehicle = db.query(Vehicle).filter(Vehicle.assigned_driver_id == driver.driver_id).first()
    if not vehicle:
        return None
    return {
        "vehicle_id": str(vehicle.vehicle_id),
        "registration_number": vehicle.registration_number,
        "brand": vehicle.brand,
        "model": vehicle.model,
        "vehicle_type": vehicle.vehicle_type,
        "display_name": f"{vehicle.registration_number} — {vehicle.brand} {vehicle.model}",
    }


@router.get("/me", response_model=UserProfileOut)
def read_current_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    assigned_veh = _get_user_assigned_vehicle(db, current_user)
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "address": current_user.address,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
        "account_status": "Active" if current_user.is_verified else "Pending Verification",
        "created_at": current_user.created_at,
        "assigned_vehicle": assigned_veh,
    }


@router.put("/me", response_model=UserProfileOut)
def update_current_user(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Reject any attempt to modify role through profile update
    if payload.role is not None:
        role_str = payload.role.value if hasattr(payload.role, "value") else str(payload.role)
        current_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if role_str.strip().lower() != current_role_str.strip().lower():
            raise HTTPException(
                status_code=403,
                detail="Modifying user role through profile update is forbidden. Only administrators can adjust account roles.",
            )

    # Reject any attempt to modify email through profile update
    if payload.email is not None:
        if payload.email.strip().lower() != current_user.email.strip().lower():
            if current_user.role == RoleEnum.Driver:
                raise HTTPException(
                    status_code=403,
                    detail="Drivers are not permitted to change their registered email address.",
                )
            else:
                raise HTTPException(
                    status_code=403,
                    detail="Modifying email address through profile update is forbidden.",
                )

    # Reject any attempt to modify assigned vehicle through profile update
    if payload.assigned_vehicle is not None:
        raise HTTPException(
            status_code=403,
            detail="Modifying assigned vehicle through profile update is forbidden.",
        )

    if payload.full_name is not None and payload.full_name.strip():
        current_user.full_name = payload.full_name.strip()

    if payload.phone is not None:
        current_user.phone = payload.phone.strip()

    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(status_code=400, detail="Current password is required to set a new password.")
        if not verify_password(payload.current_password, current_user.password):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        if len(payload.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")
        current_user.password = hash_password(payload.new_password)

    db.commit()
    db.refresh(current_user)

    assigned_veh = _get_user_assigned_vehicle(db, current_user)
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
        "account_status": "Active" if current_user.is_verified else "Pending Verification",
        "created_at": current_user.created_at,
        "assigned_vehicle": assigned_veh,
    }


@router.delete("/me", status_code=204)
def delete_current_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(current_user)
    db.commit()


@router.get("/users", response_model=list[AdminUserListItem])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.Admin)),
):
    users = db.query(User).order_by(User.created_at.asc()).all()
    results = []
    for u in users:
        assigned_veh = _get_user_assigned_vehicle(db, u)
        results.append({
            "user_id": u.user_id,
            "email": u.email,
            "full_name": u.full_name,
            "phone": u.phone,
            "role": u.role,
            "is_verified": u.is_verified,
            "account_status": "Active" if u.is_verified else "Pending Verification",
            "created_at": u.created_at,
            "assigned_vehicle": assigned_veh,
        })
    return results


@router.put("/users/{user_id}/role", response_model=AdminUserListItem)
def update_user_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(RoleEnum.Admin)),
):
    target_user = db.query(User).filter(User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if target_user.user_id == current_user.user_id and payload.role != RoleEnum.Admin:
        raise HTTPException(status_code=400, detail="Administrators cannot change or demote their own role.")

    target_user.role = payload.role

    # If role changed to Driver, provision driver profile if missing
    if payload.role == RoleEnum.Driver:
        existing_driver = db.query(Driver).filter(Driver.user_id == target_user.user_id).first()
        if not existing_driver:
            import uuid as py_uuid
            new_drv = Driver(driver_id=py_uuid.uuid4(), user_id=target_user.user_id, status="Available")
            db.add(new_drv)

    db.commit()
    db.refresh(target_user)

    assigned_veh = _get_user_assigned_vehicle(db, target_user)
    return {
        "user_id": target_user.user_id,
        "email": target_user.email,
        "full_name": target_user.full_name,
        "phone": target_user.phone,
        "role": target_user.role,
        "is_verified": target_user.is_verified,
        "account_status": "Active" if target_user.is_verified else "Pending Verification",
        "created_at": target_user.created_at,
        "assigned_vehicle": assigned_veh,
    }