"""
Protocol surface — the only thing backend (and other consumers) implement
to provide automation with the cross-domain data it needs.

Design invariants (keep these stable so Phase 2/3 stay reachable):
- Every method is async (HTTP-ready for a future service split).
- Only snapshot DTOs — frozen dataclasses in pixsim7.automation.protocols.dto —
  cross the boundary. No SQLModel, no ORM relationship objects, no DB sessions.
- Methods are coarse-grained; avoid chatty per-field accessors.
- No transactions span the protocol. Cross-domain writes go through events
  (on_account_deleted etc.), not synchronous calls.
"""
from pixsim7.automation.protocols.accounts import AccountLookup, AccountSnapshot
from pixsim7.automation.protocols.providers import (
    ProviderMetadataLookup,
    PixverseAdTask,
)
from pixsim7.automation.protocols.queue import JobQueue
from pixsim7.automation.protocols.paths import PathRegistry

__all__ = [
    "AccountLookup",
    "AccountSnapshot",
    "ProviderMetadataLookup",
    "PixverseAdTask",
    "JobQueue",
    "PathRegistry",
]
