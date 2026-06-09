"""
Asset Sets API Routes Plugin

Backend-native named collections of assets (manual membership + smart
filters), replacing the localStorage-only useAssetSetStore. See plan
``asset-sets-backend``.
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.asset_sets import router

manifest = PluginManifest(
    id="asset_sets",
    name="Asset Sets API",
    version="1.0.0",
    description="Server-persisted asset sets (manual members + smart filters), ownership-scoped",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["asset-sets"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
