from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.shipment import ShipmentStatusEnum


class ShipmentBase(BaseModel):
    tracking_number: str = Field(..., max_length=30)
    source: str = Field(..., max_length=150)
    destination: str = Field(..., max_length=150)
    customer_name: str = Field(..., max_length=100)
    shipment_weight: float = Field(..., ge=0)
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    status: ShipmentStatusEnum = ShipmentStatusEnum.Created
    expected_delivery_at: datetime | None = None


class ShipmentCreate(ShipmentBase):
    pass


class ShipmentUpdate(BaseModel):
    tracking_number: str | None = Field(None, max_length=30)
    source: str | None = Field(None, max_length=150)
    destination: str | None = Field(None, max_length=150)
    customer_name: str | None = Field(None, max_length=100)
    shipment_weight: float | None = Field(None, ge=0)
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    status: ShipmentStatusEnum | None = None
    expected_delivery_at: datetime | None = None


class ShipmentStatusUpdateRequest(BaseModel):
    status: ShipmentStatusEnum
    location: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class ShipmentResponse(ShipmentBase):
    shipment_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class ShipmentStatusHistoryResponse(BaseModel):
    history_id: UUID
    shipment_id: UUID
    status: ShipmentStatusEnum
    location: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    updated_by: UUID | None = None
    changed_at: datetime

    class Config:
        from_attributes = True


class ShipmentAlertResponse(BaseModel):
    shipment_id: UUID
    tracking_number: str
    customer_name: str
    status: ShipmentStatusEnum
    expected_delivery_at: datetime | None = None
    alert_type: str  # "DELAYED" or "APPROACHING_DEADLINE"
    message: str