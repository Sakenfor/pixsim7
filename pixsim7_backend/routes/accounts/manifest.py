"""
Provider Accounts API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.accounts import router

manifest = PluginManifest(
    id="accounts",
    name="Provider Accounts API",
    version="1.0.0",
    description="Provider account management (Pixverse, Sora, etc.)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["accounts"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
