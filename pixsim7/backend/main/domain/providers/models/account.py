"""
ProviderAccount domain model - provider credentials and account pool

Owns:
- Account metadata and authentication
- Concurrency control
- Rate limiting
- Performance tracking (EMA for generation times)

Credits are tracked in separate ProviderCredit table (normalized).
"""
from typing import Optional, Dict, Any, TYPE_CHECKING
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Relationship
from sqlalchemy import JSON, UniqueConstraint
from pydantic import field_validator

from pixsim7.backend.main.domain.enums import AccountStatus

if TYPE_CHECKING:
    from .credit import ProviderCredit


class ProviderAccount(SQLModel, table=True):
    """
    Provider account model

    Design principles:
    - Account Pool: Multiple accounts per provider for rotation
    - Concurrency Control: max_concurrent_jobs prevents overload
    - Rate Limiting: cooldown_until for provider rate limits
    - No Defaults: provider_id must be explicit
    """
    __tablename__ = "provider_accounts"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== OWNER =====
    # Null = system/file-managed account
    user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True
    )
    is_private: bool = Field(
        default=False,
        description="Private account (only owner can use)"
    )

    # ===== PROVIDER =====
    # NO DEFAULT! Must be explicit
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Provider: 'pixverse', 'runway', 'pika'"
    )

    # ===== CREDENTIALS =====
    email: str = Field(max_length=255)
    password: Optional[str] = None

    # Authentication credentials (provider-specific usage)
    jwt_token: Optional[str] = None  # Web/session auth (e.g., Pixverse WebAPI)
    api_key: Optional[str] = None    # Legacy/general API key (provider-specific meaning)
    api_keys: Optional[list[Dict[str, Any]]] = Field(
        default=None,
        sa_column=Column(JSON),
        description=(
            "List of API keys for this account. "
            "Each entry is a dict such as "
            "{'id': 'main', 'kind': 'openapi', 'value': 'pk...', 'priority': 10}."
        ),
    )
    cookies: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON)
    )

    # ===== ACCOUNT INFO =====
    nickname: Optional[str] = Field(default=None, max_length=100)
    provider_user_id: Optional[str] = Field(default=None, max_length=100)
    provider_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Raw provider metadata (e.g., getUserInfo response from Pixverse)"
    )

    # ===== CREDITS =====
    # Credits are now tracked in separate ProviderCredit table
    # This allows flexible credit types per provider
    # Relationship defined below

    # ===== USAGE STATS =====
    total_videos_generated: int = Field(default=0)
    total_videos_failed: int = Field(default=0)
    failure_streak: int = Field(
        default=0,
        description="Consecutive failures (despite having credits)"
    )

    # ===== STATUS =====
    status: AccountStatus = Field(
        default=AccountStatus.ACTIVE,
        index=True
    )
    last_error: Optional[str] = None

    # ===== RATE LIMITING =====
    last_used: Optional[datetime] = None
    cooldown_until: Optional[datetime] = Field(
        default=None,
        description="Account in cooldown until this time"
    )

    # ===== PERFORMANCE STATS =====
    success_rate: float = Field(default=1.0)
    avg_generation_time_sec: Optional[float] = None

    # ===== ADAPTIVE ETA (Exponential Moving Average) =====
    ema_generation_time_sec: Optional[float] = Field(
        default=None,
        description="Exponential moving average of generation time for adaptive ETA"
    )
    ema_alpha: float = Field(
        default=0.3,
        description="EMA smoothing factor (0-1, higher = more weight to recent samples)"
    )

    # ===== CONCURRENCY CONTROL =====
    max_concurrent_jobs: int = Field(
        default=2,
        description="Max simultaneous jobs (Pixverse free=2, paid=5)"
    )
    current_processing_jobs: int = Field(
        default=0,
        description="Current jobs in progress"
    )

    # ===== LIMITS =====
    priority: int = Field(
        default=0,
        description="Account priority (higher = preferred)"
    )
    max_daily_videos: Optional[int] = None
    videos_today: int = Field(default=0)

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # ===== RELATIONSHIPS =====
    credits: list["ProviderCredit"] = Relationship(
        back_populates="account",
        sa_relationship_kwargs={
            "lazy": "selectin",  # Eager load credits with account
            "cascade": "all, delete-orphan"  # Delete credits when account is deleted
        }
    )

    # ===== CONSTRAINTS =====
    __table_args__ = (
        UniqueConstraint(
            "email", "provider_id", "user_id",
            name="uq_provider_account_email_provider_user"
        ),
    )

    def __repr__(self):
        return (
            f"<ProviderAccount("
            f"email={self.email}, "
            f"provider={self.provider_id}, "
            f"status={self.status.value})>"
        )

    def get_total_credits(self) -> int:
        """
        Get total credits across all credit types

        Returns:
            Sum of all credit amounts
        """
        if not self.credits:  # credits relationship
            return 0

        # Deduplicate by credit_type to prevent double-counting
        # In case of duplicates (should not happen due to unique constraint),
        # take the latest value
        credit_map = {}
        for c in self.credits:
            if c.credit_type not in credit_map:
                credit_map[c.credit_type] = c.amount
            else:
                # Log warning if duplicates found (should never happen)
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Duplicate credit_type '{c.credit_type}' found for account {self.id}. "
                    f"Using latest value. This should not happen due to unique constraint."
                )
                credit_map[c.credit_type] = c.amount

        return sum(credit_map.values())

    def get_credit(self, credit_type: str) -> int:
        """
        Get credits for specific type

        Args:
            credit_type: Credit type (e.g., "web", "openapi", "standard")

        Returns:
            Credit amount for that type, or 0 if not found
        """
        if not self.credits:
            return 0
        for credit in self.credits:
            if credit.credit_type == credit_type:
                return credit.amount
        return 0

    def has_sufficient_credits(self, min_amount: int) -> bool:
        """
        Check if account has sufficient total credits

        Args:
            min_amount: Minimum credits required (provider-specific)

        Returns:
            True if total credits (sum of all types) >= min_amount
        """
        if not self.credits:
            return False
        # Use total sum of all credit types
        return self.get_total_credits() >= min_amount

    def has_any_credits(self) -> bool:
        """
        Check if account has any credits at all

        Returns:
            True if any credit type has > 0 credits
        """
        if not self.credits:
            return False
        return any(c.amount > 0 for c in self.credits)

    def is_available(self) -> bool:
        """
        Check if account is available for use (basic checks only)

        Note: This only checks account status, concurrency, and that credits exist.
        Provider adapter should check if credits are sufficient for specific operations.

        Returns:
            True if account can potentially accept new jobs
        """
        # Must be active
        if self.status != AccountStatus.ACTIVE:
            return False

        # Check cooldown
        if self.cooldown_until and datetime.utcnow() < self.cooldown_until:
            return False

        # Check daily limit
        if self.max_daily_videos and self.videos_today >= self.max_daily_videos:
            return False

        # Check concurrency limit
        if self.current_processing_jobs >= self.max_concurrent_jobs:
            return False

        # Check that account has ANY credits (provider will check specific amounts)
        if not self.has_any_credits():
            return False

        return True

    def has_capacity(self) -> bool:
        """
        Check if account has capacity for additional jobs

        Returns:
            True if under concurrency limit
        """
        return self.current_processing_jobs < self.max_concurrent_jobs

    def update_ema_generation_time(self, actual_time_sec: float) -> None:
        """
        Update exponential moving average of generation time

        Args:
            actual_time_sec: Actual generation time for completed job
        """
        if self.ema_generation_time_sec is None:
            # First sample - use actual time
            self.ema_generation_time_sec = actual_time_sec
        else:
            # EMA formula: EMA_new = alpha * actual + (1 - alpha) * EMA_old
            alpha = self.ema_alpha
            self.ema_generation_time_sec = (
                alpha * actual_time_sec + (1 - alpha) * self.ema_generation_time_sec
            )

    def get_estimated_completion_time(self) -> float:
        """
        Get estimated completion time based on EMA

        Returns:
            Estimated time in seconds, or default 300 (5 minutes) if no history
        """
        if self.ema_generation_time_sec is not None:
            return self.ema_generation_time_sec
        elif self.avg_generation_time_sec is not None:
            return self.avg_generation_time_sec
        else:
            # Default fallback
            return 300.0  # 5 minutes

    def calculate_success_rate(self) -> float:
        """Calculate success rate from stats"""
        total = self.total_videos_generated + self.total_videos_failed
        if total == 0:
            return 1.0
        return self.total_videos_generated / total


# ===== EMAIL NORMALIZATION =====
# Auto-normalize email on set to prevent case-sensitive duplicates

from sqlalchemy import event

@event.listens_for(ProviderAccount, 'before_insert', propagate=True)
@event.listens_for(ProviderAccount, 'before_update', propagate=True)
def normalize_email_before_save(mapper, connection, target):
    """Normalize email to lowercase before insert/update"""
    if target.email:
        target.email = target.email.lower().strip()
