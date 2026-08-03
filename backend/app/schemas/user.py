from pydantic import BaseModel, EmailStr
from uuid import UUID
from app.models.user import RoleEnum

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None
    role: RoleEnum = RoleEnum.Driver

class UserOut(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    role: RoleEnum
    is_verified: bool

    class Config:
        from_attributes = True


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class Token(BaseModel):
    access_token: str
    token_type: str