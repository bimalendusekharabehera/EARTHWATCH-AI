from pydantic import BaseModel, EmailStr, Field
from typing import Literal


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=1, description="Account password")


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: Literal["ADMIN", "ANALYST"]
    is_active: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LogoutResponse(BaseModel):
    status: str = "success"
    message: str = "Logged out successfully"
