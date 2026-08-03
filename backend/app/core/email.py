import logging
import secrets
import smtplib
import ssl
import string
from email.message import EmailMessage
from typing import Optional

from app.config import settings


def generate_verification_otp(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def send_verification_email(recipient: str, full_name: str, otp: str, app_url: Optional[str] = None) -> bool:
    verification_link = f"{app_url or settings.APP_BASE_URL}/verify-otp?email={recipient}&otp={otp}"
    subject = "Verify your FleetFlow account"
    body = (
        f"Hello {full_name},\n\n"
        "Thanks for signing up for FleetFlow. To complete your registration, use the verification code below:\n\n"
        f"Verification code: {otp}\n\n"
        f"You can also verify directly here: {verification_link}\n\n"
        "If you did not create this account, you can safely ignore this email.\n\n"
        "Best regards,\nFleetFlow Team"
    )
    html = (
        f"<p>Hello {full_name},</p>"
        "<p>Thanks for signing up for <strong>FleetFlow</strong>. To complete your registration, use the verification code below.</p>"
        f"<p><strong>Verification code:</strong> {otp}</p>"
        f"<p>You can also verify directly <a href=\"{verification_link}\">here</a>.</p>"
        "<p>If you did not create this account, you can safely ignore this email.</p>"
        "<p>Best regards,<br/>FleetFlow Team</p>"
    )

    try:
        send_email(subject=subject, recipient=recipient, body=body, html=html)
        return True
    except Exception as exc:
        _log_verification_fallback(recipient=recipient, otp=otp, subject=subject)
        logger.exception("Email delivery failed, using OTP fallback: %s", exc)
        return False


logger = logging.getLogger(__name__)


def _log_verification_fallback(recipient: str, otp: str, subject: str) -> None:
    logger.warning(
        "SMTP mail delivery unavailable. OTP fallback enabled. recipient=%s subject=%s otp=%s",
        recipient,
        subject,
        otp,
    )
    print(f"[OTP-FALLBACK] recipient={recipient} subject={subject} otp={otp}")


def send_email(subject: str, recipient: str, body: str, html: Optional[str] = None) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD or not settings.SMTP_FROM:
        raise RuntimeError("SMTP settings are not configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM
    message["To"] = recipient
    message.set_content(body)

    if html:
        message.add_alternative(html, subtype="html")

    port = settings.SMTP_PORT
    context = ssl.create_default_context()

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, port, context=context) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, port) as server:
            if settings.SMTP_USE_TLS:
                server.starttls(context=context)
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
