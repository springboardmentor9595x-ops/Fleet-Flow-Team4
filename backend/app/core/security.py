import logging
from datetime import datetime, timedelta
import bcrypt
from jose import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False

    try:
        return pwd_context.verify(plain, hashed)
    except Exception as exc:
        logger.warning("passlib verify failed (%s), trying raw bcrypt fallback", exc)
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False


def normalize_password_for_user(user: User, plain_password: str) -> bool:
    if not user or not plain_password or not user.password:
        return False

    if verify_password(plain_password, user.password):
        return True

    if user.password == plain_password:
        user.password = hash_password(plain_password)
        return True

    return False

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)