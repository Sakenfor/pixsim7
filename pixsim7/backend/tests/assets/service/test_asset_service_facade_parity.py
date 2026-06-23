"""Parity guard for the AssetService compatibility facade.

`AssetService` (services/asset/service.py) is a hand-maintained delegation layer
over four specialised sub-services. Every public sub-service method has to be
mirrored by an explicit delegate on the facade -- miss one and any route that
reaches for it via the injected ``AssetSvc`` dependency blows up with
``AttributeError`` -> HTTP 500 at runtime (this exact bug shipped for
``delete_asset_from_provider_only``).

This test discovers the public surface of each sub-service and asserts the
facade exposes it, so a forgotten delegate fails in CI instead of in production.
Deliberate non-delegations live in ``INTENTIONALLY_NOT_DELEGATED`` with a reason,
which keeps every omission a conscious decision rather than a silent gap.
"""
from __future__ import annotations

import inspect

from pixsim7.backend.main.services.asset.service import AssetService
from pixsim7.backend.main.services.asset.core import AssetCoreService
from pixsim7.backend.main.services.asset.sync import AssetSyncService
from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
from pixsim7.backend.main.services.asset.quota import AssetQuotaService

SUB_SERVICES = (
    AssetCoreService,
    AssetSyncService,
    AssetEnrichmentService,
    AssetQuotaService,
)

# Public sub-service methods that the facade intentionally does NOT delegate.
# Each entry is (method_name, reason). Add here only with a justification.
INTENTIONALLY_NOT_DELEGATED = {
    # Full enrichment pipeline is consumed via AssetEnrichmentService directly
    # (assets_enrich, pixverse_sync, ...); the facade only exposes the lighter
    # recognition/metadata helpers. See module docstring "use specific services
    # directly".
    "enrich_synced_asset",
    "re_enrich_synced_asset",
    # Exposed on the facade under the alias ``find_similar_asset_by_phash``.
    "find_similar_by_phash",
}


def _public_methods(cls) -> set[str]:
    """Public (non-dunder, non-underscore) callable names on a class + its MRO."""
    return {
        name
        for name, _ in inspect.getmembers(cls, predicate=inspect.isfunction)
        if not name.startswith("_")
    }


def test_facade_exposes_every_public_subservice_method() -> None:
    missing: list[str] = []
    for sub in SUB_SERVICES:
        for name in _public_methods(sub):
            if name in INTENTIONALLY_NOT_DELEGATED:
                continue
            if not hasattr(AssetService, name):
                missing.append(f"{sub.__name__}.{name}")

    assert not missing, (
        "AssetService facade is missing delegates for public sub-service methods "
        f"(causes AttributeError -> 500 at runtime): {sorted(missing)}. "
        "Add an explicit delegate in services/asset/service.py, or, if the method "
        "is meant to be used via the sub-service directly, add it to "
        "INTENTIONALLY_NOT_DELEGATED with a reason."
    )


def test_intentional_allowlist_has_no_stale_entries() -> None:
    """Every allowlisted name must still be a real public sub-service method."""
    all_public = set().union(*(_public_methods(s) for s in SUB_SERVICES))
    stale = sorted(INTENTIONALLY_NOT_DELEGATED - all_public)
    assert not stale, (
        f"INTENTIONALLY_NOT_DELEGATED references methods that no longer exist: "
        f"{stale}. Remove them from the allowlist."
    )
