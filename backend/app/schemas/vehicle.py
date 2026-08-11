from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.vehicle import VehicleStatusEnum


class VehicleBase(BaseModel):
    registration_number: str = Field(..., max_length=30)
    vehicle_type: str = Field(..., max_length=50)
    brand: str = Field(..., max_length=50)
    model: str = Field(..., max_length=50)
    manufacture_year: int = Field(..., ge=1900, le=2100)
    fuel_type: str = Field(..., max_length=30)
    capacity: int = Field(..., ge=0)
    assigned_driver_id: UUID | None = None
    status: VehicleStatusEnum = VehicleStatusEnum.Available


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    registration_number: str | None = Field(None, max_length=30)
    vehicle_type: str | None = Field(None, max_length=50)
    brand: str | None = Field(None, max_length=50)
    model: str | None = Field(None, max_length=50)
    manufacture_year: int | None = Field(None, ge=1900, le=2100)
    fuel_type: str | None = Field(None, max_length=30)
    capacity: int | None = Field(None, ge=0)
    assigned_driver_id: UUID | None = None
    status: VehicleStatusEnum | None = None


class VehicleResponse(VehicleBase):
    vehicle_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class VehicleStatusCountResponse(BaseModel):
    total_vehicles: int
    available: int
    assigned: int
    maintenance: int
    in_transit: int
