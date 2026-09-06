from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, EmailStr
from uuid import UUID
from app.models.user import RoleEnum

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    confirm_password: Optional[str] = None
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    role: RoleEnum = RoleEnum.Driver

class SignupResponse(BaseModel):
    message: str
    email: EmailStr

class UserOut(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    role: RoleEnum
    is_verified: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserProfileOut(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    role: RoleEnum
    is_verified: bool
    account_status: str = "Active"
    created_at: Optional[datetime] = None
    assigned_vehicle: Optional[Dict[str, Any]] = None


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    assigned_vehicle: Optional[Any] = None


class UserRoleUpdate(BaseModel):
    role: RoleEnum


class AdminUserListItem(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    role: RoleEnum
    is_verified: bool
    account_status: str = "Active"
    created_at: Optional[datetime] = None
    assigned_vehicle: Optional[Dict[str, Any]] = None


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str