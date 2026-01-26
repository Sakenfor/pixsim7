"""
Game Templates CRUD API Routes Plugin

Auto-generates CRUD endpoints for all registered template types
(LocationTemplate, ItemTemplate, etc.) using the TemplateCRUDRegistry.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.services.templates import (
    create_template_crud_router,
    register_default_template_specs,
)

# Register template specs before creating router
register_default_template_specs()

# Create the router with all registered template CRUD endpoints
router = create_template_crud_router()

manifest = PluginManifest(
    id="game_templates",
    name="Game Templates CRUD API",
    version="1.0.0",
    description="Generic CRUD endpoints for template entities (locations, items, etc.)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game",
    tags=["templates"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
