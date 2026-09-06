import json
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import RoleEnum, User
from app.models.trip import Trip, TripStatusEnum
from app.models.shipment import Shipment, ShipmentStatusEnum
from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.driver import Driver
from app.schemas.trip import (
    TripCreate, TripUpdate, TripResponse, RouteOptionRequest, RecalculateRouteRequest
)
from app.schemas.gps_tracking import GPSTrackingResponse
from app.crud import trip as trip_crud
from app.crud import shipment as shipment_crud
from app.crud import vehicle as vehicle_crud
from app.core.deps import get_current_user, require_roles
from app.core.ors import calculate_route, get_route_options, haversine_distance, generate_fallback_route_points
from app.services.notification_service import dispatch_system_notification

router = APIRouter()



@router.post("/route-options")
def fetch_route_options(
    req: RouteOptionRequest,
    current_user=Depends(get_current_user),
):
    """
    Returns 4 traffic-aware route options: Fastest, Shortest, Traffic Avoidance, Fuel-Efficient.
    Includes distance, duration, ETA, traffic delay, and fuel estimate for each.
    """
    return get_route_options(req.start_lat, req.start_lng, req.end_lat, req.end_lng)


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
def create_trip(
    trip_in: TripCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """
    Schedule a new trip. Calculates route and ETA based on selected route_type,
    updates vehicle/shipment assignments, and logs status history.
    """
    vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=trip_in.vehicle_id)
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID '{trip_in.vehicle_id}' not found.",
        )
    if vehicle.status == VehicleStatusEnum.Maintenance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle is currently in Maintenance and cannot be scheduled.",
        )

    # Prevent scheduling if vehicle is currently on an active trip
    active_veh_trip = db.query(Trip).filter(
        Trip.vehicle_id == trip_in.vehicle_id,
        Trip.status == TripStatusEnum.Active,
    ).first()
    if active_veh_trip:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle is currently on an active trip ({str(active_veh_trip.trip_id)[:8]}...).",
        )

    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip_in.shipment_id)
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment with ID '{trip_in.shipment_id}' not found.",
        )
    if shipment.status in [ShipmentStatusEnum.Delivered, ShipmentStatusEnum.Cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shipment is currently '{shipment.status}' and cannot be scheduled.",
        )

    # Check if shipment already has an active or scheduled trip
    existing_trip = db.query(Trip).filter(
        Trip.shipment_id == trip_in.shipment_id,
        Trip.status.in_([TripStatusEnum.Scheduled, TripStatusEnum.Active]),
    ).first()
    if existing_trip:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shipment is already assigned to an active/scheduled trip ({str(existing_trip.trip_id)[:8]}...).",
        )

    route_type = trip_in.route_type or "fastest"
    route_details = calculate_route(
        trip_in.start_lat, trip_in.start_lng, trip_in.end_lat, trip_in.end_lng, route_type=route_type
    )

    eta = route_details.get("eta") or (datetime.utcnow() + timedelta(minutes=route_details["duration"]))

    trip_db = Trip(
        vehicle_id=trip_in.vehicle_id,
        driver_id=trip_in.driver_id,
        shipment_id=trip_in.shipment_id,
        status=TripStatusEnum.Scheduled,
        start_lat=trip_in.start_lat,
        start_lng=trip_in.start_lng,
        end_lat=trip_in.end_lat,
        end_lng=trip_in.end_lng,
        distance=route_details["distance"],
        duration=route_details["duration"],
        eta=eta,
        route_path=route_details["route_path"],
        route_type=route_type,
    )
    db.add(trip_db)

    vehicle.status = VehicleStatusEnum.Assigned
    vehicle.assigned_driver_id = trip_in.driver_id

    shipment.status = ShipmentStatusEnum.Assigned
    shipment.vehicle_id = trip_in.vehicle_id
    shipment.driver_id = trip_in.driver_id

    shipment_crud.log_shipment_status_history(
        db,
        shipment_id=trip_in.shipment_id,
        status=ShipmentStatusEnum.Assigned,
        location="Scheduled Route Start",
        latitude=trip_in.start_lat,
        longitude=trip_in.start_lng,
        updated_by=current_user.user_id,
    )
    db.commit()

    db.refresh(trip_db)

    # Immediately notify the assigned driver of the new trip
    if trip_in.driver_id:
        drv = db.query(Driver).filter(Driver.driver_id == trip_in.driver_id).first()
        if drv and drv.user_id:
            driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
            if driver_user:
                dispatch_system_notification(
                    db=db,
                    title=f"New Trip Assigned: {shipment.source} → {shipment.destination}",
                    message=f"You have been assigned trip {str(trip_db.trip_id)[:8]}... from {shipment.source} to {shipment.destination} with vehicle {vehicle.registration_number}.",
                    event_type="trip_assigned",
                    notification_type="general",
                    trip_id=trip_db.trip_id,
                    shipment_id=trip_in.shipment_id,
                    vehicle_id=trip_in.vehicle_id,
                    driver_user_id=driver_user.user_id,
                    sender_id=current_user.user_id,
                    sender_name=current_user.full_name,
                    sender_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                )
                db.commit()

    return enrich_trip_response(trip_db, db)



CITY_COORDS = {
    "kakinada": (16.9891, 82.2475),
    "hyderabad": (17.3850, 78.4867),
    "vizag": (17.6868, 83.2185),
    "visakhapatnam": (17.6868, 83.2185),
    "vijayawada": (16.5062, 80.6480),
    "rajahmundry": (17.0005, 81.8040),
    "guntur": (16.3067, 80.4365),
    "tirupati": (13.6288, 79.4192),
    "chennai": (13.0827, 80.2707),
    "bangalore": (12.9716, 77.5946),
    "bengaluru": (12.9716, 77.5946),
    "delhi": (28.6139, 77.2090),
    "mumbai": (19.0760, 72.8777),
}


def get_coords_for_city(city_name: Optional[str], default_lat: float, default_lng: float) -> tuple:
    if not city_name:
        return default_lat, default_lng
    c = str(city_name).strip().lower()
    for k, v in CITY_COORDS.items():
        if k in c:
            return v
    return default_lat, default_lng


def map_shipment_to_trip_response(s: Shipment, db: Session) -> TripResponse:
    s_lat, s_lng = get_coords_for_city(s.source, 16.9891, 82.2475)
    e_lat, e_lng = get_coords_for_city(s.destination, 17.3850, 78.4867)

    raw_dist = haversine_distance(s_lat, s_lng, e_lat, e_lng)
    dist = round(raw_dist * 1.25, 2)
    dur = round((dist / 65.0) * 60, 1)

    if s.status in [ShipmentStatusEnum.Created, ShipmentStatusEnum.Assigned]:
        trip_status = TripStatusEnum.Scheduled
    elif s.status in [ShipmentStatusEnum.InTransit, ShipmentStatusEnum.Delayed]:
        trip_status = TripStatusEnum.Active
    elif s.status == ShipmentStatusEnum.Delivered:
        trip_status = TripStatusEnum.Completed
    else:
        trip_status = TripStatusEnum.Cancelled

    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == s.vehicle_id).first() if s.vehicle_id else None
    drv = db.query(Driver).filter(Driver.driver_id == s.driver_id).first() if s.driver_id else None
    drv_user = db.query(User).filter(User.user_id == drv.user_id).first() if (drv and drv.user_id) else None

    route_points = generate_fallback_route_points(s_lat, s_lng, e_lat, e_lng, route_type="fastest")

    return TripResponse(
        trip_id=s.shipment_id,
        vehicle_id=s.vehicle_id,
        driver_id=s.driver_id,
        shipment_id=s.shipment_id,
        status=trip_status,
        start_lat=s_lat,
        start_lng=s_lng,
        end_lat=e_lat,
        end_lng=e_lng,
        distance=dist,
        duration=dur,
        eta=s.expected_delivery_at or (datetime.utcnow() + timedelta(minutes=dur)),
        route_path=json.dumps(route_points),
        route_type="fastest",
        start_time=s.created_at,
        end_time=s.updated_at if s.status == ShipmentStatusEnum.Delivered else None,
        created_at=s.created_at or datetime.utcnow(),
        updated_at=s.updated_at or datetime.utcnow(),
        origin=s.source,
        destination=s.destination,
        assigned_vehicle_reg=veh.registration_number if veh else None,
        assigned_vehicle_model=f"{veh.brand} {veh.model}" if veh else None,
        assigned_driver_name=drv_user.full_name if drv_user else None,
    )


def enrich_trip_response(trip: Trip, db: Session) -> TripResponse:
    origin = None
    destination = None
    tracking_number = None
    customer_name = None
    if trip.shipment_id:
        ship = db.query(Shipment).filter(Shipment.shipment_id == trip.shipment_id).first()
        if ship:
            origin = ship.source
            destination = ship.destination
            tracking_number = ship.tracking_number
            customer_name = ship.customer_name

    veh = db.query(Vehicle).filter(Vehicle.vehicle_id == trip.vehicle_id).first() if trip.vehicle_id else None
    drv = db.query(Driver).filter(Driver.driver_id == trip.driver_id).first() if trip.driver_id else None
    drv_user = db.query(User).filter(User.user_id == drv.user_id).first() if (drv and drv.user_id) else None

    if not origin and trip.start_lat and trip.start_lng:
        for cname, coords in CITY_COORDS.items():
            if abs(trip.start_lat - coords[0]) < 0.2 and abs(trip.start_lng - coords[1]) < 0.2:
                origin = cname.title()
                break
    if not destination and trip.end_lat and trip.end_lng:
        for cname, coords in CITY_COORDS.items():
            if abs(trip.end_lat - coords[0]) < 0.2 and abs(trip.end_lng - coords[1]) < 0.2:
                destination = cname.title()
                break

    assigned_driver_name = None
    if drv_user and drv_user.full_name:
        assigned_driver_name = drv_user.full_name
    elif drv:
        assigned_driver_name = drv.license_number or f"Driver ({str(drv.driver_id)[:8]})"

    return TripResponse(
        trip_id=trip.trip_id,
        vehicle_id=trip.vehicle_id,
        driver_id=trip.driver_id,
        shipment_id=trip.shipment_id,
        status=trip.status,
        start_lat=trip.start_lat,
        start_lng=trip.start_lng,
        end_lat=trip.end_lat,
        end_lng=trip.end_lng,
        distance=trip.distance,
        duration=trip.duration,
        eta=trip.eta,
        route_path=trip.route_path,
        route_type=trip.route_type,
        start_time=trip.start_time,
        end_time=trip.end_time,
        created_at=trip.created_at,
        updated_at=trip.updated_at,
        origin=origin,
        destination=destination,
        tracking_number=tracking_number,
        customer_name=customer_name,
        assigned_vehicle_reg=veh.registration_number if veh else None,
        assigned_vehicle_model=f"{veh.brand} {veh.model}" if veh else None,
        assigned_driver_name=assigned_driver_name,
    )


@router.get("/", response_model=List[TripResponse])
def list_trips(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    trip_status: Optional[TripStatusEnum] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve real scheduled and active trips, scoped by role."""
    driver_id = None
    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv:
            return []
        driver_id = drv.driver_id

    # Fetch real trips from trips table
    trip_records = trip_crud.get_trips(
        db, skip=skip, limit=limit, status=trip_status, driver_id=driver_id
    )

    # Enrich trips with shipment tracking, route, driver, vehicle info
    return [enrich_trip_response(t, db) for t in trip_records]


@router.get("/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve trip details by ID."""
    trip = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if trip:
        if current_user.role == RoleEnum.Driver:
            drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
            if not drv:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
            # Check if assigned directly, or via vehicle, or via shipment
            is_own = (trip.driver_id == drv.driver_id)
            if not is_own and trip.vehicle_id:
                veh = db.query(Vehicle).filter(Vehicle.vehicle_id == trip.vehicle_id).first()
                if veh and veh.assigned_driver_id == drv.driver_id:
                    is_own = True
            if not is_own and trip.shipment_id:
                ship = db.query(Shipment).filter(Shipment.shipment_id == trip.shipment_id).first()
                if ship and ship.driver_id == drv.driver_id:
                    is_own = True
            if not is_own:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        return enrich_trip_response(trip, db)

    # Check if trip_id corresponds to a shipment
    shipment = db.query(Shipment).filter(Shipment.shipment_id == trip_id).first()
    if shipment:
        if current_user.role == RoleEnum.Driver:
            drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
            if not drv or (shipment.driver_id != drv.driver_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        return map_shipment_to_trip_response(shipment, db)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Trip with ID '{trip_id}' not found.",
    )


@router.post("/{trip_id}/recalculate", response_model=TripResponse)
def recalculate_trip_route(
    trip_id: UUID,
    req: RecalculateRouteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """
    Recalculates route mid-trip when traffic conditions change, vehicle deviates, or strategy changes.
    """
    trip = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    selected_route_type = req.route_type or trip.route_type or "fastest"
    route_details = calculate_route(
        req.current_lat, req.current_lng, trip.end_lat, trip.end_lng, route_type=selected_route_type
    )

    trip.distance = route_details["distance"]
    trip.duration = route_details["duration"]
    trip.eta = datetime.utcnow() + timedelta(minutes=route_details["duration"])
    trip.route_path = route_details["route_path"]
    trip.route_type = selected_route_type

    db.commit()
    db.refresh(trip)

    dispatch_system_notification(
        db=db,
        title="Trip Route Recalculated",
        message=f"Trip route was recalculated ({selected_route_type} mode, new ETA duration: {route_details['duration']:.0f} mins).",
        event_type="route_recalculated",
        trip_id=trip.trip_id,
        shipment_id=trip.shipment_id,
        vehicle_id=trip.vehicle_id,
        sender_id=current_user.user_id,
        sender_name=current_user.full_name,
        sender_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
    )

    return trip


@router.put("/{trip_id}", response_model=TripResponse)
def update_trip_details(
    trip_id: UUID,
    trip_in: TripUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """Update details of a trip."""
    trip_db = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if not trip_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID '{trip_id}' not found.",
        )

    # 1. Update trip fields
    trip_crud.update_trip(db, trip_db=trip_db, trip_in=trip_in)

    # 2. If driver_id was updated, synchronize related shipment and vehicle
    if trip_in.driver_id is not None:
        if trip_db.shipment_id:
            ship = db.query(Shipment).filter(Shipment.shipment_id == trip_db.shipment_id).first()
            if ship:
                ship.driver_id = trip_in.driver_id
                if trip_in.vehicle_id:
                    ship.vehicle_id = trip_in.vehicle_id
                elif trip_db.vehicle_id:
                    ship.vehicle_id = trip_db.vehicle_id
        
        target_veh_id = trip_in.vehicle_id or trip_db.vehicle_id
        if target_veh_id:
            veh = db.query(Vehicle).filter(Vehicle.vehicle_id == target_veh_id).first()
            if veh:
                veh.assigned_driver_id = trip_in.driver_id

        db.commit()
        db.refresh(trip_db)

        # 3. Dispatch in-app notification to the assigned driver
        drv = db.query(Driver).filter(Driver.driver_id == trip_in.driver_id).first()
        if drv and drv.user_id:
            driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
            if driver_user:
                ship_source = "Origin"
                ship_dest = "Destination"
                if trip_db.shipment_id:
                    ship = db.query(Shipment).filter(Shipment.shipment_id == trip_db.shipment_id).first()
                    if ship:
                        ship_source = ship.source
                        ship_dest = ship.destination
                dispatch_system_notification(
                    db=db,
                    title=f"Trip Assigned: {ship_source} → {ship_dest}",
                    message=f"You have been assigned trip {str(trip_db.trip_id)[:8]}... from {ship_source} to {ship_dest}.",
                    event_type="trip_assigned",
                    notification_type="general",
                    trip_id=trip_db.trip_id,
                    shipment_id=trip_db.shipment_id,
                    vehicle_id=trip_db.vehicle_id,
                    driver_user_id=driver_user.user_id,
                    sender_id=current_user.user_id,
                    sender_name=current_user.full_name,
                    sender_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                )
                db.commit()

    return enrich_trip_response(trip_db, db)


@router.post("/{trip_id}/start", response_model=TripResponse)
def start_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Start the scheduled trip. Updates trip, shipment, and vehicle status to Active / In Transit.
    """
    trip = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if not trip:
        shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip_id)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trip with ID '{trip_id}' not found.",
            )
        if current_user.role == RoleEnum.Driver:
            drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
            if not drv or shipment.driver_id != drv.driver_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to start this trip.",
                )
        shipment.status = ShipmentStatusEnum.InTransit
        shipment_crud.log_shipment_status_history(
            db,
            shipment_id=shipment.shipment_id,
            status=ShipmentStatusEnum.InTransit,
            location="Route Started",
            latitude=16.9891,
            longitude=82.2475,
            updated_by=current_user.user_id,
        )
        if shipment.vehicle_id:
            vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=shipment.vehicle_id)
            if vehicle:
                vehicle.status = VehicleStatusEnum.InTransit
        db.commit()
        db.refresh(shipment)
        return map_shipment_to_trip_response(shipment, db)

    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv or trip.driver_id != drv.driver_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to start this trip.",
            )

    if trip.status != TripStatusEnum.Scheduled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start a trip that is currently '{trip.status}'.",
        )

    trip.status = TripStatusEnum.Active
    trip.start_time = datetime.utcnow()

    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip.shipment_id)
    if shipment:
        shipment.status = ShipmentStatusEnum.InTransit
        shipment_crud.log_shipment_status_history(
            db,
            shipment_id=trip.shipment_id,
            status=ShipmentStatusEnum.InTransit,
            location="Route Started",
            latitude=trip.start_lat,
            longitude=trip.start_lng,
            updated_by=current_user.user_id,
        )

    vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=trip.vehicle_id)
    if vehicle:
        vehicle.status = VehicleStatusEnum.InTransit

    db.commit()
    db.refresh(trip)
    return enrich_trip_response(trip, db)


@router.post("/{trip_id}/complete", response_model=TripResponse)
def complete_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Complete the active trip. Updates trip, shipment, and vehicle status to Completed / Delivered / Available.
    """
    trip = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if not trip:
        shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip_id)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trip with ID '{trip_id}' not found.",
            )
        if current_user.role == RoleEnum.Driver:
            drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
            if not drv or shipment.driver_id != drv.driver_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to complete this trip.",
                )
        shipment.status = ShipmentStatusEnum.Delivered
        shipment_crud.log_shipment_status_history(
            db,
            shipment_id=shipment.shipment_id,
            status=ShipmentStatusEnum.Delivered,
            location="Destination Reached",
            latitude=17.3850,
            longitude=78.4867,
            updated_by=current_user.user_id,
        )
        if shipment.vehicle_id:
            vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=shipment.vehicle_id)
            if vehicle:
                vehicle.status = VehicleStatusEnum.Available
                vehicle.assigned_driver_id = None
        db.commit()
        db.refresh(shipment)
        return map_shipment_to_trip_response(shipment, db)

    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv or trip.driver_id != drv.driver_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to complete this trip.",
            )

    if trip.status != TripStatusEnum.Active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot complete a trip that is currently '{trip.status}'.",
        )

    trip.status = TripStatusEnum.Completed
    trip.end_time = datetime.utcnow()

    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip.shipment_id)
    if shipment:
        shipment.status = ShipmentStatusEnum.Delivered
        shipment_crud.log_shipment_status_history(
            db,
            shipment_id=trip.shipment_id,
            status=ShipmentStatusEnum.Delivered,
            location="Destination Reached",
            latitude=trip.end_lat,
            longitude=trip.end_lng,
            updated_by=current_user.user_id,
        )

    vehicle = vehicle_crud.get_vehicle_by_id(db, vehicle_id=trip.vehicle_id)
    if vehicle:
        vehicle.status = VehicleStatusEnum.Available
        vehicle.assigned_driver_id = None

    db.commit()
    db.refresh(trip)

    if shipment:
        dispatch_system_notification(
            db=db,
            title=f"Shipment {shipment.tracking_number} Delivered",
            message=f"Trip completed. Shipment {shipment.tracking_number} has been delivered to {shipment.destination}.",
            event_type="shipment_delivered",
            trip_id=trip.trip_id,
            shipment_id=shipment.shipment_id,
            vehicle_id=trip.vehicle_id,
            sender_id=current_user.user_id,
            sender_name=current_user.full_name,
            sender_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        )

    return trip



@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """
    Delete a trip by ID. Only Admins, FleetManagers, and Dispatchers can delete trips.
    Returns 204 No Content on success, 404 if not found.
    """
    deleted = trip_crud.delete_trip(db, trip_id=trip_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID '{trip_id}' not found.",
        )


@router.get("/{trip_id}/telemetry", response_model=List[GPSTrackingResponse])
def get_trip_telemetry_logs(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve all historical telemetry points for a specific trip."""
    return trip_crud.get_trip_telemetry(db, trip_id=trip_id)
