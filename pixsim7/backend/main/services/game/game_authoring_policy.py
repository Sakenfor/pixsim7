"""Game domain policy registration for cross-domain policy indexing."""

from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    PolicyEngine,
    ConstraintValidator,
)

GAME_POLICY_CONTRACT_VERSION = "2026-04-02.1"
GAME_POLICY_SCHEMA_VERSION = "1.0"
GAME_POLICY_DOMAIN = "game"
GAME_POLICY_CONTRACT_ENDPOINT = "/api/v1/game/meta/authoring-contract"

# Phase 3 scaffolding: game domain is registered now; enforcement rules can
# be introduced iteratively as game authoring constraints are codified.
GAME_POLICY_RULES: list[Dict[str, Any]] = []
GAME_POLICY_CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {}

GAME_POLICY_ENGINE = PolicyEngine(
    contract_version=GAME_POLICY_CONTRACT_VERSION,
    schema_version=GAME_POLICY_SCHEMA_VERSION,
    domain=GAME_POLICY_DOMAIN,
    contract_endpoint=GAME_POLICY_CONTRACT_ENDPOINT,
    summary=(
        "Game authoring policy surface for cross-domain policy discovery. "
        "Domain registration is active; enforcement rules are added incrementally."
    ),
    rules=GAME_POLICY_RULES,
    constraint_validators=GAME_POLICY_CONSTRAINT_VALIDATORS,
)
DOMAIN_POLICY_REGISTRY.register(GAME_POLICY_DOMAIN, GAME_POLICY_ENGINE)


def get_game_policy_contract() -> Dict[str, Any]:
    return GAME_POLICY_ENGINE.get_contract()

