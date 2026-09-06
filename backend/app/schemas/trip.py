from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.trip import TripStatusEnum
from typing import Dict, Any, List, Optional


class TripBase(BaseModel):
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    shipment_id: UUID | None = None
    status: TripStatusEnum = TripStatusEnum.Scheduled
    start_lat: float = Field(..., ge=-90.0, le=90.0)
    start_lng: float = Field(..., ge=-180.0, le=180.0)
    end_lat: float = Field(..., ge=-90.0, le=90.0)
    end_lng: float = Field(..., ge=-180.0, le=180.0)
    distance: float | None = None
    duration: float | None = None
    eta: datetime | None = None
    route_path: str | None = None
    route_type: str | None = "fastest"
    start_time: datetime | None = None
    end_time: datetime | None = None
    origin: str | None = None
    destination: str | None = None
    tracking_number: str | None = None
    customer_name: str | None = None
    assigned_vehicle_reg: str | None = None
    assigned_vehicle_model: str | None = None
    assigned_driver_name: str | None = None


class TripCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID
    shipment_id: UUID
    start_lat: float = Field(..., ge=-90.0, le=90.0)
    start_lng: float = Field(..., ge=-180.0, le=180.0)
    end_lat: float = Field(..., ge=-90.0, le=90.0)
    end_lng: float = Field(..., ge=-180.0, le=180.0)
    route_type: str | None = "fastest"


class TripUpdate(BaseModel):
    status: TripStatusEnum | None = None
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    shipment_id: UUID | None = None
    start_lat: float | None = Field(None, ge=-90.0, le=90.0)
    start_lng: float | None = Field(None, ge=-180.0, le=180.0)
    end_lat: float | None = Field(None, ge=-90.0, le=90.0)
    end_lng: float | None = Field(None, ge=-180.0, le=180.0)
    distance: float | None = None
    duration: float | None = None
    eta: datetime | None = None
    route_path: str | None = None
    route_type: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class TripResponse(TripBase):
    trip_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RouteOptionRequest(BaseModel):
    start_lat: float = Field(..., ge=-90.0, le=90.0)
    start_lng: float = Field(..., ge=-180.0, le=180.0)
    end_lat: float = Field(..., ge=-90.0, le=90.0)
    end_lng: float = Field(..., ge=-180.0, le=180.0)


class RecalculateRouteRequest(BaseModel):
    current_lat: float = Field(..., ge=-90.0, le=90.0)
    current_lng: float = Field(..., ge=-180.0, le=180.0)
    route_type: Optional[str] = "fastest"
