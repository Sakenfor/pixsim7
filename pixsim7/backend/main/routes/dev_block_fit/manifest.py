"""
Block ↔ Image Fit API Routes Plugin

Provides dev-only endpoints for computing and recording fit scores between ActionBlocks
and assets. Supports fit scoring heuristics based on ontology tag alignment.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.block_image_fit import router

manifest = PluginManifest(
    id="dev_block_fit",
    name="Block-Image Fit Scoring API",
    version="1.0.0",
    description="Dev endpoints for block-to-asset fit scoring and rating",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/block-fit
    tags=["dev", "block-fit"],
    dependencies=[],  # Standalone, uses ontology + ActionBlocks
    requires_db=True,  # Needs DB for ActionBlocks, Assets, Generations
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
