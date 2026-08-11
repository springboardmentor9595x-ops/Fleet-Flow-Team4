from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import RoleEnum
from app.models.trip import Trip, TripStatusEnum
from app.models.shipment import ShipmentStatusEnum
from app.models.vehicle import VehicleStatusEnum
from app.schemas.trip import (
    TripCreate, TripUpdate, TripResponse, RouteOptionRequest, RecalculateRouteRequest
)
from app.schemas.gps_tracking import GPSTrackingResponse
from app.crud import trip as trip_crud
from app.crud import shipment as shipment_crud
from app.crud import vehicle as vehicle_crud
from app.core.deps import get_current_user, require_roles
from app.core.ors import calculate_route, get_route_options

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
    if vehicle.status != VehicleStatusEnum.Available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle is currently '{vehicle.status}' and cannot be scheduled.",
        )

    shipment = shipment_crud.get_shipment_by_id(db, shipment_id=trip_in.shipment_id)
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment with ID '{trip_in.shipment_id}' not found.",
        )
    if shipment.status != ShipmentStatusEnum.Created:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shipment is currently '{shipment.status}' and cannot be scheduled.",
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
    return trip_db


@router.get("/", response_model=List[TripResponse])
def list_trips(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    trip_status: Optional[TripStatusEnum] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve all trips with optional status filter, scoped by role."""
    driver_id = None
    if current_user.role == RoleEnum.Driver:
        driver_id = current_user.user_id

    return trip_crud.get_trips(
        db, skip=skip, limit=limit, status=trip_status, driver_id=driver_id
    )


@router.get("/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve trip details by ID."""
    trip = trip_crud.get_trip_by_id(db, trip_id=trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID '{trip_id}' not found.",
        )
    return trip


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
    return trip_crud.update_trip(db, trip_db=trip_db, trip_in=trip_in)


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID '{trip_id}' not found.",
        )

    if current_user.role == RoleEnum.Driver and trip.driver_id != current_user.user_id:
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
    return trip


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID '{trip_id}' not found.",
        )

    if current_user.role == RoleEnum.Driver and trip.driver_id != current_user.user_id:
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
