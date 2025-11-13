"""
User management request/response schemas
"""
from datetime import datetime
from pydantic import BaseModel, Field


# ===== REQUEST SCHEMAS =====

class UpdateUserRequest(BaseModel):
    """Update user profile request"""
    username: str | None = Field(None, min_length=3, max_length=50)
    full_name: str | None = Field(None, max_length=100)


# ===== RESPONSE SCHEMAS =====

class UserResponse(BaseModel):
    """User profile response"""
    id: int
    email: str
    username: str
    full_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class UserQuotaResponse(BaseModel):
    """User quota information"""
    max_jobs: int
    max_storage_gb: float
    max_accounts: int

    class Config:
        from_attributes = True


class UserUsageResponse(BaseModel):
    """User usage statistics"""
    user_id: int
    # Job counts
    jobs_total: int
    jobs_pending: int
    jobs_processing: int
    jobs_completed: int
    jobs_failed: int
    # Storage
    storage_used_bytes: int
    storage_used_gb: float
    # Accounts
    accounts_count: int
    # Quotas
    quota: UserQuotaResponse
    # Status
    is_quota_exceeded: bool
    can_create_job: bool

    class Config:
        from_attributes = True
