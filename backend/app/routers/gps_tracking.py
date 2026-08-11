from typing import List, Dict, Any
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.database import get_db, SessionLocal
from app.core.security import SECRET_KEY, ALGORITHM
from app.crud.user import get_user_by_email
from app.models.user import RoleEnum
from app.models.trip import Trip, TripStatusEnum
from app.models.shipment import Shipment, ShipmentStatusEnum
from app.models.gps_tracking import GPSTracking
from app.schemas.gps_tracking import GPSTrackingCreate, GPSTrackingResponse
from app.crud import trip as trip_crud
from app.crud import shipment as shipment_crud
from app.core.deps import get_current_user
from app.core.ors import calculate_route

router = APIRouter()


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Handle disconnected or stale connections gracefully
                pass


manager = ConnectionManager()


# Helper to authenticate WebSocket connections via token query parameter
def get_ws_user(token: str, db: Session) -> Any:
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user_by_email(db, email)
    if user is None:
        raise credentials_exception
    return user


@router.get("/active", response_model=List[Dict[str, Any]])
def get_active_positions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get the latest GPS coordinates and status for all active trips.
    Useful for initializing the map screen.
    """
    active_trips = db.query(Trip).filter(Trip.status == TripStatusEnum.Active).all()
    results = []
    for trip in active_trips:
        latest_ping = (
            db.query(GPSTracking)
            .filter(GPSTracking.trip_id == trip.trip_id)
            .order_by(GPSTracking.timestamp.desc())
            .first()
        )
        
        results.append({
            "trip_id": str(trip.trip_id),
            "vehicle_id": str(trip.vehicle_id) if trip.vehicle_id else None,
            "driver_id": str(trip.driver_id) if trip.driver_id else None,
            "shipment_id": str(trip.shipment_id) if trip.shipment_id else None,
            "latitude": latest_ping.latitude if latest_ping else trip.start_lat,
            "longitude": latest_ping.longitude if latest_ping else trip.start_lng,
            "speed": latest_ping.speed if latest_ping else 0.0,
            "timestamp": latest_ping.timestamp.isoformat() if latest_ping else trip.start_time.isoformat() if trip.start_time else datetime.utcnow().isoformat(),
            "eta": trip.eta.isoformat() if trip.eta else None,
            "status": trip.status.value,
            "start_lat": trip.start_lat,
            "start_lng": trip.start_lng,
            "end_lat": trip.end_lat,
            "end_lng": trip.end_lng,
            "distance": trip.distance,
            "duration": trip.duration
        })
    return results


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time tracking.
    Authenticates via query parameter, receives telemetry updates, and broadcasts them.
    """
    db = SessionLocal()
    try:
        user = get_ws_user(token, db)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    await manager.connect(websocket)

    try:
        while True:
            # Receive text data (JSON format)
            data = await websocket.receive_json()
            
            # Format: {"trip_id": "...", "latitude": 12.34, "longitude": 56.78, "speed": 45.0}
            if "trip_id" in data and "latitude" in data and "longitude" in data:
                trip_id = UUID(data["trip_id"])
                lat = float(data["latitude"])
                lng = float(data["longitude"])
                speed = float(data.get("speed", 0.0))
                
                # Fetch trip details
                trip = db.query(Trip).filter(Trip.trip_id == trip_id).first()
                if not trip:
                    continue
                
                # Save GPS telemetry record
                ping = GPSTracking(
                    vehicle_id=trip.vehicle_id,
                    trip_id=trip.trip_id,
                    latitude=lat,
                    longitude=lng,
                    speed=speed,
                    timestamp=datetime.utcnow()
                )
                db.add(ping)
                
                # If trip is active, dynamically update ETA and check for delays
                is_delayed = False
                new_eta = trip.eta
                
                if trip.status == TripStatusEnum.Active:
                    # Dynamically calculate route from current GPS position to destination
                    route_details = calculate_route(lat, lng, trip.end_lat, trip.end_lng)
                    from datetime import timedelta
                    
                    new_eta = datetime.utcnow() + timedelta(minutes=route_details["duration"])
                    trip.eta = new_eta
                    trip.distance = route_details["distance"]
                    trip.duration = route_details["duration"]
                    
                    # Fetch shipment to verify ETA against expected delivery time
                    shipment = db.query(Shipment).filter(Shipment.shipment_id == trip.shipment_id).first()
                    if shipment and shipment.expected_delivery_at:
                        # Add a 10-minute grace period to prevent false alerts
                        if new_eta > (shipment.expected_delivery_at + timedelta(minutes=10)):
                            is_delayed = True
                            if shipment.status != ShipmentStatusEnum.Delayed:
                                # Transition shipment state to Delayed
                                shipment.status = ShipmentStatusEnum.Delayed
                                shipment_crud.log_shipment_status_history(
                                    db,
                                    shipment_id=shipment.shipment_id,
                                    status=ShipmentStatusEnum.Delayed,
                                    location=f"GPS Telemetry (Delayed) - Lat: {lat}, Lng: {lng}",
                                    latitude=lat,
                                    longitude=lng,
                                    updated_by=user.user_id
                                )
                
                db.commit()
                
                # Broadcast the updated GPS point to all active screens
                broadcast_data = {
                    "type": "telemetry_update",
                    "trip_id": str(trip.trip_id),
                    "vehicle_id": str(trip.vehicle_id) if trip.vehicle_id else None,
                    "latitude": lat,
                    "longitude": lng,
                    "speed": speed,
                    "timestamp": datetime.utcnow().isoformat(),
                    "eta": new_eta.isoformat() if new_eta else None,
                    "distance_remaining": trip.distance,
                    "duration_remaining": trip.duration,
                    "is_delayed": is_delayed
                }
                
                await manager.broadcast(broadcast_data)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Error handling WebSocket session: {e}")
        manager.disconnect(websocket)
    finally:
        db.close()
