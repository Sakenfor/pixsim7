"""
Account request/response schemas - CLEAN VERSION

Provider accounts that users can own, per provider (Pixverse, Runway, etc.)

Credit system (normalized, queryable):
- Credits tracked in separate ProviderCredit table
- Supports unlimited credit types per provider
"""
from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, EmailStr
from pixsim7_backend.domain.enums import AccountStatus


class CreditInfo(BaseModel):
    """Credit info for a specific type"""
    credit_type: str
    amount: int
    updated_at: datetime


class AccountCreate(BaseModel):
    """Create new provider account"""
    email: EmailStr
    provider_id: str = "pixverse"
    jwt_token: Optional[str] = None
    api_key: Optional[str] = None
    api_key_paid: Optional[str] = None  # Paid/premium API key (e.g., Pixverse OpenAPI)
    cookies: Optional[dict] = None
    is_private: bool = False  # False = shared with all users, True = only owner can use


class AccountUpdate(BaseModel):
    """Update provider account"""
    jwt_token: Optional[str] = None
    api_key: Optional[str] = None
    api_key_paid: Optional[str] = None  # Paid/premium API key
    cookies: Optional[dict] = None
    is_private: Optional[bool] = None
    status: Optional[AccountStatus] = None


class AccountResponse(BaseModel):
    """Account response - provider-agnostic with normalized credits"""
    id: int
    user_id: Optional[int]  # None = system account
    email: str
    provider_id: str
    nickname: Optional[str]
    is_private: bool
    status: str

    # Auth info
    has_jwt: bool
    jwt_expired: bool
    jwt_expires_at: Optional[datetime]
    has_api_key_paid: bool  # Has paid/premium API key
    has_cookies: bool

    # Credits (normalized - supports any number of credit types)
    # Example: {"webapi": 100, "openapi": 50} for Pixverse
    # Example: {"standard": 200} for Runway
    credits: Dict[str, int]  # credit_type -> amount
    total_credits: int  # Sum of all credits

    # Usage
    videos_today: int
    total_videos_generated: int
    total_videos_failed: int
    success_rate: float

    # Concurrency
    max_concurrent_jobs: int
    current_processing_jobs: int

    # Timing
    last_used: Optional[datetime]
    last_error: Optional[str]
    cooldown_until: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SetCreditRequest(BaseModel):
    """Set credit for specific type"""
    credit_type: str
    amount: int


class AccountBulkCreditUpdate(BaseModel):
    """Bulk update credits by email"""
    email: EmailStr
    credits: Dict[str, int]  # credit_type -> amount (e.g., {"webapi": 100, "openapi": 50})
