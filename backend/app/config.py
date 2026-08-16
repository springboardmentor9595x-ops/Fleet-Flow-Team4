from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    APP_BASE_URL: str = "http://localhost:3000"
    ADMIN_EMAIL: str = "admin@example.com"

    @field_validator("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", mode="before")
    @classmethod
    def strip_surrounding_quotes(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
                return value[1:-1]
        return value


settings = Settings()