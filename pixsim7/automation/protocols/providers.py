from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True, slots=True)
class PixverseAdTask:
    """Daily ad-watch task state for a Pixverse account.

    Automation uses these three fields to loop the ad-watching preset the
    correct number of times. Nothing else from the provider response leaks
    across the boundary.
    """

    total_counts: Optional[int]
    progress: Optional[int]
    completed_counts: Optional[int]


class ProviderMetadataLookup(Protocol):
    """Per-provider runtime data automation presets reference via variables.

    Started narrow on purpose (only what the workers/automation.py ad-vars
    path actually needs today). Extend with more methods as new provider-
    specific preset variables appear.
    """

    async def pixverse_ad_task(self, account_id: int) -> Optional[PixverseAdTask]:
        """Fetch the current ad-task state for this account, or None on failure.

        Implementations should swallow provider errors and return None —
        automation treats missing metadata as "don't set the pixverse_ad_*
        variables", which is the current behavior of the try/except block
        in workers/automation.py.
        """
        ...
