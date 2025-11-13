"""
Authentication request/response schemas
"""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# ===== REQUEST SCHEMAS =====

class RegisterRequest(BaseModel):
    """User registration request"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=100)
    display_name: str | None = Field(None, max_length=100)


class LoginRequest(BaseModel):
    """User login request supporting email or username"""
    # Accept plain string to avoid strict email validation 422; service decides
    email: str | None = None
    username: str | None = None
    password: str


# ===== RESPONSE SCHEMAS =====

class UserResponse(BaseModel):
    """User information response"""
    id: int
    email: str
    username: str
    display_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True  # For SQLModel compatibility


class LoginResponse(BaseModel):
    """Login response with token"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class SessionResponse(BaseModel):
    """User session information"""
    id: int
    user_id: int
    token_jti: str
    ip_address: str | None
    user_agent: str | None
    last_active_at: datetime
    expires_at: datetime
    is_revoked: bool
    created_at: datetime

    class Config:
        from_attributes = True
