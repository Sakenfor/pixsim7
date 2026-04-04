"""
Scope key derivation & profile normalization helpers.

Single source of truth for scope_key parsing/building and profile ID
normalization used by agent dispatch, chat session tracking, the WS
chat handler, and the bridge client.

Lives at package root so both backend and client can import without
cross-dependency (pure stdlib, no heavy deps).
"""
from __future__ import annotations

from typing import Any, Optional

# ── Profile normalization ────────────────────────────────────────

_BASE_PROFILE_SENTINELS = frozenset({"unknown", "none", "null"})


def normalize_profile_id(
    profile_id: Optional[str],
    *,
    extra_sentinels: frozenset[str] = frozenset(),
) -> Optional[str]:
    """Strip and reject sentinel profile IDs (``unknown``, ``none``, etc.)."""
    value = (profile_id or "").strip()
    if not value:
        return None
    sentinels = _BASE_PROFILE_SENTINELS | extra_sentinels if extra_sentinels else _BASE_PROFILE_SENTINELS
    if value.lower() in sentinels:
        return None
    return value


# ── Scope value normalization ────────────────────────────────────

def normalize_scope_value(value: Any) -> Optional[str]:
    """Return *None* for non-string / empty / whitespace-only values."""
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


# ── Context alias keys (priority order) ──────────────────────────

_SCOPE_KEY_ALIASES = ("scope_key", "scopeKey")
_PLAN_ID_ALIASES = ("plan_id", "planId", "x_plan_id", "xPlanId")
_CONTRACT_ID_ALIASES = ("contract_id", "contractId", "contract")


def _first_alias(context: dict[str, Any], aliases: tuple[str, ...]) -> Optional[str]:
    for key in aliases:
        val = normalize_scope_value(context.get(key))
        if val:
            return val
    return None


# ── Scope key derivation (context → scope_key) ──────────────────

def derive_scope_key(
    context: dict[str, Any],
    explicit_scope_key: Optional[str] = None,
) -> Optional[str]:
    """Resolve a canonical scope key from an explicit value, then context aliases.

    Returns *None* when no scope can be determined.
    """
    scope = normalize_scope_value(explicit_scope_key)
    if scope:
        return scope

    scope = _first_alias(context, _SCOPE_KEY_ALIASES)
    if scope:
        return scope

    plan_id = _first_alias(context, _PLAN_ID_ALIASES)
    if plan_id:
        return f"plan:{plan_id}"

    contract_id = _first_alias(context, _CONTRACT_ID_ALIASES)
    if contract_id:
        return f"contract:{contract_id}"

    return None


# ── Scope key parsing (scope_key → plan_id / contract_id) ───────

def parse_scope_key(scope_key: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Reverse-parse ``plan:X`` or ``contract:X`` into component IDs.

    Returns ``(plan_id, contract_id)`` — at most one is non-None.
    """
    val = normalize_scope_value(scope_key)
    if not val:
        return None, None
    if val.startswith("plan:"):
        plan_id = val.split(":", 1)[1].strip() or None
        return plan_id, None
    if val.startswith("contract:"):
        contract_id = val.split(":", 1)[1].strip() or None
        return None, contract_id
    return None, None


# ── Combined extraction (context + scope_key → all three) ───────

def extract_scope(
    context: dict[str, Any],
    explicit_scope_key: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Extract ``(scope_key, plan_id, contract_id)`` from context + explicit scope.

    Fills in missing plan_id/contract_id by reverse-parsing the scope_key,
    and vice-versa.
    """
    plan_id = _first_alias(context, _PLAN_ID_ALIASES)
    contract_id = _first_alias(context, _CONTRACT_ID_ALIASES)

    scope_key = normalize_scope_value(explicit_scope_key) or _first_alias(context, _SCOPE_KEY_ALIASES)

    # Build scope_key from IDs if not explicitly provided
    if scope_key is None:
        if plan_id:
            scope_key = f"plan:{plan_id}"
        elif contract_id:
            scope_key = f"contract:{contract_id}"

    # Reverse-fill IDs from scope_key
    if scope_key and plan_id is None:
        parsed_plan, _ = parse_scope_key(scope_key)
        if parsed_plan:
            plan_id = parsed_plan
    if scope_key and contract_id is None:
        _, parsed_contract = parse_scope_key(scope_key)
        if parsed_contract:
            contract_id = parsed_contract

    return scope_key, plan_id, contract_id
