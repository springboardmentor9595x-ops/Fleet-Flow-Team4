import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.user import Base, User, PendingRegistration, RoleEnum
from app.models.driver import Driver
from app.schemas.user import UserCreate, VerifyOTPRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.crud.user import set_verification_code, verify_user_otp, reset_user_password, get_user_by_email
from app.core.security import hash_password, verify_password
from app.routers.auth import signup, verify_otp, resend_otp, forgot_password, reset_password


class TestAllAuthRolesAndFlows(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.session = self.Session()

        # Seed 4 accounts
        self.admin = User(
            email="satishkoppula741@gmail.com",
            password=hash_password("Admin@123"),
            full_name="Satish Koppula",
            phone="+91 9876543210",
            role=RoleEnum.Admin,
            is_verified=True,
        )
        self.fleet_manager = User(
            email="sravyakoppula684@gmail.com",
            password=hash_password("Fleet@123"),
            full_name="Sravya Koppula",
            phone="+91 9876543211",
            role=RoleEnum.FleetManager,
            is_verified=True,
        )
        self.dispatcher = User(
            email="sravyakoppula885@gmail.com",
            password=hash_password("Dispatch@123"),
            full_name="Sravya K 885",
            phone="+91 9876543212",
            role=RoleEnum.Dispatcher,
            is_verified=True,
        )
        self.driver_user = User(
            email="munnakoppula943@gmail.com",
            password=hash_password("Driver@123"),
            full_name="Munna Koppula",
            phone="+91 9876543213",
            role=RoleEnum.Driver,
            is_verified=True,
        )
        self.session.add_all([self.admin, self.fleet_manager, self.dispatcher, self.driver_user])
        self.session.commit()

        # Add driver profile
        drv_profile = Driver(driver_id=self.driver_user.user_id, user_id=self.driver_user.user_id, status="Available")
        self.session.add(drv_profile)
        self.session.commit()

    def tearDown(self):
        self.session.close()

    def test_1_driver_login_verification(self):
        """1. Test Driver login credential verification."""
        user = get_user_by_email(self.session, "munnakoppula943@gmail.com")
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("Driver@123", user.password))
        self.assertTrue(user.is_verified)
        self.assertEqual(user.role, RoleEnum.Driver)

    def test_2_admin_login_verification(self):
        """2. Test Admin login credential verification."""
        user = get_user_by_email(self.session, "satishkoppula741@gmail.com")
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("Admin@123", user.password))
        self.assertTrue(user.is_verified)
        self.assertEqual(user.role, RoleEnum.Admin)

    def test_3_fleet_manager_login_verification(self):
        """3. Test Fleet Manager login credential verification."""
        user = get_user_by_email(self.session, "sravyakoppula684@gmail.com")
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("Fleet@123", user.password))
        self.assertTrue(user.is_verified)
        self.assertEqual(user.role, RoleEnum.FleetManager)

    def test_4_dispatcher_login_verification(self):
        """4. Test Dispatcher login credential verification."""
        user = get_user_by_email(self.session, "sravyakoppula885@gmail.com")
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("Dispatch@123", user.password))
        self.assertTrue(user.is_verified)
        self.assertEqual(user.role, RoleEnum.Dispatcher)

    @patch("app.routers.auth.send_verification_email", return_value=True)
    def test_5_signup_flow(self, mock_send_email):
        """5 & 6. Test New User Signup and OTP email invocation."""
        user_in = UserCreate(
            email="newuser@example.com",
            password="NewUserPass123!",
            full_name="New Test User",
            phone="+91 9999988888",
            role=RoleEnum.Driver,
        )
        res = signup(user_in, self.session)
        self.assertEqual(res.email, "newuser@example.com")
        self.assertTrue(mock_send_email.called)

        # Check pending registration in DB
        pending = self.session.query(PendingRegistration).filter_by(email="newuser@example.com").first()
        self.assertIsNotNone(pending)
        self.assertIsNotNone(pending.otp_code)

    @patch("app.routers.auth.send_verification_email", return_value=True)
    def test_7_otp_verification_flow(self, mock_send_email):
        """7. Test OTP Verification activates user in DB."""
        user_in = UserCreate(
            email="otpverify@example.com",
            password="VerifyPass123!",
            full_name="OTP Verify User",
            phone="+91 9888877777",
            role=RoleEnum.Driver,
        )
        signup(user_in, self.session)
        pending = self.session.query(PendingRegistration).filter_by(email="otpverify@example.com").first()
        otp = pending.otp_code

        req = VerifyOTPRequest(email="otpverify@example.com", otp=otp)
        verified_user = verify_otp(req, self.session)
        self.assertIsNotNone(verified_user)
        self.assertTrue(verified_user.is_verified)
        self.assertEqual(verified_user.email, "otpverify@example.com")

        # Confirm pending registration was cleaned up
        pending_after = self.session.query(PendingRegistration).filter_by(email="otpverify@example.com").first()
        self.assertIsNone(pending_after)

    @patch("app.routers.auth.send_password_reset_email", return_value=True)
    def test_8_forgot_password_flow(self, mock_send_email):
        """8. Test Forgot Password triggers OTP reset email."""
        req = ForgotPasswordRequest(email="satishkoppula741@gmail.com")
        res = forgot_password(req, self.session)
        self.assertIn("Password reset code sent", res["message"])
        self.assertTrue(mock_send_email.called)

    def test_9_password_reset_flow(self):
        """9. Test Password Reset updates password hash."""
        user = get_user_by_email(self.session, "sravyakoppula684@gmail.com")
        set_verification_code(self.session, user, "123456", expires_in_minutes=10)

        reset_req = ResetPasswordRequest(
            email="sravyakoppula684@gmail.com",
            otp="123456",
            new_password="NewFleetPass123!"
        )
        res = reset_password(reset_req, self.session)
        self.assertIn("Password reset successfully", res["message"])

        # Confirm new password works
        user_after = get_user_by_email(self.session, "sravyakoppula684@gmail.com")
        self.assertTrue(verify_password("NewFleetPass123!", user_after.password))


if __name__ == "__main__":
    unittest.main()
