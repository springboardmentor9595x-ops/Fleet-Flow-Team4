import json
import logging
import re
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

_last_email_error: Optional[str] = None


def get_last_email_error() -> Optional[str]:
    """Returns the last sanitized email error message, or None if the last send succeeded."""
    return _last_email_error


def _sanitize_error_message(err_msg: str) -> str:
    """Removes sensitive keys, passwords, and tokens from error strings."""
    if not err_msg:
        return "Unknown email error"
    if settings.RESEND_API_KEY and settings.RESEND_API_KEY in err_msg:
        err_msg = err_msg.replace(settings.RESEND_API_KEY, "[REDACTED_API_KEY]")
    if settings.SMTP_PASSWORD and settings.SMTP_PASSWORD in err_msg:
        err_msg = err_msg.replace(settings.SMTP_PASSWORD, "[REDACTED_PASSWORD]")

    err_msg = re.sub(r're_[A-Za-z0-9_]{10,}', 're_[REDACTED]', err_msg)
    err_msg = re.sub(r'Bearer\s+[A-Za-z0-9_\-\.]+', 'Bearer [REDACTED]', err_msg, flags=re.IGNORECASE)
    return err_msg


def generate_verification_otp(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def get_resend_sender_address() -> str:
    """
    Returns a valid Resend FROM email address.
    Resend forbids sending from unverified public webmail domains like @gmail.com, @yahoo.com, @hotmail.com.
    If a custom verified domain is provided via RESEND_FROM / SMTP_FROM_EMAIL / SMTP_FROM and is NOT a public webmail domain, it is used.
    Otherwise, defaults to 'onboarding@resend.dev'.
    """
    raw_from = settings.RESEND_FROM or settings.SMTP_FROM_EMAIL or settings.SMTP_FROM
    if raw_from:
        raw_from = raw_from.strip()
        match = re.search(r'<([^>]+)>', raw_from)
        clean_email = match.group(1) if match else raw_from

        lower_email = clean_email.lower()
        public_webmail_domains = ('@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com', '@aol.com')
        if not any(lower_email.endswith(dom) for dom in public_webmail_domains):
            return clean_email

    return "onboarding@resend.dev"


def send_verification_email(recipient: str, full_name: str, otp: str, app_url: Optional[str] = None) -> bool:
    global _last_email_error
    _last_email_error = None

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
        _last_email_error = None
        return True
    except Exception as exc:
        _log_verification_fallback(recipient=recipient, subject=subject, exc=exc)
        return False


def send_password_reset_email(recipient: str, full_name: str, otp: str) -> bool:
    global _last_email_error
    _last_email_error = None

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
        _last_email_error = None
        return True
    except Exception as exc:
        _log_verification_fallback(recipient=recipient, subject=subject, exc=exc)
        return False


def _log_verification_fallback(recipient: str, subject: str, exc: Optional[Exception] = None) -> None:
    global _last_email_error
    provider = (settings.EMAIL_PROVIDER or "resend").lower()
    raw_err = str(exc) if exc else "Unknown error"
    sanitized_err = _sanitize_error_message(raw_err)

    _last_email_error = sanitized_err

    logger.warning(
        "Email delivery failed [provider=%s] recipient=%s subject=%s error=%s",
        provider,
        recipient,
        subject,
        sanitized_err,
    )


def send_email_resend(subject: str, recipient: str, body: str, html: Optional[str] = None) -> None:
    api_key = settings.RESEND_API_KEY
    if not api_key:
        raise RuntimeError("RESEND_API_KEY environment variable is missing.")

    smtp_from = get_resend_sender_address()
    smtp_from_name = settings.SMTP_FROM_NAME or "FleetFlow"
    sender = f"{smtp_from_name} <{smtp_from}>" if smtp_from_name and "<" not in smtp_from else smtp_from

    # Try official resend SDK if installed
    try:
        import resend
        resend.api_key = api_key
        params = {
            "from": sender,
            "to": [recipient],
            "subject": subject,
            "text": body,
        }
        if html:
            params["html"] = html
        resend.Emails.send(params)
        return
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("Resend SDK call failed, using HTTPS REST API fallback: %s", exc)

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
                raise RuntimeError(f"Resend HTTP {resp.status}: {res_body[:300]}")
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        msg_text = err_body
        try:
            data = json.loads(err_body)
            if isinstance(data, dict):
                if "message" in data:
                    msg_text = data["message"]
                elif "error" in data and isinstance(data["error"], dict) and "message" in data["error"]:
                    msg_text = data["error"]["message"]
                elif "name" in data and "message" in data:
                    msg_text = f"{data['name']}: {data['message']}"
        except Exception:
            pass
        raise RuntimeError(f"Resend HTTP {err.code}: {msg_text[:300]}")
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

