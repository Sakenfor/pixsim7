"""
ProviderCredit domain model - normalized credit tracking

CLEAN & QUERYABLE:
- Separate table for credits
- Support multiple credit types per account
- Efficient queries and aggregations
"""
from typing import Optional, TYPE_CHECKING
from datetime import datetime
from sqlmodel import SQLModel, Field, Index, Relationship

if TYPE_CHECKING:
    from .account import ProviderAccount


class ProviderCredit(SQLModel, table=True):
    """
    Credit tracking per account and type

    Design:
    - Normalized: Each credit type is a separate row
    - Queryable: Can filter/aggregate by credit_type
    - Flexible: New credit types don't require schema changes

    Examples:
    - Pixverse account: 2 rows (webapi=100, openapi=50)
    - Runway account: 1 row (standard=200)
    - Kling account: 1 row (credits=150)
    """
    __tablename__ = "provider_credits"

    # Composite primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Account reference
    account_id: int = Field(
        foreign_key="provider_accounts.id",
        index=True,
        description="Account owning these credits"
    )

    # Credit type (provider-specific)
    credit_type: str = Field(
        max_length=50,
        index=True,
        description="Credit type: 'webapi', 'openapi', 'standard', 'pro', etc."
    )

    # Credit amount
    amount: int = Field(
        default=0,
        description="Current credit amount"
    )

    # Timestamps
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last credit update"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow
    )

    # ===== RELATIONSHIPS =====
    account: Optional["ProviderAccount"] = Relationship(back_populates="credits")

    # ===== INDEXES =====
    __table_args__ = (
        # Unique constraint: one row per (account, credit_type)
        Index("idx_account_credit_type", "account_id", "credit_type", unique=True),
        # Fast lookups by type and amount
        Index("idx_credit_type_amount", "credit_type", "amount"),
    )

    def __repr__(self):
        return (
            f"<ProviderCredit("
            f"account_id={self.account_id}, "
            f"type={self.credit_type}, "
            f"amount={self.amount})>"
        )

    @classmethod
    def get_display_name(cls, credit_type: str, provider_id: str) -> str:
        """
        Get human-readable credit type name

        Provider-specific mapping:
        - Pixverse: webapi → "WebAPI (Free)", openapi → "OpenAPI (Paid)"
        - Runway: standard → "Standard Credits"
        """
        mappings = {
            "pixverse": {
                "webapi": "WebAPI (Free)",
                "openapi": "OpenAPI (Paid)",
                "pro": "Pro Tier"
            },
            "runway": {
                "standard": "Standard Credits",
                "api": "API Credits"
            },
            "kling": {
                "standard": "Credits"
            }
        }

        provider_map = mappings.get(provider_id, {})
        return provider_map.get(credit_type, credit_type.capitalize())
