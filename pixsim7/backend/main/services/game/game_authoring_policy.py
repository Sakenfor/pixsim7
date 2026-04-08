"""Game domain policy registration for cross-domain policy indexing."""

from __future__ import annotations

from typing import Any, Dict, List

from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    ConstraintValidator,
    PolicyEngine,
)

GAME_POLICY_CONTRACT_VERSION = "2026-04-02.1"
GAME_POLICY_SCHEMA_VERSION = "1.0"
GAME_POLICY_DOMAIN = "game"
GAME_POLICY_CONTRACT_ENDPOINT = "/api/v1/game/meta/authoring-contract"

GAME_POLICY_RULES: list[Dict[str, Any]] = [
    {
        "id": "game.world.create.name_required_for_automation",
        "endpoint_id": "game.gameWorld.create",
        "field": "name",
        "level": "required",
        "applies_to": {"principal_types": ["agent", "service"]},
        "description": "Automated world creation must provide a non-empty world name.",
        "constraint": {"type": "non_empty_string"},
        "message": "name is required for automated gameWorld creation.",
    },
    {
        "id": "game.scene.create.title_required_for_automation",
        "endpoint_id": "game.gameScene.create",
        "field": "title",
        "level": "required",
        "applies_to": {"principal_types": ["agent", "service"]},
        "description": "Automated scene creation must provide a non-empty title.",
        "constraint": {"type": "non_empty_string"},
        "message": "title is required for automated gameScene creation.",
    },
    {
        "id": "game.location.create.name_suggested",
        "endpoint_id": "game.gameLocation.create",
        "field": "name",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "Location names improve readability across tools and audits.",
        "constraint": {"type": "non_empty_string"},
        "message": "Add a non-empty name when creating gameLocation entities.",
    },
    {
        "id": "game.npc.create.name_suggested",
        "endpoint_id": "game.gameNPC.create",
        "field": "name",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "NPC names improve log readability and debugging.",
        "constraint": {"type": "non_empty_string"},
        "message": "Add a non-empty name when creating gameNPC entities.",
    },
    {
        "id": "game.item.create.name_suggested",
        "endpoint_id": "game.gameItem.create",
        "field": "name",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "Item names improve inspectability and searchability.",
        "constraint": {"type": "non_empty_string"},
        "message": "Add a non-empty name when creating gameItem entities.",
    },
    {
        "id": "game.location.hotspot.replace_all.items_suggested",
        "endpoint_id": "game.gameLocation.hotspot.replace_all",
        "field": "items",
        "level": "suggested",
        "applies_to": {"principal_types": ["agent", "service", "user"]},
        "description": "Explicit item lists are recommended for deterministic replace_all operations.",
        "constraint": {"type": "array_min_items", "min_items": 1},
        "message": "Provide at least one hotspot in replace_all payloads unless clearing intentionally.",
    },
]


def _normalize_rule_message(rule: Dict[str, Any], field_name: str) -> str:
    return str(rule.get("message") or f"{field_name} violated policy")


def _constraint_non_empty_string(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del constraint, payload, context
    if isinstance(value, str) and value.strip():
        return []
    return [_normalize_rule_message(rule, field_name)]


def _constraint_array_min_items(
    value: Any,
    field_name: str,
    rule: Dict[str, Any],
    constraint: Dict[str, Any],
    payload: Any,
    context: Dict[str, Any],
) -> List[str]:
    del payload, context
    try:
        min_items = int(constraint.get("min_items", 0))
    except (TypeError, ValueError):
        min_items = 0
    if isinstance(value, list) and len(value) >= min_items:
        return []
    return [_normalize_rule_message(rule, field_name)]


GAME_POLICY_CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {
    "non_empty_string": _constraint_non_empty_string,
    "array_min_items": _constraint_array_min_items,
}

GAME_POLICY_ENGINE = PolicyEngine(
    contract_version=GAME_POLICY_CONTRACT_VERSION,
    schema_version=GAME_POLICY_SCHEMA_VERSION,
    domain=GAME_POLICY_DOMAIN,
    contract_endpoint=GAME_POLICY_CONTRACT_ENDPOINT,
    summary=(
        "Game authoring policy surface for cross-domain policy discovery and "
        "entity CRUD quality checks."
    ),
    rules=GAME_POLICY_RULES,
    constraint_validators=GAME_POLICY_CONSTRAINT_VALIDATORS,
)
DOMAIN_POLICY_REGISTRY.register(GAME_POLICY_DOMAIN, GAME_POLICY_ENGINE)


def get_game_policy_contract() -> Dict[str, Any]:
    return GAME_POLICY_ENGINE.get_contract()
