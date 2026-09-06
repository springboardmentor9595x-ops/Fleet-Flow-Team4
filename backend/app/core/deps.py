from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database import get_db
from app.crud.user import get_user_by_email
from app.core.security import SECRET_KEY, ALGORITHM
from app.models.user import RoleEnum

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    print('DEBUG: get_current_user called', {'token': token})
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        print('DEBUG: JWTError in get_current_user')
        raise credentials_exception
    user = get_user_by_email(db, email)
    if user is None:
        print('DEBUG: user not found for email', email)
        raise credentials_exception
    print('DEBUG: get_current_user returning', {'email': email, 'role': user.role})
    return user


def require_roles(*allowed_roles: RoleEnum):
    def role_checker(current_user = Depends(get_current_user)):
        user_role_val = getattr(current_user, "role", None)
        user_role_str = str(user_role_val.value if hasattr(user_role_val, "value") else user_role_val).strip().lower().replace(" ", "").replace("_", "")
        allowed_roles_str = [
            str(r.value if hasattr(r, "value") else r).strip().lower().replace(" ", "").replace("_", "")
            for r in allowed_roles
        ]
        if user_role_str not in allowed_roles_str:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user
    return role_checker