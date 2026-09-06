import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.crud.user import set_verification_code, verify_user_otp
from app.models.user import Base, RoleEnum, User


def test_verification_code_is_accepted_and_cleared():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        user = User(
            email="otp@example.com",
            password="hashed",
            full_name="OTP User",
            phone="123",
            role=RoleEnum.Driver,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        set_verification_code(session, user, "123456", expires_in_minutes=5)

        verified = verify_user_otp(session, user.email, "123456")
        assert verified is not None
        assert verified.is_verified is True
        assert verified.verification_code is None

        session.refresh(verified)
        assert verified.verification_code is None


def test_unverified_user_signup_retry():
    from fastapi import HTTPException
    import pytest
    from app.schemas.user import UserCreate
    from app.routers.auth import signup

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        # Create unverified user
        user_in = UserCreate(
            email="retry@example.com",
            password="Password123!",
            full_name="First Attempt",
            phone="111",
            role=RoleEnum.Driver
        )
        res1 = signup(user_in, session)
        assert res1.email == "retry@example.com"
        assert res1.full_name == "First Attempt"
        assert res1.is_verified is False

        # Attempt to signup again with same email but different details - should replace unverified record
        user_in2 = UserCreate(
            email="retry@example.com",
            password="NewPassword123!",
            full_name="Second Attempt",
            phone="222",
            role=RoleEnum.Driver
        )
        res2 = signup(user_in2, session)
        assert res2.email == "retry@example.com"
        assert res2.full_name == "Second Attempt"
        assert res2.is_verified is False

        # Once user is verified, signup attempt with same email must fail with 400
        res2.is_verified = True
        session.commit()

        user_in3 = UserCreate(
            email="retry@example.com",
            password="ThirdPassword123!",
            full_name="Third Attempt",
            phone="333",
            role=RoleEnum.Driver
        )
        with pytest.raises(HTTPException) as excinfo:
            signup(user_in3, session)
        assert excinfo.value.status_code == 400
        assert excinfo.value.detail == "Email already registered"


def test_signup_preserves_unverified_state_when_verification_email_fails(monkeypatch):
    from app.routers.auth import signup
    from app.schemas.user import UserCreate
    import app.routers.auth as auth_router

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def raise_email_error(*args, **kwargs):
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr(auth_router, "send_verification_email", raise_email_error)

    with Session() as session:
        user_in = UserCreate(
            email="fallback@example.com",
            password="Password123!",
            full_name="Fallback User",
            phone="999",
            role=RoleEnum.Driver,
        )
        res = signup(user_in, session)
        assert res.email == "fallback@example.com"

        session.expire_all()
        db_user = session.query(User).filter(User.email == "fallback@example.com").first()
        assert db_user is not None
        assert db_user.is_verified is False
        assert db_user.verification_code is not None


def test_password_normalization_commits():
    from fastapi.security import OAuth2PasswordRequestForm
    from app.routers.auth import login
    from app.core.security import verify_password

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        # Create verified user with plain-text password
        user = User(
            email="plaintext@example.com",
            password="plain_password",
            full_name="Plain Text User",
            phone="123",
            role=RoleEnum.Driver,
            is_verified=True,
        )
        session.add(user)
        session.commit()

        form_data = OAuth2PasswordRequestForm(
            username="plaintext@example.com",
            password="plain_password",
            scope="",
            client_id=None,
            client_secret=None,
            grant_type="password"
        )
        # Login should trigger password normalization and hashing
        res = login(form_data, session)
        assert res["access_token"] is not None

        # Verify that database password is now hashed (not plaintext anymore)
        session.expire_all()
        db_user = session.query(User).filter(User.email == "plaintext@example.com").first()
        assert db_user.password != "plain_password"
        assert verify_password("plain_password", db_user.password)