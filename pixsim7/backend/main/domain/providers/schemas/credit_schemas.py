"""
Credit Schemas

Data shapes for credit operations.
"""
from typing import Optional, Dict
from pydantic import BaseModel, Field


class CreditUpdate(BaseModel):
    """
    Credit update request

    Used for updating credits for an account.
    """
    account_id: int = Field(..., description="Account ID to update")
    credit_type: str = Field(..., description="Credit type (e.g., 'web', 'openapi')")
    amount: int = Field(..., ge=0, description="New credit amount")


class CreditSyncResult(BaseModel):
    """
    Result of credit sync operation

    Returned when syncing credits from provider.
    """
    account_id: int = Field(..., description="Account that was synced")
    provider_id: str = Field(..., description="Provider identifier")
    credits_before: Dict[str, int] = Field(
        default_factory=dict,
        description="Credits before sync"
    )
    credits_after: Dict[str, int] = Field(
        default_factory=dict,
        description="Credits after sync"
    )
    synced_at: str = Field(..., description="ISO timestamp of sync")
    skipped: bool = Field(
        default=False,
        description="Whether sync was skipped (e.g., recently synced)"
    )
    skip_reason: Optional[str] = Field(
        default=None,
        description="Reason for skip if skipped=True"
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if sync failed"
    )
