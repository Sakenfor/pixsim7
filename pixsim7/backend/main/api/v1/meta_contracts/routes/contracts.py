"""Meta-contract contracts endpoints."""
from __future__ import annotations

import importlib
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.routing import APIRoute

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user_optional, get_database
from pixsim7.backend.main.services.ownership.scope_authz import filter_allowed_contracts
from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)
from pixsim7.backend.main.services.meta.agent_sessions import (
    agent_session_registry,
)
from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    PolicyEngine,
)
from pixsim7.backend.main.shared.config import settings

from ..models import (
    AgentPresence,
    ContractEndpointEntry,
    ContractIndexEntry,
    ContractsIndexResponse,
    EndpointAvailabilityEntry,
    PoliciesIndexResponse,
    PolicyIndexEntry,
)

router = APIRouter(tags=["meta"])


CONTRACTS_INDEX_VERSION = "2026-03-28.1"


POLICIES_INDEX_VERSION = "2026-04-03.1"


def _sync_policy_domains() -> None:
    # Import policy modules for side-effect registration.
    plan_policy = importlib.import_module("pixsim7.backend.main.services.docs.plan_authoring_policy")
    importlib.import_module("pixsim7.backend.main.services.prompt.prompt_authoring_policy")
    importlib.import_module("pixsim7.backend.main.services.game.game_authoring_policy")
    if DOMAIN_POLICY_REGISTRY.get("plans") is None:
        plan_contract = plan_policy.get_plan_authoring_contract()
        DOMAIN_POLICY_REGISTRY.register(
            "plans",
            PolicyEngine(
                contract_version=str(plan_contract.get("version") or "2026-03-24.1"),
                schema_version=str(plan_contract.get("schema_version") or "1.0"),
                domain="plans",
                contract_endpoint=str(
                    plan_contract.get("endpoint")
                    or getattr(plan_policy, "PLAN_AUTHORING_CONTRACT_ENDPOINT", "/api/v1/dev/plans/meta/authoring-contract")
                ),
                summary=str(
                    plan_contract.get("summary")
                    or "Canonical plan authoring policy contract."
                ),
                rules=list(getattr(plan_policy, "PLAN_AUTHORING_RULES", []) or []),
                constraint_validators=dict(getattr(plan_policy, "CONSTRAINT_VALIDATORS", {}) or {}),
                principal_type_resolver=getattr(plan_policy, "_principal_type", None),
                logger=getattr(plan_policy, "logger", None),
            ),
        )


def _normalize_route_path(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


def _slugify_contract_token(value: str) -> str:
    token = "".join(ch if ch.isalnum() else "_" for ch in str(value or "").strip().lower())
    token = token.strip("_")
    return token or "unknown"


def _sanitize_tool_fragment(value: str) -> str:
    normalized = str(value or "").strip().lower().replace(".", "_").replace("/", "_")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized)
    normalized = normalized.strip("_")
    return normalized or "endpoint"


def _make_tool_name(contract_id: str, endpoint_id: str) -> str:
    return f"{_sanitize_tool_fragment(contract_id)}__{_sanitize_tool_fragment(endpoint_id)}"


def _discover_game_route_group_contracts(
    request: Optional[Request],
    *,
    active_sessions: List[Any],
) -> List[ContractIndexEntry]:
    app = getattr(request, "app", None) if request is not None else None
    routes = getattr(app, "routes", None)
    if not isinstance(routes, list):
        return []

    groups: Dict[str, Dict[str, Any]] = {}
    for route in routes:
        if not isinstance(route, APIRoute):
            continue

        normalized_path = _normalize_route_path(route.path)
        if not normalized_path.startswith("/api/v1/game/"):
            continue

        suffix = normalized_path[len("/api/v1/game/") :]
        if not suffix:
            continue
        group_key = suffix.split("/", 1)[0].strip()
        if not group_key:
            continue

        entry = groups.setdefault(
            group_key,
            {
                "methods": set(),
                "paths": set(),
            },
        )

        methods = {
            method.upper()
            for method in (route.methods or set())
            if isinstance(method, str) and method.upper() not in {"HEAD", "OPTIONS"}
        }
        entry["methods"].update(methods)
        entry["paths"].add(normalized_path)

    contracts: List[ContractIndexEntry] = []
    for group_key in sorted(groups.keys(), key=str.lower):
        group_meta = groups[group_key]
        group_slug = _slugify_contract_token(group_key)
        contract_id = f"game.routes.{group_slug}"
        contract_endpoint = f"/api/v1/game/{group_key}"
        methods = sorted(group_meta["methods"])
        paths = sorted(group_meta["paths"])

        agents_on_contract = [
            AgentPresence(**s.to_presence())
            for s in active_sessions
            if s.contract_id == contract_id
        ]

        method_summary = ", ".join(methods) if methods else "none"
        summary = (
            f"Auto-discovered game route group '{group_key}' exposing "
            f"{len(paths)} path(s) and methods: {method_summary}."
        )

        contracts.append(
            ContractIndexEntry(
                id=contract_id,
                name=f"Game Routes: {group_key}",
                endpoint=contract_endpoint,
                version=CONTRACTS_INDEX_VERSION,
                auth_required=True,
                owner="game route plugins",
                summary=summary,
                audience=["user", "dev"],
                provides=[
                    "game_api_routes",
                    f"game_route_group:{group_slug}",
                ],
                relates_to=["game.authoring", "user.assistant"],
                sub_endpoints=[],
                active_agents=agents_on_contract,
            )
        )

    return contracts


def _resolve_endpoint_availability(
    contract_id: str,
    endpoint_id: str,
    availability: Dict[str, Any] | None,
) -> EndpointAvailabilityEntry:
    """Apply runtime-aware availability overrides."""
    payload = dict(availability or {})
    payload.setdefault("status", "available")
    payload.setdefault("reason", None)
    payload.setdefault("conditions", [])

    # Runtime override: filesystem sync endpoint is disabled in DB-only mode.
    if contract_id == "plans.management" and endpoint_id == "plans.sync":
        if settings.plans_db_only_mode:
            payload["status"] = "disabled"
            payload["reason"] = "Disabled while plans DB-only mode is enabled."
        elif payload.get("status") == "disabled":
            payload["status"] = "conditional"

    return EndpointAvailabilityEntry(**payload)


@router.get("/contracts", response_model=ContractsIndexResponse)
async def list_contract_endpoints(
    request: Request = None,
    audience: Optional[str] = Query(
        None,
        description="Filter by audience: 'user' or 'dev'. Omit for all.",
    ),
    principal=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> ContractsIndexResponse:
    """
    Contract discovery graph with live agent activity overlay.

    Each contract declares `provides` (capabilities) and `relates_to`
    (other contract IDs), forming a navigable discovery graph.
    `active_agents` shows which agents are currently working on each surface.

    Pass `?audience=user` to only get user-facing contracts (excludes dev tooling).
    """
    _sync_contract_versions()
    audience_filter = audience.strip() if isinstance(audience, str) else None

    active_sessions = agent_session_registry.get_active()

    contracts = []
    for c in meta_contract_registry.values():
        # Filter by audience if requested
        if audience_filter and audience_filter not in c.audience:
            continue

        agents_on_contract = [
            AgentPresence(**s.to_presence())
            for s in active_sessions
            if s.contract_id == c.id
        ]

        sub_endpoints: List[ContractEndpointEntry] = []
        tool_names: List[str] = []
        for ep in c.sub_endpoints:
            availability = _resolve_endpoint_availability(c.id, ep.id, ep.availability)
            tool_name = _make_tool_name(c.id, ep.id)
            sub_endpoints.append(
                ContractEndpointEntry(
                    id=ep.id,
                    tool_name=tool_name,
                    method=ep.method,
                    path=ep.path,
                    summary=ep.summary,
                    auth_required=c.auth_required if ep.auth_required is None else ep.auth_required,
                    requires_admin=ep.requires_admin,
                    permissions=ep.permissions,
                    availability=availability,
                    input_schema=ep.input_schema,
                    output_schema=ep.output_schema,
                    tags=ep.tags,
                )
            )
            # Match MCP dynamic tool registration behavior.
            if ep.path.startswith("/") and availability.status != "disabled":
                tool_names.append(tool_name)

        contracts.append(ContractIndexEntry(
            id=c.id,
            name=c.name,
            endpoint=c.endpoint,
            version=c.version,
            auth_required=c.auth_required,
            owner=c.owner,
            summary=c.summary,
            audience=c.audience,
            provides=c.provides,
            relates_to=c.relates_to,
            sub_endpoints=sub_endpoints,
            tool_names=tool_names,
            active_agents=agents_on_contract,
        ))

    dynamic_game_route_contracts = _discover_game_route_group_contracts(
        request,
        active_sessions=active_sessions,
    )
    existing_ids = {contract.id for contract in contracts}
    for contract in dynamic_game_route_contracts:
        if contract.id in existing_ids:
            continue
        if audience_filter and audience_filter not in contract.audience:
            continue
        contracts.append(contract)

    # Scoped-agent contract provisioning: a profile-restricted agent discovers
    # only its allowed_contracts (NULL = all). The MCP client builds its
    # toolset from this listing, so omitting a contract means the agent's tools
    # for it are never registered. Discovery/provisioning control, not a hard
    # per-call gate (contracts aren't a server dispatch point); authoritative
    # write limits stay the resource-scope gates. Plan
    # ``scoped-agent-authorization`` (cp4).
    allowed_ids = await filter_allowed_contracts(db, principal, [c.id for c in contracts])
    contracts = [c for c in contracts if c.id in allowed_ids]

    return ContractsIndexResponse(
        version=CONTRACTS_INDEX_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        contracts=contracts,
        total_active_agents=len(active_sessions),
    )


@router.get("/policies", response_model=PoliciesIndexResponse)
async def list_policy_contracts() -> PoliciesIndexResponse:
    """List registered domain policy contracts."""
    _sync_policy_domains()

    policies: List[PolicyIndexEntry] = []
    for domain in sorted(DOMAIN_POLICY_REGISTRY.list_domains()):
        engine = DOMAIN_POLICY_REGISTRY.get(domain)
        if engine is None:
            continue
        contract = engine.get_contract()
        rules = contract.get("rules") or []
        endpoint_ids: List[str] = []
        for rule in rules if isinstance(rules, list) else []:
            if not isinstance(rule, dict):
                continue
            endpoint_id = str(rule.get("endpoint_id") or "").strip()
            if endpoint_id and endpoint_id not in endpoint_ids:
                endpoint_ids.append(endpoint_id)
        policies.append(
            PolicyIndexEntry(
                domain=str(contract.get("domain") or domain),
                version=str(contract.get("version") or ""),
                schema_version=str(contract.get("schema_version") or ""),
                endpoint=str(contract.get("endpoint") or ""),
                summary=str(contract.get("summary") or ""),
                rules_count=len(rules) if isinstance(rules, list) else 0,
                endpoints=sorted(endpoint_ids),
            )
        )

    return PoliciesIndexResponse(
        version=POLICIES_INDEX_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        policies=policies,
    )


def _sync_contract_versions() -> None:
    """Keep registry versions in sync with canonical contract version constants."""
    from pixsim7.backend.main.api.v1.prompts.meta import (
        PROMPT_ANALYSIS_CONTRACT_VERSION,
        PROMPT_AUTHORING_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.game_meta import (
        GAME_AUTHORING_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.meta_ui import (
        UI_CATALOG_CONTRACT_VERSION,
    )
    from pixsim7.backend.main.api.v1.dev_testing import (
        TESTING_CONTRACT_VERSION,
    )

    meta_contract_registry.update_version(
        "prompts.analysis", PROMPT_ANALYSIS_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "prompts.authoring", PROMPT_AUTHORING_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "game.authoring", GAME_AUTHORING_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "ui.catalog", UI_CATALOG_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "testing.catalog", TESTING_CONTRACT_VERSION
    )
