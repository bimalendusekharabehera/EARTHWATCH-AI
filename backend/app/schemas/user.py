from pydantic import BaseModel, EmailStr, Field
from typing import List, Literal, Optional


class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=8, max_length=100)
    role: Literal["ADMIN", "ANALYST"] = Field(default="ANALYST")


class UserUpdateStatus(BaseModel):
    is_active: bool


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: Literal["ADMIN", "ANALYST"]
    is_active: bool
    created_at: str


class UserListResponse(BaseModel):
    status: str = "success"
    count: int
    users: List[UserResponse]
