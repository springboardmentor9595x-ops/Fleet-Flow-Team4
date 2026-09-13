"""
Seed / reset demo account passwords in the database.
Run this whenever Docker DB is recreated or passwords need resetting.

Usage (from the project root with docker-compose):
    docker exec fleetflow_backend python /app/seed_demo_accounts.py

Or locally (backend/ dir with venv active):
    python seed_demo_accounts.py
"""
import sys, os, uuid
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from app.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.driver import Driver
from app.core.security import hash_password, verify_password
from sqlalchemy import func

DEMO_ACCOUNTS = [
    {"email": "satishkoppula741@gmail.com",  "password": "Admin@123",    "full_name": "Satish Koppula", "role": RoleEnum.Admin},
    {"email": "sravyakoppula684@gmail.com",  "password": "Fleet@123",    "full_name": "Sravya Koppula", "role": RoleEnum.FleetManager},
    {"email": "sravyakoppula885@gmail.com",  "password": "Dispatch@123", "full_name": "Sravya K 885",   "role": RoleEnum.Dispatcher},
    {"email": "munnakoppula943@gmail.com",   "password": "Driver@123",   "full_name": "Munna Koppula",  "role": RoleEnum.Driver},
]

def seed():
    db = SessionLocal()
    try:
        for acc in DEMO_ACCOUNTS:
            email = acc["email"].strip().lower()
            user = db.query(User).filter(func.lower(User.email) == email).first()
            if user:
                if not verify_password(acc["password"], user.password):
                    user.password = hash_password(acc["password"])
                user.is_verified = True
                print(f"[UPDATE DEMO USER] {email}")
            else:
                user = User(
                    user_id=uuid.uuid4(),
                    email=email,
                    password=hash_password(acc["password"]),
                    full_name=acc["full_name"],
                    role=acc["role"],
                    is_verified=True
                )
                db.add(user)
                db.flush()
                print(f"[CREATE DEMO USER] {email}")

            if acc["role"] == RoleEnum.Driver:
                if not db.query(Driver).filter(Driver.user_id == user.user_id).first():
                    db.add(Driver(driver_id=uuid.uuid4(), user_id=user.user_id, status="Available"))
        db.commit()
        print("[SUCCESS] All demo accounts seeded!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Seeding demo accounts failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

