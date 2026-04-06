"""
Species Meta API Routes Plugin

CRUD endpoints for the species vocabulary registry (blocks.discovery domain).
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.species_meta import router

manifest = PluginManifest(
    id="species_meta",
    name="Species Meta API",
    version="1.0.0",
    description="CRUD endpoints for species vocabulary registry",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["species", "meta"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
