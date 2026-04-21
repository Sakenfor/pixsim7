from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Sequence


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
    """Account data as automation sees it.

    `resolved_password` is the password automation should use — backend's
    adapter does the account-password-else-provider-global-password fallback
    and ships the result here. Automation never sees provider settings.
    """

    id: int
    email: str
    provider_id: str
    resolved_password: Optional[str]


class AccountLookup(Protocol):
    """Backend-side account queries needed by automation."""

    async def get(self, account_id: int) -> Optional[AccountSnapshot]:
        """Fetch a single account snapshot, or None if missing."""
        ...

    async def list_active(
        self,
        *,
        provider_id: Optional[str] = None,
        account_ids: Optional[Sequence[int]] = None,
        exclude_account_ids: Optional[Sequence[int]] = None,
    ) -> list[AccountSnapshot]:
        """Return ACTIVE accounts matching the filters, for loop eligibility.

        - provider_id: restrict to one provider (optional).
        - account_ids: restrict to these ids (LoopSelectionMode.SPECIFIC_ACCOUNTS).
        - exclude_account_ids: accounts currently in-flight to skip.
        """
        ...
