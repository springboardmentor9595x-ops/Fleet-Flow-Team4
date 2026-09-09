import asyncio
import json
from datetime import datetime
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.trip import Trip, TripStatusEnum
from app.models.shipment import Shipment, ShipmentStatusEnum
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.gps_tracking import GPSTracking
from app.crud import shipment as shipment_crud
from app.core.ors import check_geofence_arrival
from app.core.redis_cache import get_redis_client

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[Tracking WS] Client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"[Tracking WS] Client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        # 1. Redis Pub/Sub broadcast if Redis is available
        client = get_redis_client()
        if client is not None:
            try:
                client.publish("fleetflow_tracking_channel", json.dumps(message))
            except Exception as exc:
                print(f"[Redis PubSub Warning] Broadcast error: {exc}. Using local WebSocket fallback.")
        else:
            print("[Redis PubSub] Redis unavailable. Broadcasting via local WebSocket connection pool.")

        # 2. In-memory WebSocket broadcast to connected local clients
        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for c in stale:
            self.disconnect(c)


manager = ConnectionManager()

# trip_id (str) -> current index into downsampled route points
SIMULATION_STEPS: Dict[str, int] = {}


def downsample(points: list, target_len: int = 20) -> list:
    if len(points) <= target_len:
        return points
    step = len(points) / target_len
    return [points[int(i * step)] for i in range(target_len - 1)] + [points[-1]]


def get_active_trip_snapshot(db: Session) -> List[dict]:
    """Builds the current position snapshot for every Active trip."""
    trips = db.query(Trip).filter(Trip.status == TripStatusEnum.Active).all()
    snapshot = []
    for trip in trips:
        trip_id = str(trip.trip_id)
        try:
            points = json.loads(trip.route_path) if trip.route_path else []
        except (json.JSONDecodeError, TypeError):
            points = []
        if not points:
            continue

        points = downsample(points)
        step = SIMULATION_STEPS.get(trip_id, 0)
        step = min(step, len(points) - 1)
        lng, lat = points[step][0], points[step][1]

        # Check geofence arrival (< 0.5 km of end destination)
        arrived = check_geofence_arrival(lat, lng, trip.end_lat, trip.end_lng, radius_km=0.5)

        snapshot.append({
            "trip_id": trip_id,
            "vehicle_id": str(trip.vehicle_id) if trip.vehicle_id else None,
            "shipment_id": str(trip.shipment_id) if trip.shipment_id else None,
            "lat": lat,
            "lng": lng,
            "speed": 45.0 if step < len(points) - 1 else 0.0,
            "progress_step": step,
            "total_steps": len(points),
            "status": trip.status.value if hasattr(trip.status, "value") else trip.status,
            "geofence_arrived": arrived,
            "route_type": trip.route_type or "fastest",
        })
    return snapshot


async def run_tracking_simulation():
    """
    Background simulation loop: advances active trips, logs GPS telemetry,
    detects geofence events (auto-arrives destination), and broadcasts telemetry.
    """
    while True:
        db: Session = SessionLocal()
        try:
            trips = db.query(Trip).filter(Trip.status == TripStatusEnum.Active).all()
            for trip in trips:
                trip_id = str(trip.trip_id)
                try:
                    points = json.loads(trip.route_path) if trip.route_path else []
                except (json.JSONDecodeError, TypeError):
                    points = []
                if not points:
                    continue

                points = downsample(points)
                step = SIMULATION_STEPS.get(trip_id, 0)
                if step < len(points) - 1:
                    step += 1
                    SIMULATION_STEPS[trip_id] = step

                lng, lat = points[step][0], points[step][1]

                # Save GPS telemetry ping
                if trip.vehicle_id:
                    gps_log = GPSTracking(
                        vehicle_id=trip.vehicle_id,
                        trip_id=trip.trip_id,
                        latitude=lat,
                        longitude=lng,
                        speed=45.0 if step < len(points) - 1 else 0.0,
                        timestamp=datetime.utcnow(),
                    )
                    db.add(gps_log)

                # Geofence detection: If arrived at destination point on final step
                if step == len(points) - 1:
                    # Auto-complete trip and deliver shipment
                    trip.status = TripStatusEnum.Completed
                    trip.end_time = datetime.utcnow()

                    shipment = db.query(Shipment).filter(Shipment.shipment_id == trip.shipment_id).first()
                    if shipment and shipment.status != ShipmentStatusEnum.Delivered:
                        shipment.status = ShipmentStatusEnum.Delivered
                        shipment_crud.log_shipment_status_history(
                            db,
                            shipment_id=shipment.shipment_id,
                            status=ShipmentStatusEnum.Delivered,
                            location="Geofence Destination Zone Reached",
                            latitude=lat,
                            longitude=lng,
                        )

                    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == trip.vehicle_id).first()
                    if vehicle:
                        vehicle.status = VehicleStatusEnum.Available
                        vehicle.assigned_driver_id = None

            db.commit()

            snapshot = get_active_trip_snapshot(db)
            await manager.broadcast({"type": "TELEMETRY_UPDATE", "trips": snapshot})
        except Exception as e:
            print(f"[Tracking Simulation Error] {e}")
        finally:
            db.close()

        await asyncio.sleep(3.0)


@router.websocket("/ws/tracking")
async def tracking_socket(websocket: WebSocket):
    await manager.connect(websocket)
    db: Session = SessionLocal()
    try:
        snapshot = get_active_trip_snapshot(db)
        await websocket.send_json({"type": "INITIAL_STATE", "trips": snapshot})
    finally:
        db.close()

    try:
        while True:
            # Keep-alive heartbeat receiver
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)