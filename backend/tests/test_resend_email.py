import json
import logging
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.config import Settings
from app.core.email import (
    send_email_resend,
    send_verification_email,
    send_password_reset_email,
    _log_verification_fallback,
    send_email,
    get_resend_sender_address,
)
from app.models.user import Base, User, PendingRegistration, RoleEnum
from app.schemas.user import UserCreate, ForgotPasswordRequest
from app.routers.auth import signup, resend_otp, forgot_password


class TestResendEmail(unittest.TestCase):

    def test_resend_config_loading(self):
        """1. Test Resend configuration loading from environment."""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://user:pass@localhost:5432/db",
            "SECRET_KEY": "secret",
            "ALGORITHM": "HS256",
            "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
            "EMAIL_PROVIDER": "resend",
            "RESEND_API_KEY": "re_test_key_123",
            "SMTP_FROM": "onboarding@resend.dev",
            "SMTP_FROM_NAME": "FleetFlow",
        }):
            settings = Settings()
            self.assertEqual(settings.EMAIL_PROVIDER, "resend")
            self.assertEqual(settings.RESEND_API_KEY, "re_test_key_123")
            self.assertEqual(settings.SMTP_FROM, "onboarding@resend.dev")
            self.assertEqual(settings.SMTP_FROM_NAME, "FleetFlow")

    @patch("urllib.request.urlopen")
    def test_resend_email_request_construction(self, mock_urlopen):
        """2. Test Resend email HTTPS request is constructed correctly."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        with patch("app.config.settings.RESEND_API_KEY", "re_test_key_123"), \
             patch("app.config.settings.SMTP_FROM", "onboarding@resend.dev"), \
             patch("app.config.settings.SMTP_FROM_NAME", "FleetFlow"):

            send_email_resend(
                subject="Test Subject",
                recipient="user@example.com",
                body="Test body text",
                html="<p>Test body html</p>",
            )

            self.assertTrue(mock_urlopen.called)
            req = mock_urlopen.call_args[0][0]

            self.assertEqual(req.full_url, "https://api.resend.com/emails")
            self.assertEqual(req.headers.get("Authorization"), "Bearer re_test_key_123")
            self.assertEqual(req.headers.get("Content-type"), "application/json")

            payload = json.loads(req.data.decode("utf-8"))
            self.assertEqual(payload["from"], "FleetFlow <onboarding@resend.dev>")
            self.assertEqual(payload["to"], ["user@example.com"])
            self.assertEqual(payload["subject"], "Test Subject")
            self.assertEqual(payload["text"], "Test body text")
            self.assertEqual(payload["html"], "<p>Test body html</p>")

    @patch("urllib.request.urlopen")
    def test_resend_successful_response(self, mock_urlopen):
        """3. Test successful Resend response (200 / 201)."""
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        with patch("app.config.settings.RESEND_API_KEY", "re_test_key_123"):
            try:
                send_email_resend(
                    subject="Success Test",
                    recipient="user@example.com",
                    body="Hello",
                )
            except Exception as e:
                self.fail(f"send_email_resend raised an unexpected exception: {e}")

    @patch("urllib.request.urlopen")
    def test_resend_403_failure_handling(self, mock_urlopen):
        """4. Test Resend failure handling for HTTP 403 testing mode error."""
        error_json = json.dumps({
            "name": "validation_error",
            "message": "You can only send testing emails to your own email address (munnakoppula943@gmail.com). To send emails to other recipients, please verify a domain."
        }).encode("utf-8")
        mock_err = urllib.error.HTTPError(
            url="https://api.resend.com/emails",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=MagicMock(read=MagicMock(return_value=error_json)),
        )
        mock_urlopen.side_effect = mock_err

        with patch("app.config.settings.RESEND_API_KEY", "re_test_key_123"):
            with self.assertRaises(RuntimeError) as ctx:
                send_email_resend(
                    subject="Fail Test",
                    recipient="sravyakoppula885@gmail.com",
                    body="Hello",
                )
            self.assertIn("Resend HTTP 403", str(ctx.exception))
            self.assertIn("You can only send testing emails to your own email address", str(ctx.exception))

    def test_resend_missing_api_key(self):
        """5. Test exception when RESEND_API_KEY is missing."""
        with patch("app.config.settings.RESEND_API_KEY", None):
            with self.assertRaises(RuntimeError) as ctx:
                send_email_resend(
                    subject="Missing Key Test",
                    recipient="user@example.com",
                    body="Hello",
                )
            self.assertIn("RESEND_API_KEY environment variable is missing", str(ctx.exception))

    @patch("app.core.email.send_email")
    def test_send_verification_email_invoked(self, mock_send_email):
        """6. Test signup calls the verification email function."""
        mock_send_email.return_value = None
        result = send_verification_email(
            recipient="signup@example.com",
            full_name="Jane Doe",
            otp="654321",
        )
        self.assertTrue(result)
        self.assertTrue(mock_send_email.called)
        kwargs = mock_send_email.call_args[1]
        self.assertEqual(kwargs["recipient"], "signup@example.com")
        self.assertIn("Verify your FleetFlow account", kwargs["subject"])
        self.assertIn("654321", kwargs["body"])

    def test_no_secrets_in_safe_log(self):
        """7. Test no API secret or OTP appears in fallback warning logs."""
        with patch.object(logging.getLogger("app.core.email"), "warning") as mock_log:
            with patch("app.config.settings.RESEND_API_KEY", "re_SECRET_KEY_123456789"):
                _log_verification_fallback(
                    recipient="user@example.com",
                    subject="Verify Email",
                    exc=RuntimeError("Connection failed with re_SECRET_KEY_123456789"),
                )
                self.assertTrue(mock_log.called)
                log_args = str(mock_log.call_args)
                self.assertNotIn("re_SECRET_KEY_123456789", log_args)
                self.assertIn("[REDACTED_API_KEY]", log_args)

    @patch("app.core.email.send_email")
    def test_password_reset_email_flow(self, mock_send_email):
        """8. Test password-reset email flow."""
        mock_send_email.return_value = None
        result = send_password_reset_email(
            recipient="reset@example.com",
            full_name="Reset User",
            otp="999888",
        )
        self.assertTrue(result)
        self.assertTrue(mock_send_email.called)
        kwargs = mock_send_email.call_args[1]
        self.assertEqual(kwargs["recipient"], "reset@example.com")
        self.assertIn("Reset your FleetFlow password", kwargs["subject"])
        self.assertIn("999888", kwargs["body"])

    def test_gmail_unverified_domain_replacement(self):
        """9. Test that public webmail domains like gmail.com are replaced with onboarding@resend.dev for Resend."""
        with patch("app.config.settings.SMTP_FROM", "testuser@gmail.com"), \
             patch("app.config.settings.RESEND_FROM", None), \
             patch("app.config.settings.SMTP_FROM_EMAIL", None):
            self.assertEqual(get_resend_sender_address(), "onboarding@resend.dev")

        with patch("app.config.settings.RESEND_FROM", "verified@mycompany.com"):
            self.assertEqual(get_resend_sender_address(), "verified@mycompany.com")

    def test_signup_email_delivery_failure_raises_502(self):
        """10. Test signup endpoint returns HTTP 502 Bad Gateway when email delivery fails."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as session:
            user_in = UserCreate(
                email="fail_delivery@example.com",
                password="Password123!",
                full_name="Fail User",
                phone="+91 9876543210",
                role=RoleEnum.Driver,
            )
            with patch("app.routers.auth.send_verification_email", return_value=False), \
                 patch("app.routers.auth.get_last_email_error", return_value="Resend HTTP 403: Testing domain restriction"):
                with self.assertRaises(HTTPException) as ctx:
                    signup(user_in, session)

                self.assertEqual(ctx.exception.status_code, 502)
                self.assertIn("Failed to send verification code email", ctx.exception.detail)
                self.assertIn("Resend HTTP 403", ctx.exception.detail)

            # Confirm pending registration was cleaned up cleanly
            pending = session.query(PendingRegistration).filter_by(email="fail_delivery@example.com").first()
            self.assertIsNone(pending)

    def test_resend_otp_email_delivery_failure_raises_502(self):
        """11. Test resend_otp endpoint returns HTTP 502 Bad Gateway when email delivery fails."""
        from datetime import datetime, timedelta
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as session:
            pending = PendingRegistration(
                email="pending_resend@example.com",
                full_name="Pending Resend",
                phone="+91 9876543210",
                role=RoleEnum.Driver,
                password_hash="hash",
                otp_code="123456",
                otp_expires_at=datetime.utcnow() + timedelta(minutes=10),
            )
            session.add(pending)
            session.commit()

            with patch("app.routers.auth.send_verification_email", return_value=False), \
                 patch("app.routers.auth.get_last_email_error", return_value="Resend HTTP 403: Testing domain restriction"):
                with self.assertRaises(HTTPException) as ctx:
                    resend_otp("pending_resend@example.com", session)

                self.assertEqual(ctx.exception.status_code, 502)
                self.assertIn("Failed to send verification code email", ctx.exception.detail)

    def test_forgot_password_email_delivery_failure_raises_502(self):
        """12. Test forgot_password endpoint returns HTTP 502 Bad Gateway when email delivery fails."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as session:
            user = User(
                email="forgot@example.com",
                password="hashed_password",
                full_name="Forgot User",
                phone="+91 9876543210",
                role=RoleEnum.Driver,
                is_verified=True,
            )
            session.add(user)
            session.commit()

            req = ForgotPasswordRequest(email="forgot@example.com")
            with patch("app.routers.auth.send_password_reset_email", return_value=False), \
                 patch("app.routers.auth.get_last_email_error", return_value="Resend HTTP 403: Testing domain restriction"):
                with self.assertRaises(HTTPException) as ctx:
                    forgot_password(req, session)

                self.assertEqual(ctx.exception.status_code, 502)
                self.assertIn("Failed to send password reset email", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
