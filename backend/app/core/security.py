import logging
from datetime import datetime, timedelta
import bcrypt
from jose import jwt
from passlib.context import CryptContext
from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

# Fallback passlib context for legacy schemes if needed
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES


def hash_password(password: str) -> str:
    """
    Hash password using standard bcrypt with UTF-8 encoding and 72-byte max boundary.
    """
    if not password:
        return ""
    pw_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify plain password against stored hash.
    Supports bcrypt ($2a$, $2b$, $2y$), passlib hashes, and plaintext fallback.
    """
    if not plain or not hashed:
        return False

    pw_bytes = plain.encode("utf-8")[:72]

    # 1. Standard bcrypt checkpw
    try:
        if hashed.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(pw_bytes, hashed.encode("utf-8"))
    except Exception as exc:
        logger.warning("bcrypt checkpw error: %s", exc)

    # 2. Passlib verify fallback for legacy schemes
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        pass

    # 3. Plaintext comparison (legacy/fallback)
    return plain == hashed


def normalize_password_for_user(user: User, plain_password: str) -> bool:
    """
    Verifies entered plain password against the user's existing stored password hash.
    DOES NOT overwrite or modify existing stored password hashes.
    """
    if not user or not plain_password or not user.password:
        return False

    return verify_password(plain_password, user.password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)