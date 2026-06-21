"""
Account request/response schemas - CLEAN VERSION

Provider accounts that users can own, per provider (Pixverse, Runway, etc.)

Credit system (normalized, queryable):
- Credits tracked in separate ProviderCredit table
- Supports unlimited credit types per provider
"""
from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, EmailStr, Field
from pixsim7.backend.main.domain.enums import AccountStatus


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
    api_keys: Optional[list[dict]] = None  # Generic API keys (provider-specific structure)
    cookies: Optional[dict] = None
    is_private: bool = False  # False = shared with all users, True = only owner can use
    priority: int = 0
    routing_allow_patterns: Optional[List[str]] = None
    routing_deny_patterns: Optional[List[str]] = None
    routing_priority_overrides: Optional[Dict[str, int]] = None


class AccountUpdate(BaseModel):
    """Update provider account"""
    email: Optional[str] = None
    nickname: Optional[str] = None
    jwt_token: Optional[str] = None
    api_key: Optional[str] = None
    api_keys: Optional[list[dict]] = None  # Generic API keys
    cookies: Optional[dict] = None
    is_private: Optional[bool] = None
    status: Optional[AccountStatus] = None
    is_google_account: Optional[bool] = None  # Mark account as Google-authenticated
    priority: Optional[int] = None
    routing_allow_patterns: Optional[List[str]] = None
    routing_deny_patterns: Optional[List[str]] = None
    routing_priority_overrides: Optional[Dict[str, int]] = None


class GrantCreate(BaseModel):
    """Create/update a share rule: (provider, model?, slots) for one recipient,
    optionally pinned to a single account.

    Identify the recipient by ``recipient_user_id`` or ``recipient_username``
    (at least one required)."""
    recipient_user_id: Optional[int] = None
    recipient_username: Optional[str] = None
    provider_id: str
    model: Optional[str] = Field(default=None, description="Specific model; omit for all models")
    account_id: Optional[int] = Field(default=None, description="Pin to one account; omit to pool across the provider")
    slot_limit: int = Field(default=1, ge=1, description="Max concurrent jobs for the recipient within this rule")
    note: Optional[str] = Field(default=None, max_length=500)


class GrantResponse(BaseModel):
    """A share rule (stackable)."""
    id: int
    owner_user_id: int
    recipient_user_id: int
    recipient_username: Optional[str] = None
    provider_id: str
    model: Optional[str] = None
    account_id: Optional[int] = None
    slot_limit: int
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AccountResponse(BaseModel):
    """Account response - provider-agnostic with normalized credits"""
    id: int
    user_id: Optional[int]  # None = system account
    email: str
    provider_id: str
    nickname: Optional[str]
    is_private: bool
    status: str
    priority: int

    # Auth info
    has_jwt: bool
    jwt_expired: bool
    jwt_expires_at: Optional[datetime]
    has_api_key_paid: bool  # True if any API key of kind 'openapi' exists
    has_cookies: bool
    is_google_account: bool  # True if authenticated via Google Sign-In
    # Session health: True if the JWT/session died and could not auto-recover
    # (provider couldn't reauth — Google login or a failed password reauth).
    # The stored credit/plan values may be stale until a manual re-sync.
    session_invalid: bool = False
    session_invalid_reason: Optional[str] = None

    # API keys (for displaying in UI)
    api_keys: Optional[list[dict]] = None

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

    # Plan capabilities
    plan_tier: int = 0  # 0=free, 1=standard, 2+=pro (from Pixverse plan_details)
    unlimited_image_models: List[str] = Field(default_factory=list)
    # Active promotions (e.g. {"v6": true} for model discounts)
    promotions: Dict[str, bool] = Field(default_factory=dict)
    # Resolved discount multipliers (e.g. {"v6": 0.7}) - backend-authoritative
    promotion_discounts: Dict[str, float] = Field(default_factory=dict)
    routing_allow_patterns: List[str] = Field(default_factory=list)
    routing_deny_patterns: List[str] = Field(default_factory=list)
    routing_priority_overrides: Dict[str, int] = Field(default_factory=dict)

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


class CreateAccountApiKeyResponse(BaseModel):
    """Response from creating an OpenAPI key for an account."""
    success: bool
    api_key_id: Optional[int] = None
    api_key_name: Optional[str] = None
    api_key: Optional[str] = None
    already_exists: bool = False
    account: AccountResponse


class AccountBulkCreditUpdate(BaseModel):
    """Bulk update credits by email"""
    email: EmailStr
    credits: Dict[str, int]  # credit_type -> amount (e.g., {"webapi": 100, "openapi": 50})
    provider_id: str = "pixverse"  # Default to pixverse for backward compatibility
