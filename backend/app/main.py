import asyncio
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, vehicle, shipment, trip, gps_tracking, tracking_ws, driver, maintenance, fuel_record, notification, reports, attendance

app = FastAPI(title="FleetFlow API")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://fleetflow-frontend-8p19.onrender.com",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    for url in frontend_url.split(","):
        cleaned = url.strip()
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(vehicle.router, prefix="/vehicles", tags=["Vehicles"])
app.include_router(shipment.router, prefix="/shipments", tags=["Shipments"])
app.include_router(trip.router, prefix="/trips", tags=["Trips"])
app.include_router(driver.router, prefix="/drivers", tags=["Drivers"])
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
app.include_router(maintenance.router, prefix="/maintenance", tags=["Maintenance"])
app.include_router(fuel_record.router, prefix="/fuel", tags=["Fuel"])
app.include_router(reports.router, prefix="/reports", tags=["Reports"])
app.include_router(gps_tracking.router, prefix="/gps", tags=["GPS"])
app.include_router(notification.router, prefix="/notifications", tags=["Notifications"])
app.include_router(tracking_ws.router, tags=["Live Tracking"])



try:
    import sys
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from seed_demo_accounts import seed
    seed()
except Exception as e:
    print(f"[MODULE INIT SEED NOTICE] {e}", flush=True)


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(tracking_ws.run_tracking_simulation())


from app.core.redis_cache import get_redis_client


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    client = get_redis_client()
    if client is not None:
        redis_status = "connected"
    else:
        redis_status = "unavailable (using in-memory fallback)"
    return {
        "message": "FleetFlow API running",
        "redis_status": redis_status,
    }