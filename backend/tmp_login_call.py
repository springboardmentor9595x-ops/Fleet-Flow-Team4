import traceback
from fastapi import BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from app.routers.auth import login
from app.database import SessionLocal

try:
    db = SessionLocal()
    form = OAuth2PasswordRequestForm(
        username='test@example.com',
        password='pass',
        scope='',
        client_id=None,
        client_secret=None,
        grant_type='password',
    )
    print(login(BackgroundTasks(), form, db))
except Exception:
    traceback.print_exc()
finally:
    db.close()
