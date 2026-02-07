"""
User domain model - authentication and authorization

Multi-user support for PixSim7
"""
from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

from .enums import AccountStatus
from pixsim7.backend.main.shared.datetime_utils import utcnow


class UserRole(str):
    """User roles"""
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


class User(SQLModel, table=True):
    """
    User model - authentication and authorization

    Design principles:
    - Multi-tenant ready
    - Quota tracking
    - Role-based access
    """
    __tablename__ = "users"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== IDENTITY =====
    email: str = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, max_length=100)

    # ===== AUTHENTICATION =====
    password_hash: str = Field(max_length=255)
    is_active: bool = Field(default=True, index=True)
    is_verified: bool = Field(default=False)
    email_verified_at: Optional[datetime] = None

    # ===== AUTHORIZATION =====
    role: str = Field(
        default=UserRole.USER,
        max_length=20,
        description="User role: admin, user, guest"
    )

    # ===== QUOTA & LIMITS =====
    # Job quotas
    max_concurrent_jobs: int = Field(
        default=10,
        description="Max simultaneous jobs"
    )
    max_daily_jobs: int = Field(
        default=100,
        description="Max jobs per day"
    )
    jobs_today: int = Field(
        default=0,
        description="Jobs created today"
    )
    last_job_reset: Optional[datetime] = Field(
        default=None,
        description="Last time jobs_today was reset"
    )

    # Asset quotas
    max_assets: int = Field(
        default=1000,
        description="Max total assets"
    )
    max_storage_gb: float = Field(
        default=100.0,
        description="Max storage in GB"
    )
    current_storage_gb: float = Field(
        default=0.0,
        description="Current storage usage in GB"
    )

    # Account quotas
    max_provider_accounts: int = Field(
        default=5,
        description="Max provider accounts"
    )

    # ===== USAGE STATS =====
    total_jobs_created: int = Field(default=0)
    total_jobs_completed: int = Field(default=0)
    total_jobs_failed: int = Field(default=0)
    total_assets_created: int = Field(default=0)

    # ===== PROFILE =====
    display_name: Optional[str] = Field(default=None, max_length=100)
    avatar_url: Optional[str] = None
    bio: Optional[str] = None

    # ===== SETTINGS =====
    preferences: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="User preferences (theme, notifications, etc.)"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_login_at: Optional[datetime] = None

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"

    def is_admin(self) -> bool:
        """Check if user is admin"""
        return self.role == UserRole.ADMIN

    def can_create_job(self) -> bool:
        """Check if user can create more jobs"""
        if not self.is_active:
            return False

        # Check daily limit
        if self.jobs_today >= self.max_daily_jobs:
            return False

        return True

    def has_storage_available(self, required_gb: float) -> bool:
        """Check if user has storage available"""
        return (self.current_storage_gb + required_gb) <= self.max_storage_gb

    def increment_storage(self, gb: float) -> None:
        """Increment storage usage"""
        self.current_storage_gb += gb

    def decrement_storage(self, gb: float) -> None:
        """Decrement storage usage"""
        self.current_storage_gb = max(0, self.current_storage_gb - gb)


class UserSession(SQLModel, table=True):
    """
    User session tracking (for JWT tokens)

    Allows token revocation and session management
    """
    __tablename__ = "user_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    # Session token (JWT jti claim)
    token_id: str = Field(unique=True, index=True, max_length=255)

    # Token metadata
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime
    last_used_at: Optional[datetime] = None

    # Session info
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = None

    # Client identification (for device/client tracking)
    client_id: Optional[str] = Field(default=None, max_length=255, index=True)
    client_type: Optional[str] = Field(default=None, max_length=50)  # "chrome_extension", "web_app", "device_agent", etc.
    client_name: Optional[str] = Field(default=None, max_length=255)  # Human-readable client name

    # Revocation
    is_revoked: bool = Field(default=False, index=True)
    revoked_at: Optional[datetime] = None
    revoke_reason: Optional[str] = None

    def __repr__(self):
        return f"<UserSession(id={self.id}, user_id={self.user_id}, revoked={self.is_revoked})>"

    def is_valid(self) -> bool:
        """Check if session is still valid"""
        if self.is_revoked:
            return False
        if self.expires_at < datetime.now(timezone.utc):
            return False
        return True


class UserQuotaUsage(SQLModel, table=True):
    """
    Daily quota usage tracking

    Tracks usage per user per day for rate limiting
    """
    __tablename__ = "user_quota_usage"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    # Date tracking
    date: datetime = Field(index=True)  # Date (day precision)

    # Usage counters
    jobs_created: int = Field(default=0)
    jobs_completed: int = Field(default=0)
    jobs_failed: int = Field(default=0)
    assets_created: int = Field(default=0)
    storage_added_gb: float = Field(default=0.0)

    # Timestamps
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self):
        return f"<UserQuotaUsage(user_id={self.user_id}, date={self.date}, jobs={self.jobs_created})>"
