import json
import logging
import secrets
import smtplib
import ssl
import string
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


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
        _log_verification_fallback(recipient=recipient, subject=subject)
        logger.exception("Email delivery failed, using OTP fallback: %s", exc)
        return False


def send_password_reset_email(recipient: str, full_name: str, otp: str) -> bool:
    subject = "Reset your FleetFlow password"
    body = (
        f"Hello {full_name},\n\n"
        "We received a request to reset your password for FleetFlow. Use the verification code below to set your new password:\n\n"
        f"Reset Code (OTP): {otp}\n\n"
        "This code will expire in 10 minutes.\n\n"
        "If you did not request a password reset, please ignore this email.\n\n"
        "Best regards,\nFleetFlow Team"
    )
    html = (
        f"<p>Hello {full_name},</p>"
        "<p>We received a request to reset your password for <strong>FleetFlow</strong>. Use the verification code below to set your new password:</p>"
        f"<p style=\"font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #6C63FF;\">{otp}</p>"
        "<p>This code will expire in 10 minutes.</p>"
        "<p>If you did not request a password reset, you can safely ignore this email.</p>"
        "<p>Best regards,<br/>FleetFlow Team</p>"
    )

    try:
        send_email(subject=subject, recipient=recipient, body=body, html=html)
        return True
    except Exception as exc:
        _log_verification_fallback(recipient=recipient, subject=subject)
        logger.exception("Email delivery failed, using OTP fallback: %s", exc)
        return False


def _log_verification_fallback(recipient: str, subject: str) -> None:
    logger.warning(
        "Mail delivery unavailable. OTP fallback enabled. recipient=%s subject=%s",
        recipient,
        subject,
    )


def send_email_resend(subject: str, recipient: str, body: str, html: Optional[str] = None) -> None:
    api_key = settings.RESEND_API_KEY
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured.")

    smtp_from = settings.SMTP_FROM_EMAIL or settings.SMTP_FROM or "onboarding@resend.dev"
    smtp_from_name = settings.SMTP_FROM_NAME or "FleetFlow"
    sender = f"{smtp_from_name} <{smtp_from}>" if smtp_from_name and "<" not in smtp_from else smtp_from

    payload = {
        "from": sender,
        "to": [recipient],
        "subject": subject,
        "text": body,
    }
    if html:
        payload["html"] = html

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "FleetFlow/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status not in (200, 201):
                res_body = resp.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"Resend API HTTP error {resp.status}: {res_body}")
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Resend API HTTP error {err.code}: {err_body}")
    except Exception as exc:
        raise RuntimeError(f"Resend HTTPS request failed: {exc}")


def send_email_smtp(subject: str, recipient: str, body: str, html: Optional[str] = None) -> None:
    smtp_user = settings.SMTP_USERNAME or settings.SMTP_USER
    smtp_from = settings.SMTP_FROM_EMAIL or settings.SMTP_FROM or smtp_user
    smtp_from_name = settings.SMTP_FROM_NAME or "Fleet Manager"

    if not settings.SMTP_HOST or not smtp_user or not settings.SMTP_PASSWORD or not smtp_from:
        raise RuntimeError("SMTP settings are not configured properly.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{smtp_from_name} <{smtp_from}>" if smtp_from_name else smtp_from
    message["To"] = recipient
    message.set_content(body)

    if html:
        message.add_alternative(html, subtype="html")

    port = settings.SMTP_PORT
    context = ssl.create_default_context()

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, port, context=context, timeout=10) as server:
            server.login(smtp_user, settings.SMTP_PASSWORD)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, port, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls(context=context)
            server.login(smtp_user, settings.SMTP_PASSWORD)
            server.send_message(message)


def send_email(subject: str, recipient: str, body: str, html: Optional[str] = None) -> None:
    provider = (settings.EMAIL_PROVIDER or "resend").lower()
    if provider == "resend" or settings.RESEND_API_KEY:
        send_email_resend(subject=subject, recipient=recipient, body=body, html=html)
    elif provider == "smtp":
        send_email_smtp(subject=subject, recipient=recipient, body=body, html=html)
    else:
        try:
            send_email_resend(subject=subject, recipient=recipient, body=body, html=html)
        except Exception:
            send_email_smtp(subject=subject, recipient=recipient, body=body, html=html)
