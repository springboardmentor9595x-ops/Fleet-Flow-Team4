import os

from app.config import Settings


def test_strips_surrounding_quotes_from_smtp_credentials(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:test@localhost:5432/fleetflow_db")
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("ALGORITHM", "HS256")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", '"test@example.com"')
    monkeypatch.setenv("SMTP_PASSWORD", '"app-password"')
    monkeypatch.setenv("SMTP_FROM", '"sender@example.com"')

    settings = Settings()

    assert settings.SMTP_USER == "test@example.com"
    assert settings.SMTP_PASSWORD == "app-password"
    assert settings.SMTP_FROM == "sender@example.com"
