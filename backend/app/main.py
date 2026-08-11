import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, vehicle, shipment, trip, gps_tracking, tracking_ws

app = FastAPI(title="FleetFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Aunthentication"])
app.include_router(vehicle.router, prefix="/vehicles", tags=["Vehicles"])
app.include_router(shipment.router, prefix="/shipments", tags=["Shipments"])
app.include_router(trip.router, prefix="/trips", tags=["Trips"])
app.include_router(gps_tracking.router, prefix="/gps", tags=["GPS"])
app.include_router(tracking_ws.router, tags=["Live Tracking"])


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(tracking_ws.run_tracking_simulation())


@app.get("/")
def root():
    return {"message": "FleetFlow API running"}