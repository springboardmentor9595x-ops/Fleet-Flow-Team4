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
            try:
                user = db.query(User).filter(func.lower(User.email) == email).first()
                if user:
                    user.password = hash_password(acc["password"])
                    user.is_verified = True
                    user.role = acc["role"]
                    db.commit()
                    print(f"[UPDATED DEMO ACCOUNT] {email}", flush=True)
                else:
                    user = User(
                        email=email,
                        password=hash_password(acc["password"]),
                        full_name=acc["full_name"],
                        role=acc["role"],
                        is_verified=True,
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                    print(f"[CREATED DEMO ACCOUNT] {email}", flush=True)

                if acc["role"] == RoleEnum.Driver and user and user.user_id:
                    try:
                        driver_record = db.query(Driver).filter(Driver.user_id == user.user_id).first()
                        if not driver_record:
                            db.add(Driver(driver_id=uuid.uuid4(), user_id=user.user_id, status="Available"))
                            db.commit()
                    except Exception as de:
                        db.rollback()
                        print(f"[DRIVER RECORD NOTICE] {de}", flush=True)

            except Exception as acc_err:
                db.rollback()
                print(f"[DEMO ACCOUNT SEED ERROR for {email}] {acc_err}", flush=True)

        print("[DEMO SEED COMPLETE] All demo accounts processed!", flush=True)
    finally:
        db.close()

if __name__ == "__main__":
    seed()
