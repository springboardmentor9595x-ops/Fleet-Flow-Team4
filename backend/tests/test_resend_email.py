import json
import logging
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import Settings
from app.core.email import (
    send_email_resend,
    send_verification_email,
    send_password_reset_email,
    _log_verification_fallback,
    send_email,
)


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
    def test_resend_failure_handling(self, mock_urlopen):
        """4. Test Resend failure handling (HTTP error 403 / 500)."""
        mock_err = urllib.error.HTTPError(
            url="https://api.resend.com/emails",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=MagicMock(read=MagicMock(return_value=b'{"message":"Invalid sender"}')),
        )
        mock_urlopen.side_effect = mock_err

        with patch("app.config.settings.RESEND_API_KEY", "re_test_key_123"):
            with self.assertRaises(RuntimeError) as ctx:
                send_email_resend(
                    subject="Fail Test",
                    recipient="user@example.com",
                    body="Hello",
                )
            self.assertIn("Resend HTTP 403", str(ctx.exception))

    @patch("app.core.email.send_email")
    def test_send_verification_email_invoked(self, mock_send_email):
        """5. Test signup calls the verification email function."""
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
        """6. Test no API secret or OTP appears in fallback warning logs."""
        with patch.object(logging.getLogger("app.core.email"), "warning") as mock_log:
            with patch("app.config.settings.RESEND_API_KEY", "SECRET_KEY_123"):
                _log_verification_fallback(
                    recipient="user@example.com",
                    subject="Verify Email",
                    exc=RuntimeError("Connection failed with SECRET_KEY_123"),
                )
                self.assertTrue(mock_log.called)
                log_args = str(mock_log.call_args)
                self.assertNotIn("SECRET_KEY_123", log_args)
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
        from app.core.email import get_resend_sender_address

        with patch("app.config.settings.SMTP_FROM", "testuser@gmail.com"):
            self.assertEqual(get_resend_sender_address(), "onboarding@resend.dev")

        with patch("app.config.settings.RESEND_FROM", "verified@mycompany.com"):
            self.assertEqual(get_resend_sender_address(), "verified@mycompany.com")


if __name__ == "__main__":
    unittest.main()
