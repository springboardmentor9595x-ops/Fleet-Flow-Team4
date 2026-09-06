from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List


class MaintenanceBase(BaseModel):
    vehicle_id: UUID
    maintenance_type: str = Field(default="General Inspection", max_length=100)
    service_date: Optional[datetime] = None
    next_service_date: Optional[datetime] = None
    scheduled_date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None
    cost: Optional[float] = 0.0
    status: Optional[str] = "Scheduled"


class MaintenanceCreate(MaintenanceBase):
    pass


class MaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = None
    service_date: Optional[datetime] = None
    next_service_date: Optional[datetime] = None
    scheduled_date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None
    cost: Optional[float] = None
    status: Optional[str] = None


class MaintenanceResponse(MaintenanceBase):
    maintenance_id: UUID
    registration_number: Optional[str] = None
    model: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
