"""
Game Domain Models Package

Registers game domain models with SQLModel.
Includes scenes, sessions, NPCs, locations.
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Manifest
manifest = DomainModelManifest(
    id="game_models",
    name="Game Domain Models",
    description="Game domain models (scenes, sessions, NPCs, locations)",
    models=[],
    source_modules=[
        "pixsim7.backend.main.domain.game.core.models",
        "pixsim7.backend.main.domain.game.entities.character",
        "pixsim7.backend.main.domain.game.entities.character_integrations",
        "pixsim7.backend.main.domain.game.entities.npc_memory",
        "pixsim7.backend.main.domain.game.entities.item_template",
        "pixsim7.backend.main.domain.game.entities.location_template",
        "pixsim7.backend.main.domain.game.entities.sequence",
    ],
    auto_discover=True,
    enabled=True,
    dependencies=["core_models"],  # Game models may reference User, Asset
)
