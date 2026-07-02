"""Built-in game contract surfaces."""
from __future__ import annotations

from ..models import MetaContract, MetaContractEndpoint


def _species_meta_endpoints() -> list:
    """Generate species CRUD MetaContractEndpoints for game.authoring."""
    try:
        from pixsim7.backend.main.api.v1.species_meta import species_crud_spec
        from pixsim7.backend.main.services.crud.registry import spec_to_meta_sub_endpoints
        eps = spec_to_meta_sub_endpoints(species_crud_spec)
        # Re-tag for game_authoring:characters focus group
        for ep in eps:
            ep.tags = ["game_authoring", "game_authoring:characters"]
        return eps
    except ImportError:
        return []


def _builtin_game_authoring(version: str = "unknown") -> MetaContract:
    # Auto-generate sub-endpoints from the entity CRUD registry so that new
    # game entity types are automatically surfaced in the contract (and in the
    # AI assistant focus system) without manual wiring.
    #
    # group_consolidation merges related domain tags into logical focus groups.
    # The spec tags (e.g. ["runtime", "npcs"]) provide the domain; the mapping
    # consolidates them: "npcs" → "characters", "locations" → "worlds", etc.
    # Result: endpoints tagged game_authoring + game_authoring:characters etc.
    _GROUP_CONSOLIDATION = {
        "locations": "worlds",
        "worlds": "worlds",
        "npcs": "characters",
        "characters": "characters",
        "scenes": "scenes",
        "items": "items",
    }
    try:
        from pixsim7.backend.main.services.entity_crud.crud_router import (
            entity_specs_to_meta_sub_endpoints,
        )
        auto_endpoints = entity_specs_to_meta_sub_endpoints(
            tag="game_authoring",
            group_consolidation=_GROUP_CONSOLIDATION,
        )
    except Exception:
        auto_endpoints = []

    # Derive child focus groups from generated endpoints
    child_groups = sorted({
        t for ep in auto_endpoints for t in ep.tags
        if ":" in t and t.startswith("game_authoring:")
    })

    return MetaContract(
        id="game.authoring",
        name="Game Authoring Contract",
        endpoint="/api/v1/game/meta/authoring-contract",
        version=version,
        auth_required=True,
        owner="game authoring lane",
        summary=(
            "Canonical API workflow contract for world bootstrap, behavior setup, "
            "project snapshots, and agent-driven game iteration."
        ),
        provides=[
            "game_authoring",
            "game_authoring:characters",
            "species_crud",
            *child_groups,
            "world_bootstrap_workflows",
            "behavior_authoring_workflows",
            "project_snapshot_iteration",
            "project_discovery",
            "seed_profile_guidance",
            "idempotency_guidance",
        ],
        relates_to=[
            "blocks.discovery",
            "prompts.authoring",
            "user.assistant",
            "plans.management",
        ],
        sub_endpoints=[
            MetaContractEndpoint(
                id="game.meta.authoring_contract",
                method="GET",
                path="/api/v1/game/meta/authoring-contract",
                summary="Machine-readable workflow contract for game creation and iteration.",
                tags=["game_authoring"],
            ),
            # Species vocabulary CRUD (blocks DB, but conceptually part of
            # character/creature authoring — agents use species when creating characters).
            *_species_meta_endpoints(),
            # Character registry endpoints (mounted outside /api/v1/game/ so
            # not auto-discovered by entity_crud, listed explicitly here).
            MetaContractEndpoint(
                id="characters.list",
                method="GET",
                path="/api/v1/characters",
                summary="List all characters. Filter by category, species, archetype.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.create",
                method="POST",
                path="/api/v1/characters",
                summary="Create a character with species, visual_traits, personality, and behavioral patterns.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.get",
                method="GET",
                path="/api/v1/characters/{character_id}",
                summary="Get a character by ID with full detail.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.update",
                method="PUT",
                path="/api/v1/characters/{character_id}",
                summary="Update a character (full replace).",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.expand_template",
                method="POST",
                path="/api/v1/characters/expand-template",
                summary="Expand a character's visual description template using species + visual_traits.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            *auto_endpoints,
        ],
    )
