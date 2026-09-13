import uuid
from sqlalchemy import func
from app.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.driver import Driver
from app.core.security import hash_password, verify_password

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
                if not verify_password(acc["password"], user.password or ""):
                    user.password = hash_password(acc["password"])
                user.is_verified = True
                user.role = acc["role"]
                print(f"[SEED UPDATE] {email} (Role={user.role.value}, Verified=True)", flush=True)
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
                print(f"[SEED CREATE] {email} (Role={user.role.value}, Verified=True)", flush=True)

            if acc["role"] == RoleEnum.Driver:
                if not db.query(Driver).filter(Driver.user_id == user.user_id).first():
                    db.add(Driver(driver_id=uuid.uuid4(), user_id=user.user_id, status="Available"))
                    print(f"[SEED DRIVER] Provisioned driver profile for {email}", flush=True)

        db.commit()
        print("[SEED SUCCESS] All 4 demo accounts seeded successfully!", flush=True)
    except Exception as e:
        db.rollback()
        print(f"[SEED ERROR] Seeding failed: {e}", flush=True)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed()
