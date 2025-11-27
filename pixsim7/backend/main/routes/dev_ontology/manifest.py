"""
Ontology Usage API Routes Plugin

Provides dev-only endpoints for inspecting ontology IDs and their usage in ActionBlocks.
Supports ontology evolution by showing which IDs are defined and where they're used.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_ontology import router

manifest = PluginManifest(
    id="dev_ontology",
    name="Ontology Usage API",
    version="1.0.0",
    description="Dev endpoints for ontology ID inspection and usage tracking",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/ontology
    tags=["dev", "ontology"],
    dependencies=[],  # Standalone, uses ontology loader
    requires_db=True,  # Needs DB to scan ActionBlocks
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
