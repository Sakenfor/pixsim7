"""Prompt domain policy registration for cross-domain policy indexing."""

from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    PolicyEngine,
    ConstraintValidator,
)

PROMPT_POLICY_CONTRACT_VERSION = "2026-04-02.1"
PROMPT_POLICY_SCHEMA_VERSION = "1.0"
PROMPT_POLICY_DOMAIN = "prompts"
PROMPT_POLICY_CONTRACT_ENDPOINT = "/api/v1/prompts/meta/authoring-contract"

# Phase 3 scaffolding: prompts domain is registered now; enforcement rules can
# be added incrementally without changing the registry surface.
PROMPT_POLICY_RULES: list[Dict[str, Any]] = []
PROMPT_POLICY_CONSTRAINT_VALIDATORS: Dict[str, ConstraintValidator] = {}

PROMPT_POLICY_ENGINE = PolicyEngine(
    contract_version=PROMPT_POLICY_CONTRACT_VERSION,
    schema_version=PROMPT_POLICY_SCHEMA_VERSION,
    domain=PROMPT_POLICY_DOMAIN,
    contract_endpoint=PROMPT_POLICY_CONTRACT_ENDPOINT,
    summary=(
        "Prompt authoring policy surface for cross-domain policy discovery. "
        "Domain registration is active; enforcement rules are added incrementally."
    ),
    rules=PROMPT_POLICY_RULES,
    constraint_validators=PROMPT_POLICY_CONSTRAINT_VALIDATORS,
)
DOMAIN_POLICY_REGISTRY.register(PROMPT_POLICY_DOMAIN, PROMPT_POLICY_ENGINE)


def get_prompt_policy_contract() -> Dict[str, Any]:
    return PROMPT_POLICY_ENGINE.get_contract()

