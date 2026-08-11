from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class GPSTrackingBase(BaseModel):
    vehicle_id: UUID | None = None
    trip_id: UUID | None = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    speed: float | None = Field(None, ge=0.0)
    timestamp: datetime | None = None


class GPSTrackingCreate(GPSTrackingBase):
    pass


class GPSTrackingResponse(GPSTrackingBase):
    tracking_id: UUID
    timestamp: datetime

    class Config:
        from_attributes = True
