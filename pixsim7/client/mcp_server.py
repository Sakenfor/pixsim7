"""
MCP stdio server — dynamic proxy between Claude CLI and PixSim API.

On startup, fetches the meta contract graph from /api/v1/meta/contracts
and generates MCP tools from all sub_endpoints. Falls back to a generic
call_api tool if the API is unreachable.

Tools are named {contract_id}__{endpoint_id}
(e.g. plans_management__plans_create).
"""
from __future__ import annotations

import asyncio
import contextvars
import json
import os
import pathlib
import re
import sys
from typing import Any

_repo_root = str(pathlib.Path(__file__).resolve().parents[2])
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

try:
    import httpx
except ImportError:
    print("Missing dependency: httpx (pip install httpx)", file=sys.stderr)
    sys.exit(1)

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    import mcp.types as types
except ImportError:
    print("Missing dependency: mcp (pip install mcp)", file=sys.stderr)
    sys.exit(1)


API_URL = os.environ.get("PIXSIM_API_URL", "http://localhost:8000")
API_TOKEN = os.environ.get("PIXSIM_API_TOKEN", "")
API_TOKEN_FILE = os.environ.get("PIXSIM_TOKEN_FILE", "")  # Per-request token file
API_SCOPE = os.environ.get("PIXSIM_SCOPE", "")  # "user", "dev", or comma-separated contract IDs; empty = all
MCP_APPROVAL_TOOLS = os.environ.get("PIXSIM_MCP_APPROVAL_TOOLS", "")  # comma-separated tool names requiring approval
HOOK_PORT = os.environ.get("PIXSIM_HOOK_PORT", "")  # bridge hook server port for confirmations


def _get_login_token() -> str:
    """Read the user's persistent login token (~/.pixsim/token).

    This token has a long TTL (login session) and can be used to mint
    fresh agent tokens when the current one expires.

    Validates that the token is actually a user login token (not an agent
    or bridge token that was accidentally written to the same file).
    Also checks expiry — an expired login token is useless for refresh.
    """
    try:
        from pathlib import Path
        stored = Path.home() / ".pixsim" / "token"
        token = stored.read_text().strip()
        if not token:
            return ""
        # Validate: must be a user token, not agent/bridge, and not expired
        claims = _decode_token_claims(token)
        purpose = claims.get("purpose", "")
        if purpose in ("agent", "bridge"):
            # Not a login token — an agent/bridge token was written here
            return ""
        exp = claims.get("exp", 0)
        if exp and isinstance(exp, (int, float)):
            import time
            if exp < time.time():
                return ""  # expired
        return token
    except (OSError, FileNotFoundError):
        pass
    return ""


# In-memory refreshed token — takes priority after a successful refresh
_refreshed_token: str = ""


def _is_token_expired(token: str) -> bool:
    """Check if a JWT token is expired (with 30s grace)."""
    claims = _decode_token_claims(token)
    exp = claims.get("exp", 0)
    if exp and isinstance(exp, (int, float)):
        import time
        return exp < time.time() - 30
    return False


def _get_token() -> str:
    """Read the freshest non-expired token.

    Priority: per-request (HTTP) > refreshed (self-heal) > token file > env var > login token.
    Skips expired tokens so a stale file doesn't shadow a valid env var.
    """
    # -1. Per-request token from HTTP headers (set by Starlette middleware)
    req_token = _request_token.get()
    if req_token and not _is_token_expired(req_token):
        return req_token
    # 0. In-memory refreshed token (from self-heal on 401)
    if _refreshed_token and not _is_token_expired(_refreshed_token):
        return _refreshed_token
    # 1. Per-request token file (written by bridge before each task)
    if API_TOKEN_FILE:
        try:
            with open(API_TOKEN_FILE, "r") as f:
                token = f.read().strip()
                if token and not _is_token_expired(token):
                    return token
        except OSError:
            pass
    # 2. Env var (set at MCP server startup)
    if API_TOKEN and not _is_token_expired(API_TOKEN):
        return API_TOKEN
    # 3. Persistent login token (~/.pixsim/token) — already checks expiry internally
    return _get_login_token()

server = Server("pixsim")


# ── Per-request context (HTTP mode) ────────────────────────────────
# In STDIO mode these are unset — handlers fall back to env vars.
# In HTTP mode, Starlette middleware sets them from request headers.

_request_scope: contextvars.ContextVar[str | None] = contextvars.ContextVar("_request_scope", default=None)
_request_token: contextvars.ContextVar[str | None] = contextvars.ContextVar("_request_token", default=None)
_request_session_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("_request_session_id", default=None)
_request_profile_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("_request_profile_id", default=None)

# In-process dispatch session — set by the bridge before each dispatch so
# the MCP server can resolve the correct chat session without file I/O.
#
# Strictly per-task (ContextVar): concurrent dispatches in the same bridge
# process — e.g. two chat tabs each running their own agent — get isolated
# values; nested tool calls inherit their caller's context.
#
# Historically a module global mirrored this value as a "safety net" for
# code paths that lost task context. That fallback silently cross-attributed
# log_work entries to whichever tab dispatched most recently (see
# tools/reattach_misattached_worklog.py for the failure mode). Removed
# 2026-05: if the dispatch ctx is gone, callers must pass `session_id`
# explicitly or accept resolution falling through to the bridge API lookup.
_dispatch_session_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_dispatch_session_ctx", default=None,
)


def set_dispatch_session(session_id: str | None) -> None:
    """Set the active chat session for the current dispatch (bridge in-process).

    Writes the per-task ContextVar only — scoped to the calling asyncio task
    and any tasks it spawns via the standard contextvar inheritance. Callers
    outside that task tree must pass `session_id` explicitly; there is no
    module-global fallback (it cross-attributed across tabs).
    """
    _dispatch_session_ctx.set(session_id)


# Cached contracts (fetched once, reused for filtering)
_contracts_cache: list[dict] | None = None


# ── Dynamic tool registry (populated on startup) ──────────────────


# Each entry: tool_name -> metadata for proxying/invocation.
_dynamic_routes: dict[str, dict[str, Any]] = {}
_dynamic_tools: list[types.Tool] = []
_tool_aliases: dict[str, str] = {}
_initialized = False


def _path_params(path: str) -> list[str]:
    """Extract {param} placeholders from a path template."""
    return re.findall(r"\{(\w+)\}", path)


def _build_input_schema(method: str, path: str) -> dict:
    """Build a JSON schema for a tool based on its method and path params."""
    properties: dict[str, Any] = {}
    required: list[str] = []

    # Path parameters are always required
    for param in _path_params(path):
        properties[param] = {"type": "string", "description": f"Path parameter: {param}"}
        required.append(param)

    if method == "GET":
        properties["params"] = {
            "type": "object",
            "description": "Query parameters",
        }
    elif method in ("POST", "PATCH", "PUT"):
        properties["body"] = {
            "type": "object",
            "description": "Request body (JSON)",
        }

    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def _sanitize_tool_fragment(value: str) -> str:
    """Normalize contract/endpoint IDs for MCP tool names."""
    normalized = value.lower().replace(".", "_").replace("/", "_")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized)
    normalized = normalized.strip("_")
    return normalized or "endpoint"


def _make_tool_name(contract_id: str, endpoint_id: str) -> str:
    """Build a stable tool name from contract and endpoint IDs."""
    return f"{_sanitize_tool_fragment(contract_id)}__{_sanitize_tool_fragment(endpoint_id)}"


def _make_legacy_tool_name(endpoint_id: str) -> str:
    """Backward-compatible endpoint-only name."""
    return endpoint_id.replace(".", "_")


def _unique_tool_name(base_name: str, seen: set[str]) -> str:
    """Deduplicate tool names if two endpoints sanitize to the same key."""
    if base_name not in seen:
        return base_name
    index = 2
    while f"{base_name}_{index}" in seen:
        index += 1
    return f"{base_name}_{index}"


# Contracts always included regardless of focus — fundamental agent capabilities
_CORE_CONTRACTS: frozenset[str] = frozenset({
    "plans.management",
    "project.files",
})
_ALWAYS_INCLUDED_TOOLS: tuple[str, ...] = (
    "register_session",
    "log_work",
    "call_api",
    "ask_user",
)


def _normalize_contract_id(value: str) -> str:
    """Normalize contract IDs from either dot or underscore form."""
    return str(value or "").strip().replace("_", ".").lower()


# ── Focus: two deliberately-distinct namespaces ──────────────────────────
# A focus value may be expressed in EITHER of two namespaces, and the resolver
# accepts both. They are NOT the same axis and must not be conflated:
#
#   • capability tag  (contract ``provides``, e.g. "asset_management",
#     "prompt_authoring", "prompt_authoring:catalog") — the *semantic*, user-
#     facing vocabulary. Many-to-many: one capability may be provided by
#     several contracts (e.g. "prompt_authoring" → prompts.authoring AND
#     blocks.discovery). This is what the chat UI's focus areas and
#     build_user_system_prompt() use.
#
#   • contract id     (e.g. "assets.management", "prompts.authoring") — the
#     *structural* 1:1 key for one API-surface bundle; its sanitized form is
#     the grouped tool name. This is the surgical dev/CLI vocabulary
#     (PIXSIM_SCOPE="prompts_authoring,blocks_discovery").
#
# These intentionally diverge — "asset_management" (capability) is NOT
# "assets.management" (contract). Don't "fix" that by renaming: a capability
# and a contract are different things, and equal names would falsely imply a
# 1:1 identity the model doesn't have. Matching ``provides ∪ id`` is what lets
# both vocabularies resolve to the same tools.
def resolve_enabled_tool_names_for_focus(
    contracts: list[dict[str, Any]],
    focus_contract_ids: set[str] | None,
) -> list[str]:
    """Resolve the MCP tool names to enable for a focused contract set.

    Includes:
    - Focused contracts
    - Core contracts (always)
    - Built-in tools (`register_session`, `log_work`, `call_api`)

    In grouped mode, returns the contract-level tool name (e.g. `blocks_discovery`).
    In fine-grained mode, returns per-endpoint tool names.

    Uses contract-level ``tool_names`` from meta/contracts when present,
    with endpoint-based fallback for older payloads.

    A focus value matches a contract by its ``provides`` capability tag OR its
    ``id`` — see the "two deliberately-distinct namespaces" note above. This
    mirrors ``build_user_system_prompt`` so a given focus narrows the system
    prompt and the toolset identically, and sub-focus tags like
    ``prompt_authoring:catalog`` resolve to their owning contract.
    """
    raw_focus = {
        str(f).strip()
        for f in (focus_contract_ids or set())
        if str(f or "").strip()
    }
    normalized_focus = {_normalize_contract_id(f) for f in raw_focus}
    include_contract_ids = set(_CORE_CONTRACTS)
    include_contract_ids.update(normalized_focus)

    seen: set[str] = set()
    enabled: list[str] = []

    def _add(name: str) -> None:
        if not name or name in seen:
            return
        seen.add(name)
        enabled.append(name)

    for tool_name in _ALWAYS_INCLUDED_TOOLS:
        _add(tool_name)

    for contract in contracts:
        contract_id = _normalize_contract_id(contract.get("id", ""))
        if not contract_id:
            continue
        provides = contract.get("provides")
        provides = provides if isinstance(provides, list) else []
        matched_by_id = contract_id in include_contract_ids
        matched_by_provides = bool(raw_focus.intersection(provides))
        if not (matched_by_id or matched_by_provides):
            continue

        if MCP_GROUPED:
            # In grouped mode, the tool name is the sanitized contract ID
            _add(_sanitize_tool_fragment(contract_id))
            continue

        # Preferred source (from /api/v1/meta/contracts)
        contract_tool_names = contract.get("tool_names")
        if isinstance(contract_tool_names, list) and contract_tool_names:
            for tool_name in contract_tool_names:
                if isinstance(tool_name, str):
                    _add(tool_name.strip())
            continue

        # Backward-compatible fallback (older meta payloads)
        for endpoint in contract.get("sub_endpoints", []):
            endpoint_id = endpoint.get("id", "")
            path = endpoint.get("path", "")
            availability = endpoint.get("availability") or {}
            if not endpoint_id or not isinstance(path, str) or not path.startswith("/"):
                continue
            if availability.get("status") == "disabled":
                continue
            _add(_make_tool_name(contract_id, endpoint_id))

    return enabled


def resolve_focus_filter_names(
    scope: str | None,
    contracts: list[dict[str, Any]] | None,
) -> set[str] | None:
    """Resolve the enabled tool-name set for an HTTP request scope.

    ``scope`` is the raw ``X-Scope-Key`` header — a comma-separated list of
    focus contract IDs. Returns the set of tool names to expose, or ``None``
    to mean "no narrowing; return the full toolset".

    Narrowing only kicks in when at least one focus value names a real
    contract — by ``id`` or by a ``provides`` capability tag (the UI's focus
    areas live in the ``provides`` namespace). A stray scope value (an
    audience word like ``"dev"``, or a tab scope key that leaked into
    ``X-Scope-Key``) matches nothing and is treated as no-focus — otherwise it
    would silently collapse to the core-only set, because
    ``resolve_enabled_tool_names_for_focus`` always force-adds the core
    contracts and an unmatched focus is indistinguishable from a deliberate
    core-only narrowing.
    """
    if not scope or contracts is None:
        return None
    raw_focus = {s.strip() for s in scope.split(",") if s.strip()}
    if not raw_focus:
        return None
    normalized_focus = {_normalize_contract_id(s) for s in raw_focus}
    known_ids = {_normalize_contract_id(c.get("id", "")) for c in contracts}
    known_provides: set[str] = set()
    for c in contracts:
        provides = c.get("provides")
        if isinstance(provides, list):
            known_provides.update(provides)
    if not (normalized_focus & known_ids) and not (raw_focus & known_provides):
        return None
    return set(resolve_enabled_tool_names_for_focus(contracts, raw_focus))


def _parse_scope() -> tuple[str | None, set[str]]:
    """Parse PIXSIM_SCOPE into audience filter and contract ID allowlist.

    Returns (audience, contract_ids):
    - "user" or "dev" → audience filter, no contract filtering
    - "prompts_authoring,blocks_discovery" → no audience, contract allowlist
      (core contracts are always included automatically)
    - empty → no filtering at all
    """
    raw = API_SCOPE.strip()
    if not raw:
        return None, set()
    if raw in ("user", "dev"):
        return raw, set()
    # Comma-separated contract IDs (dot or underscore form both accepted)
    ids = {s.strip().replace("_", ".") for s in raw.split(",") if s.strip()}
    ids |= _CORE_CONTRACTS  # always include core
    return None, ids


async def _fetch_contracts() -> list[dict] | None:
    """Fetch contracts from meta API.

    Returns the contract list on success (possibly empty), or ``None`` on
    failure (non-200 / exception). The ``None`` vs ``[]`` distinction matters:
    ``_init_tools`` must not freeze a *failed* fetch for the process lifetime,
    or the agent permanently loses every dynamic tool. ``[]`` is a legitimate
    (cacheable) result; ``None`` means "retry next time".
    """
    try:
        token = _get_token()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        client = _get_client()

        audience, contract_ids = _parse_scope()
        params = {}
        if audience:
            params["audience"] = audience
        resp = await client.get("/api/v1/meta/contracts", params=params, headers=headers)
        if resp.status_code != 200:
            print(f"[pixsim-mcp] Meta contracts returned {resp.status_code}", file=sys.stderr)
            return None
        data = resp.json()
        contracts = data.get("contracts", [])
        if contract_ids:
            contracts = [c for c in contracts if c.get("id", "") in contract_ids]
            print(f"[pixsim-mcp] Scope filter: {len(contracts)} contracts from {contract_ids}", file=sys.stderr)
        return contracts
    except Exception as e:
        print(f"[pixsim-mcp] Failed to fetch meta contracts: {e}", file=sys.stderr)
        return None


MCP_GROUPED = os.environ.get("PIXSIM_MCP_GROUPED", "1").strip() in ("1", "true", "yes")


def _build_grouped_tool(
    contract_id: str,
    contract_name: str,
    endpoints: list[dict[str, Any]],
) -> tuple[types.Tool, dict[str, dict[str, Any]]]:
    """Build a single MCP tool from all endpoints in a contract.

    Returns (Tool, routes_dict) where routes_dict maps endpoint_id to
    route metadata for the call handler.
    """
    tool_name = _sanitize_tool_fragment(contract_id)

    # Build endpoint enum and descriptions for the tool schema
    endpoint_entries = []
    routes: dict[str, dict[str, Any]] = {}
    lines = [f"{contract_name}\n\nEndpoints:"]

    for ep in endpoints:
        ep_id = ep.get("id", "")
        method = ep.get("method", "GET")
        path = ep.get("path", "")
        summary = ep.get("summary", "")

        if not ep_id or not path or not path.startswith("/"):
            continue
        availability = ep.get("availability") or {}
        if availability.get("status") == "disabled":
            continue

        endpoint_entries.append(ep_id)
        routes[ep_id] = {
            "method": method,
            "path_template": path,
            "summary": summary,
        }
        lines.append(f"- {ep_id}: {method} {path} — {summary}")

    if not endpoint_entries:
        return None, {}  # type: ignore[return-value]

    schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "endpoint": {
                "type": "string",
                "enum": endpoint_entries,
                "description": "Which endpoint to call",
            },
            "params": {
                "type": "object",
                "description": "Query parameters (for GET endpoints)",
            },
            "body": {
                "type": "object",
                "description": "Request body (for POST/PATCH endpoints)",
            },
        },
        "required": ["endpoint"],
    }

    # Add path parameter properties (union of all endpoints)
    all_path_params: set[str] = set()
    for ep_routes in routes.values():
        all_path_params.update(_path_params(ep_routes["path_template"]))
    for param in sorted(all_path_params):
        schema["properties"][param] = {
            "type": "string",
            "description": f"Path parameter: {param}",
        }

    tool = types.Tool(
        name=tool_name,
        description="\n".join(lines),
        inputSchema=schema,
    )
    return tool, routes


async def _init_tools() -> None:
    """Populate dynamic tools from meta contracts."""
    global _initialized, _contracts_cache
    if _initialized:
        return

    fetched = await _fetch_contracts()
    fetch_failed = fetched is None
    contracts = fetched or []
    _contracts_cache = contracts

    # Rebuild from scratch on every (re)attempt so a prior failed attempt's
    # escape-hatch tool isn't duplicated when we retry after a transient
    # backend outage.
    _dynamic_tools.clear()
    _dynamic_routes.clear()
    _tool_aliases.clear()
    seen_tool_names: set[str] = set()

    if MCP_GROUPED:
        # ── Grouped mode: one tool per contract ──
        for contract in contracts:
            contract_id = contract.get("id", "")
            contract_name = contract.get("name", contract_id)
            endpoints = contract.get("sub_endpoints", [])

            result = _build_grouped_tool(contract_id, contract_name, endpoints)
            if result[0] is None:
                continue
            tool, routes = result

            tool_name = tool.name
            tool_name = _unique_tool_name(tool_name, seen_tool_names)
            if tool_name != tool.name:
                tool = types.Tool(
                    name=tool_name,
                    description=tool.description,
                    inputSchema=tool.inputSchema,
                )
            seen_tool_names.add(tool_name)

            # Store routes keyed by "toolname::endpoint_id" for the call handler
            for ep_id, route in routes.items():
                _dynamic_routes[f"{tool_name}::{ep_id}"] = route

            # Also store a marker so the call handler knows this is a grouped tool
            _dynamic_routes[f"_grouped::{tool_name}"] = {"grouped": True}

            _dynamic_tools.append(tool)

            # Legacy aliases: map old fine-grained names to grouped tool
            for ep_id in routes:
                old_name = _make_tool_name(contract_id, ep_id)
                if old_name not in _tool_aliases:
                    _tool_aliases[old_name] = f"{tool_name}::{ep_id}"
                legacy = _make_legacy_tool_name(ep_id)
                if legacy not in _tool_aliases:
                    _tool_aliases[legacy] = f"{tool_name}::{ep_id}"

    else:
        # ── Fine-grained mode: one tool per endpoint (original behavior) ──
        for contract in contracts:
            contract_id = contract.get("id", "")
            for ep in contract.get("sub_endpoints", []):
                ep_id = ep.get("id", "")
                method = ep.get("method", "GET")
                path = ep.get("path", "")
                summary = ep.get("summary", "")
                availability = ep.get("availability") or {}

                if not ep_id or not path:
                    continue
                if not path.startswith("/"):
                    continue
                if availability.get("status") == "disabled":
                    continue

                base_tool_name = _make_tool_name(contract_id, ep_id)
                tool_name = _unique_tool_name(base_tool_name, seen_tool_names)
                seen_tool_names.add(tool_name)

                input_schema = ep.get("input_schema")
                if not isinstance(input_schema, dict):
                    input_schema = _build_input_schema(method, path)

                _dynamic_routes[tool_name] = {
                    "method": method,
                    "path_template": path,
                    "summary": summary,
                }
                _dynamic_tools.append(types.Tool(
                    name=tool_name,
                    description=f"[{contract_id}] {summary}" if summary else f"{method} {path}",
                    inputSchema=input_schema,
                ))

                legacy_name = _make_legacy_tool_name(ep_id)
                if (
                    legacy_name != tool_name
                    and legacy_name not in _dynamic_routes
                    and legacy_name not in _tool_aliases
                ):
                    _tool_aliases[legacy_name] = tool_name

    # Always add the generic escape hatch
    _dynamic_tools.append(types.Tool(
        name="call_api",
        description=(
            "Call any PixSim API endpoint directly. "
            "Use for endpoints not covered by the other tools."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PATCH", "DELETE"],
                    "description": "HTTP method",
                },
                "path": {
                    "type": "string",
                    "description": "API path (e.g. /api/v1/assets/123)",
                },
                "params": {"type": "object", "description": "Query parameters (for GET)"},
                "body": {"type": "object", "description": "Request body (for POST/PATCH)"},
            },
            "required": ["method", "path"],
        },
    ))

    # Only freeze the result when the fetch actually succeeded. Caching a
    # failed fetch (backend briefly unavailable during boot/restart, or a
    # 401 before the token settles) would deterministically strip every
    # dynamic tool — including the fundamental plans_management /
    # project_files core contracts — for the entire process lifetime. Leaving
    # _initialized False lets the next tools/list retry and self-heal.
    if not fetch_failed:
        _initialized = True
    else:
        print(
            "[pixsim-mcp] Contract fetch failed; serving escape hatch only "
            "and will retry on next tools/list",
            file=sys.stderr,
        )
    mode = "grouped" if MCP_GROUPED else "fine-grained"
    print(
        f"[pixsim-mcp] Loaded {len(_dynamic_tools) - 1} tools from "
        f"{len(contracts)} contracts ({mode} mode)",
        file=sys.stderr,
    )


# ── Built-in tools (not from contracts) ──────────────────────────

_LOG_WORK_TOOL = types.Tool(
    name="log_work",
    description=(
        "Record session-scoped work notes — keyed to this chat session, not "
        "to a commit or a plan.\n\n"
        "NOT for restating outcomes. The *what changed & why* belongs in the "
        "git commit message; per-checkpoint outcome + verification belongs in "
        "the plan checkpoint note (the plans progress update). Re-summarising "
        "those here just creates a third stale copy.\n\n"
        "Use this for what those channels structurally cannot hold: decisions "
        "and trade-offs, ruled-out approaches / dead-ends, blockers, and "
        "cross-session handoff — the process and negative space between "
        "commits.\n\n"
        "When plan_id+checkpoint_id is set, the checkpoint note already "
        "carries the outcome: keep `summary` to a one-line pointer and put "
        "the real content in decisions/blockers/next. Standalone (no plan, "
        "e.g. exploration or debugging) a fuller `summary` is right — it is "
        "then the only record this session's work exists at all."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": (
                    "One line. If a git commit or plan checkpoint note already "
                    "records the outcome, make this a POINTER to them (e.g. "
                    "'see commit <sha> / checkpoint <id>') — do not re-state "
                    "what changed. Only when no commit/plan anchors the work "
                    "(exploration, debugging, dead-ends) should this carry the "
                    "full narrative."
                ),
            },
            "next": {
                "type": "string",
                "description": "Cross-session handoff: what to pick up next, unfinished threads. A primary payload of this tool. Optional.",
            },
            "decisions": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Non-obvious decisions, trade-offs, and ruled-out "
                    "approaches / dead-ends (e.g. 'chose Zustand over context "
                    "because X'; 'tried Y, abandoned because Z'). A primary "
                    "payload of this tool. Boundary vs the plan checkpoint "
                    "note: a decision ABOUT advancing this checkpoint (why "
                    "this impl, what code trade-off) belongs in the checkpoint "
                    "note next to its evidence; put here only "
                    "session/workflow-level decisions or ones spanning "
                    "checkpoints — otherwise it just moves the duplication "
                    "from summary to here. Optional."
                ),
            },
            "blockers": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Blockers discovered that prevent further progress. A primary payload of this tool. Optional.",
            },
            "plan_id": {
                "type": "string",
                "description": "Plan ID to update (e.g. 'unified-task-agent-architecture'). Optional.",
            },
            "checkpoint_id": {
                "type": "string",
                "description": "Checkpoint to update progress on. Required if plan_id is provided.",
            },
            "points_delta": {
                "type": "integer",
                "description": "Points to add to checkpoint progress. Optional.",
            },
            "evidence": {
                "type": "array",
                "items": {"type": "string"},
                "description": "File paths or git commit SHAs as evidence. Optional.",
            },
            "session_id": {
                "type": "string",
                "description": "Target chat session ID. If omitted, uses the registered session.",
            },
        },
        "required": ["summary"],
    },
)

_REGISTER_SESSION_TOOL = types.Tool(
    name="register_session",
    description=(
        "Register the current CLI session with the backend so it appears "
        "in the AI Assistant's session list. Call this at the start of a "
        "session to make it trackable and resumable."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "Short label describing this session (e.g. 'refactor auth middleware')",
            },
            "session_id": {
                "type": "string",
                "description": "Optional stable ID. Defaults to a generated one if omitted.",
            },
        },
    },
)


_SET_TAB_IDENTITY_TOOL = types.Tool(
    name="set_tab_identity",
    description=(
        "Set the icon and/or subtitle of YOUR OWN chat tab — the tab this "
        "session runs in — so it self-describes what you're working on at a "
        "glance. Worth calling once you've settled on a task: when you start "
        "substantive work, claim a plan, or the focus shifts. The target tab "
        "is resolved from your token; you cannot address another tab.\n\n"
        "- icon: an @lib/icons IconName (lucide-style, e.g. 'wrench', "
        "'bug', 'sparkles', 'flask', 'clipboard', 'rocket'). Unknown names "
        "fall back to a default glyph — prefer a common, recognisable name.\n"
        "- subtitle: a short secondary line shown under the tab title "
        "(where the profile name otherwise sits). Keep it terse (≤ ~40 "
        "chars), e.g. 'refactoring auth' or 'plan: tab-identity'.\n\n"
        "Pass empty string to clear a field; omit a field to leave it "
        "untouched. Freeform and idempotent — re-call it as the work evolves."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "icon": {
                "type": "string",
                "description": "An @lib/icons IconName. Empty string clears.",
            },
            "subtitle": {
                "type": "string",
                "description": "Short secondary line under the tab title. Empty string clears.",
            },
        },
    },
)


_ASK_USER_TOOL = types.Tool(
    name="ask_user",
    description=(
        "Prompt the user for input via the assistant panel UI. "
        "Supports three interaction types: approve_deny (yes/no), "
        "choice (pick from options), and text_input (free-text). "
        "The tool blocks until the user responds. Use this when you need "
        "clarification, confirmation, or a decision from the user."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Short title for the prompt (shown as header)",
            },
            "description": {
                "type": "string",
                "description": "Detailed description or question for the user",
            },
            "interaction_type": {
                "type": "string",
                "enum": ["approve_deny", "choice", "text_input"],
                "description": "Type of interaction: approve_deny (yes/no buttons), choice (pick one option), text_input (free text field)",
                "default": "approve_deny",
            },
            "choices": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Unique choice identifier"},
                        "label": {"type": "string", "description": "Display label"},
                        "description": {"type": "string", "description": "Optional description"},
                    },
                    "required": ["id", "label"],
                },
                "description": "Available choices (only for interaction_type=choice)",
            },
            "placeholder": {
                "type": "string",
                "description": "Placeholder text for text input field (only for interaction_type=text_input)",
            },
            "timeout_s": {
                "type": "integer",
                "description": (
                    "Seconds to wait for the user before timing out (default 300, "
                    "range 10-7200). A timeout is NOT a refusal — set this higher "
                    "(e.g. 1800+) when the user may be away from the screen (mobile) "
                    "or the question can wait."
                ),
                "default": 300,
                "minimum": 10,
                "maximum": 7200,
            },
        },
        "required": ["title"],
    },
)


def _decode_token_claims(token: str) -> dict:
    """Decode JWT claims without verification."""
    if not token:
        return {}
    try:
        import base64
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return {}


def _extract_profile_from_token(token: str) -> str | None:
    """Extract profile ID from JWT claims (profile_id or legacy agent_id)."""
    claims = _decode_token_claims(token)
    return claims.get("profile_id") or claims.get("agent_id")


def _extract_chat_session_id_from_token(token: str) -> str | None:
    """Extract bound chat_session_id claim, if the token was minted for a tab."""
    val = _decode_token_claims(token).get("chat_session_id")
    return val.strip() if isinstance(val, str) and val.strip() else None


def _extract_scope_key_from_token(token: str) -> str | None:
    """Extract scope_key claim (e.g. tab:tab-XYZ or plan:foo) from a tab-bound token."""
    val = _decode_token_claims(token).get("scope_key")
    return val.strip() if isinstance(val, str) and val.strip() else None


def _normalize_profile_id(profile_id: str | None) -> str | None:
    from pixsim7.common.scope_helpers import normalize_profile_id
    return normalize_profile_id(profile_id, extra_sentinels=frozenset({"agent"}))


def _extract_agent_type(token: str) -> str:
    """Extract agent_type from JWT claims, or detect from environment.

    Detection order: token claims > CODEX_CLI env > default to claude.
    """
    from_token = _decode_token_claims(token).get("agent_type")
    if from_token and from_token not in ("agent", "unknown"):
        return from_token
    if os.environ.get("CODEX_CLI"):
        return "codex"
    return "claude"


def _identity_headers(token: str) -> dict[str, str]:
    """Auth + agent-identity headers for an API request.

    The forwarded token is not always a full agent token — bridge
    per-request tokens, the login-token fallback, and refreshed tokens
    may lack ``profile_id`` / ``run_id``. The backend recovers identity
    from the ``X-Agent-Id`` / ``X-Run-Id`` headers when the JWT claims
    are absent (RequestPrincipal.from_jwt_payload fallbacks), so always
    send them when resolvable rather than relying on the JWT alone.
    Without this, attribution collapses to agent_id='unknown'/run_id=null
    and distinct agents become indistinguishable in the participant ledger.

    Identity sources differ by transport:
      * STDIO  — identity is on the token / the ``_resolved_profile_id``
        global set during auto-registration.
      * HTTP/bridge — the token is often identity-less; identity arrives
        per-request via the ``X-Profile-Id`` / ``X-Chat-Session-Id``
        headers (set by token_manager.render_claude_mcp_http_config) and
        is held in the ``_request_profile_id`` / ``_request_session_id``
        contextvars. There is no run_id in this path at all, so the
        chat session id is used as a stable per-session run discriminator
        so distinct agents/sessions don't collapse onto one row.
    """
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    profile_id = (
        _normalize_profile_id(_extract_profile_from_token(token))
        or _normalize_profile_id(_request_profile_id.get())
        or _resolved_profile_id
    )
    if profile_id:
        headers["X-Agent-Id"] = profile_id
    run_id = _decode_token_claims(token).get("run_id")
    if not (isinstance(run_id, str) and run_id.strip()):
        # No run_id in HTTP/bridge mode — fall back to the per-request
        # chat session id so two sessions remain distinguishable.
        run_id = _request_session_id.get()
    if isinstance(run_id, str) and run_id.strip():
        headers["X-Run-Id"] = run_id.strip()
    # Tab/session binding for self-targeting tools (set_tab_identity, plan
    # claim grouping). Bridge per-request tokens carry no scope_key /
    # chat_session_id claim, so forward them from the token (STDIO agent
    # token) or the per-request contextvars (HTTP/bridge). Without this the
    # backend builds a binding-less `service` principal and self-tab
    # resolution 404s / claims can't group. See plan `tab-identity-mode`.
    scope_key = _extract_scope_key_from_token(token) or _request_scope.get()
    if isinstance(scope_key, str) and scope_key.strip():
        headers["X-Scope-Key"] = scope_key.strip()
    chat_session_id = _extract_chat_session_id_from_token(token) or _request_session_id.get()
    if isinstance(chat_session_id, str) and chat_session_id.strip():
        headers["X-Chat-Session-Id"] = chat_session_id.strip()
    return headers


_process_start = str(os.getpid())  # stable within one MCP process, differs across launches


def _derive_stable_session_id(token: str) -> str:
    """Derive a session ID unique to this MCP server process.

    Uses run_id (from agent tokens) or jti + process ID as fallback
    (for launcher tokens where jti is shared across processes).
    Within the same MCP process the ID is stable (for reconnects).
    """
    import hashlib
    claims = _decode_token_claims(token)
    unique_key = claims.get("run_id") or ""
    if not unique_key:
        # No run_id — launcher token. Use jti + PID to distinguish processes
        unique_key = f"{claims.get('jti', '')}:{_process_start}"
    profile = claims.get("profile_id") or claims.get("agent_id") or "unknown"
    raw = f"{profile}:{unique_key}"
    return f"mcp-{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


# Background heartbeat state
_heartbeat_task: asyncio.Task | None = None
_registered_session_id: str | None = None
# Profile resolved during auto-registration — used for token refresh
_resolved_profile_id: str | None = None


async def _heartbeat_loop(session_id: str, agent_type: str) -> None:
    """Send periodic heartbeats so the session shows as active in the UI."""
    while True:
        try:
            await asyncio.sleep(30)
            token = _get_token()
            if not token:
                continue
            client = _get_client()
            await client.post(
                "/api/v1/meta/agents/heartbeat",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "session_id": session_id,
                    "agent_type": agent_type,
                    "status": "active",
                    "action": "cli_session",
                    "detail": "CLI session active (MCP)",
                },
            )
        except asyncio.CancelledError:
            return
        except Exception:
            pass  # Non-fatal — retry next cycle


async def _handle_register_session(arguments: dict[str, Any]) -> list[types.TextContent]:
    """Register this CLI session with the backend and start heartbeat."""
    global _heartbeat_task, _registered_session_id, _resolved_profile_id, _bridge_session_cache
    import uuid as _uuid

    # Bridge-managed sessions: chat flow handles registration
    if os.environ.get("PIXSIM_BRIDGE_MANAGED"):
        _registered_session_id = "__bridge__"
        _bridge_session_cache.clear()
        return [types.TextContent(type="text", text="Session managed by bridge — registration skipped.")]

    token = _get_token()
    if not token:
        return [types.TextContent(type="text", text="No API token available — cannot register session.")]

    profile_id = _extract_profile_from_token(token)
    agent_type = _extract_agent_type(token)
    prev_id = _registered_session_id if _registered_session_id != "__bridge__" else None
    session_id = arguments.get("session_id") or prev_id or _derive_stable_session_id(token)
    label = arguments.get("label") or f"CLI session ({session_id[:8]})"

    result = await _proxy(
        method="POST",
        path="/api/v1/meta/agents/register-chat-session",
        body={
            "session_id": session_id,
            "engine": agent_type,
            "label": label,
            "profile_id": profile_id,
            "source": "mcp",
        },
    )

    # Capture backend-resolved profile_id for token refresh
    if result and result[0].text:
        try:
            resp_data = json.loads(result[0].text)
            resolved = resp_data.get("profile_id")
            if resolved and isinstance(resolved, str):
                _resolved_profile_id = resolved
        except (json.JSONDecodeError, IndexError):
            pass

    # Proactively refresh token if expired — register endpoint uses optional
    # auth so it never triggers the 401 self-heal in _proxy.
    import time as _t
    claims = _decode_token_claims(token)
    exp = claims.get("exp", 0)
    if exp and isinstance(exp, (int, float)) and exp < _t.time():
        refreshed = await _try_refresh_token()
        if refreshed:
            print("[pixsim-mcp] Proactive token refresh after register_session", file=sys.stderr)

    # Start background heartbeat (replaces any existing one)
    if _heartbeat_task and not _heartbeat_task.done():
        _heartbeat_task.cancel()
    _registered_session_id = session_id
    _bridge_session_cache.clear()
    _heartbeat_task = asyncio.create_task(_heartbeat_loop(session_id, agent_type))
    print(f"[pixsim-mcp] Heartbeat started for session {session_id[:8]}", file=sys.stderr)

    return result


async def _handle_set_tab_identity(arguments: dict[str, Any]) -> list[types.TextContent]:
    """Set this session's own tab icon / subtitle (plan agent-freeform-tab-identity).

    Only keys the agent actually supplied are forwarded. An empty/whitespace
    value is sent as JSON ``null`` so the backend clears that field (the UI
    then falls back to the default glyph / profile label). The target tab is
    resolved server-side from the token's ``scope_key`` / ``chat_session_id``;
    ``session_id`` is forwarded only as a last-resort resolver hint.
    """
    token = _get_token()
    if not token:
        return [types.TextContent(type="text", text="No API token available — cannot set tab identity.")]

    body: dict[str, Any] = {}
    for field in ("icon", "subtitle"):
        if field in arguments and arguments[field] is not None:
            val = str(arguments[field]).strip()
            body[field] = val or None  # "" / whitespace → explicit clear

    if not body:
        return [types.TextContent(
            type="text",
            text="Nothing to set — pass 'icon' and/or 'subtitle' (empty string clears).",
        )]

    # Last-resort resolver hint; ignored when the token carries a tab scope_key
    # or chat_session_id (the authoritative, non-spoofable binding).
    fallback = _extract_chat_session_id_from_token(token) or (
        _registered_session_id if _registered_session_id != "__bridge__" else None
    )
    if fallback:
        body["session_id"] = fallback

    result = await _proxy(
        method="POST",
        path="/api/v1/chat-tabs/self/identity",
        body=body,
    )
    # Surface a hard, actionable failure rather than a raw HTTP dump the agent
    # may gloss over: if tab resolution failed, the icon/subtitle were NOT
    # applied. The common cause is a token with no tab binding (bridge
    # per-request token). Plan `tab-identity-mode`.
    text = result[0].text if result else ""
    if text.startswith("HTTP 4") or text.startswith("HTTP 5"):
        return [types.TextContent(
            type="text",
            text=(
                "Tab identity NOT set — could not resolve this session's chat "
                "tab, so the icon/subtitle were left unchanged. This usually "
                "means the session token carries no tab binding. "
                f"(backend response: {text})"
            ),
        )]
    return result


_bridge_session_cache: dict[tuple[str | None, str | None, str | None], str] = {}


def _normalize_scope_key(scope_key: str | None) -> str | None:
    from pixsim7.common.scope_helpers import normalize_scope_value
    return normalize_scope_value(scope_key)


def _read_session_sidecar() -> str | None:
    """Read the chat session ID for the current request.

    Resolution order:
    1. Per-request contextvar (HTTP mode — set from X-Chat-Session-Id header)
    2. Per-dispatch contextvar (bridge in-process — task-scoped, no race)
    3. ``{PIXSIM_TOKEN_FILE}.session`` — STDIO mode (pool writes per-session sidecar)

    A module-global fallback used to live between (2) and (3); it was
    removed because it silently cross-attributed log_work calls to the
    most-recently-dispatched tab whenever a caller lost task context.
    """
    # HTTP mode: per-request header (cleanest path — no file I/O)
    ctx_session = _request_session_id.get()
    if ctx_session:
        return ctx_session
    # Bridge in-process dispatch (task-scoped — survives parallel dispatches)
    dispatch_ctx = _dispatch_session_ctx.get()
    if dispatch_ctx:
        return dispatch_ctx
    # STDIO fallback: per-session sidecar
    token_file = os.environ.get("PIXSIM_TOKEN_FILE", "").strip()
    if not token_file:
        return None
    sidecar = token_file + ".session"
    try:
        with open(sidecar, "r") as f:
            value = f.read().strip()
        return value if value else None
    except OSError:
        return None


async def _resolve_bridge_session_id(
    token: str,
    profile_id: str | None,
    agent_type: str,
    scope_key: str | None = None,
) -> str | None:
    """Look up the most recent active chat session for this engine/profile from the backend.

    Caches results keyed by ``(engine, profile_id, scope_key)`` — but ONLY
    when ``scope_key`` is set. Without a scope key, multiple tabs sharing
    ``(engine, profile)`` would collide on a single cache entry and the
    first-resolved session would win for all of them (cross-attribution).
    Scope-less callers pay the resolve cost on every call; that's the
    correct trade-off because they have no signal we could safely cache on.
    """
    global _bridge_session_cache
    normalized_profile_id = _normalize_profile_id(profile_id)
    normalized_engine = (agent_type or "").strip() or None
    normalized_scope_key = _normalize_scope_key(scope_key)
    cache_key = (normalized_engine, normalized_profile_id, normalized_scope_key)
    cacheable = normalized_scope_key is not None
    if cacheable:
        cached = _bridge_session_cache.get(cache_key)
        if cached:
            return cached

    def _store(resolved: str) -> str:
        if cacheable:
            _bridge_session_cache[cache_key] = resolved
        return resolved

    try:
        client = _get_client()
        params: dict[str, Any] = {"limit": 100}
        if normalized_engine:
            params["engine"] = normalized_engine
        resp = await client.get(
            "/api/v1/meta/agents/chat-sessions",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
        if resp.status_code == 200:
            sessions = [
                s for s in (resp.json().get("sessions") or [])
                if isinstance(s.get("id"), str) and s.get("id")
            ]
            if normalized_scope_key:
                scoped = [s for s in sessions if _normalize_scope_key(s.get("scope_key")) == normalized_scope_key]
                if normalized_profile_id:
                    for session in scoped:
                        if _normalize_profile_id(session.get("profile_id")) == normalized_profile_id:
                            return _store(session.get("id"))
                elif scoped:
                    return _store(scoped[0].get("id"))
                # Scope was explicitly requested but no session matches it.
                # Do NOT fall through to profile-only matching — that would
                # attribute this work to an unrelated session (cross-contamination).
                return None
            if normalized_profile_id:
                for session in sessions:
                    if _normalize_profile_id(session.get("profile_id")) == normalized_profile_id:
                        return _store(session.get("id"))
                # Avoid cross-profile leakage when no matching profile session exists.
                return None
            if sessions:
                return _store(sessions[0].get("id"))
    except Exception:
        pass
    return None


# Some upstream tool-call serializers emit log_work parameters element-style
# — `<next>…</next><decisions>[…]</decisions><evidence>[…]</evidence>` inside
# a single `<invoke>` — and the wire parser then misses the inner close and
# concatenates the trailing siblings into the first value. The outer regex
# detects that tail; the inner regex extracts each pair with a strict
# backref so `<decisions>…</evidence>` cross-mismatches don't get salvaged.
_LEAKED_TAG_TAIL_RE = re.compile(
    r"</(?:next|summary)>\s*"
    r"(?P<tail>(?:<(?:decisions|evidence|blockers)>.*?</(?:decisions|evidence|blockers)>\s*)+)"
    r"\s*(?:</invoke>)?\s*\Z",
    re.DOTALL,
)
_LEAKED_TAG_INNER_RE = re.compile(
    r"<(decisions|evidence|blockers)>(.*?)</\1>",
    re.DOTALL,
)


def _salvage_log_work_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    """Recover sibling log_work params that got slurped into `next`.

    Detects `…</next><decisions>[…]</decisions><evidence>[…]</evidence></invoke>`
    trailing on `arguments["next"]`, parses the inner JSON, and merges the
    siblings into the top-level args (existing entries first, salvaged appended,
    deduplicated). Merge — rather than skip-if-non-empty — keeps the auto-injected
    HEAD-commit alongside salvaged file paths. Returns a new dict; input is unchanged.
    """
    next_raw = arguments.get("next")
    if not isinstance(next_raw, str) or "</next>" not in next_raw:
        return dict(arguments)
    m = _LEAKED_TAG_TAIL_RE.search(next_raw)
    if not m:
        return dict(arguments)
    salvaged = dict(arguments)
    salvaged["next"] = next_raw[: m.start()].rstrip()
    for inner in _LEAKED_TAG_INNER_RE.finditer(m.group("tail")):
        key, body = inner.group(1), inner.group(2).strip()
        try:
            parsed = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            continue
        if not (isinstance(parsed, list) and all(isinstance(x, str) for x in parsed)):
            continue
        existing = salvaged.get(key) or []
        if not isinstance(existing, list):
            existing = []
        seen = set(existing)
        merged = list(existing) + [x for x in parsed if not (x in seen or seen.add(x))]
        salvaged[key] = merged
    return salvaged


async def _handle_log_work(arguments: dict[str, Any]) -> list[types.TextContent]:
    """Log a work summary to activity log and optionally update plan checkpoint."""
    arguments = _salvage_log_work_arguments(arguments)
    summary = (arguments.get("summary") or "").strip()
    if not summary:
        return [types.TextContent(type="text", text="Summary is required.")]

    token = _get_token()
    if not token:
        return [types.TextContent(type="text", text="No API token available.")]

    agent_type = _extract_agent_type(token)
    profile_id = _normalize_profile_id(_extract_profile_from_token(token))
    # Tab-bound tokens carry the calling chat session id directly — use it
    # over auto-register/bridge fallback so log_work doesn't cross-attribute
    # to another tab when multiple sessions share a profile.
    token_session_id = _extract_chat_session_id_from_token(token)
    token_scope_key = _extract_scope_key_from_token(token)
    explicit_session = (arguments.get("session_id") or "").strip() or None
    session_id = explicit_session or token_session_id or _registered_session_id or "unregistered"
    plan_id = (arguments.get("plan_id") or "").strip() or None

    # Defensive fallback: if we resolved to a stale auto-registered "mcp-*"
    # session id but the bridge has set a per-dispatch chat session, prefer
    # the dispatch id. Covers the historical bug where an MCP process ran
    # without PIXSIM_BRIDGE_MANAGED, auto-registered an mcp-{hash} row, and
    # then forever attributed work_summary entries to that orphan instead
    # of the actual chat session it was answering.
    if (
        not explicit_session
        and not token_session_id
        and isinstance(session_id, str)
        and session_id.startswith("mcp-")
    ):
        sidecar_id = _read_session_sidecar()
        if sidecar_id and not sidecar_id.startswith("mcp-"):
            session_id = sidecar_id

    # Bridge-managed: read the chat session ID from the sidecar file written
    # by the bridge pool. Falls back to API-based resolution if file is absent.
    if session_id == "__bridge__":
        sidecar_id = _read_session_sidecar()
        if sidecar_id:
            session_id = sidecar_id
        else:
            # Try the most-specific scope first, then fall back to broader hints.
            # When `plan_id` is set, look for a plan-bound MCP session (e.g. the
            # `mcp-*` rows auto-register creates with `scope_key="plan:foo"`); if
            # that misses, fall back to the token's tab scope. Real chat sessions
            # are tab-scoped — the plan_id is metadata about WHAT the work
            # concerns, not WHO ran it. Pre-2026-05 this fell straight through to
            # the `__bridge__` literal when no plan-scoped session existed, and
            # the heartbeat POST wrote that sentinel into agent_activity_log as
            # if it were a session id.
            hints: list[str] = []
            if plan_id:
                hints.append(f"plan:{plan_id}")
            if token_scope_key and token_scope_key not in hints:
                hints.append(token_scope_key)

            resolved: str | None = None
            for hint in hints:
                _bridge_session_cache.pop(
                    ((agent_type or "").strip() or None, _normalize_profile_id(profile_id), _normalize_scope_key(hint)),
                    None,
                )
                resolved = await _resolve_bridge_session_id(
                    token,
                    profile_id,
                    agent_type,
                    scope_key=hint,
                )
                if resolved:
                    break
            session_id = resolved or "__bridge__"
    checkpoint_id = (arguments.get("checkpoint_id") or "").strip() or None
    points_delta = arguments.get("points_delta") or 0
    evidence = arguments.get("evidence") or []

    # Auto-detect HEAD commit (async to avoid blocking the event loop)
    head_sha: str | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "rev-parse", "HEAD",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode == 0 and stdout:
            head_sha = stdout.decode().strip()
    except Exception:
        pass

    # Auto-add HEAD to evidence if not already present
    if head_sha and head_sha not in evidence:
        evidence = list(evidence) + [head_sha]

    next_steps = (arguments.get("next") or "").strip() or None
    decisions = arguments.get("decisions") or []
    blockers_list = arguments.get("blockers") or []

    results: list[str] = []

    # 1. Write to activity log (heartbeat endpoint with action=work_summary).
    # Refuse to write when session_id is still a sentinel ("__bridge__" /
    # "unregistered") — the heartbeat endpoint stores the value verbatim into
    # agent_activity_log.session_id, and a row whose session_id isn't a real
    # ChatSession key is just noise. Surface the failure to the caller so the
    # missing log_work is visible instead of silently mis-attributed.
    _SENTINEL_SESSION_IDS = {"__bridge__", "unregistered"}
    if session_id in _SENTINEL_SESSION_IDS:
        results.append(
            f"Activity log skipped: could not resolve a real chat session "
            f"(got sentinel '{session_id}'). "
            f"Try passing session_id= explicitly, or ensure the calling tab "
            f"is bridge-bound and its token carries a scope_key claim."
        )
    else:
        try:
            client = _get_client()
            metadata: dict[str, object] = {}
            if head_sha:
                metadata["commit"] = head_sha[:8]
            if next_steps:
                metadata["next"] = next_steps
            if decisions:
                metadata["decisions"] = decisions
            if blockers_list:
                metadata["blockers"] = blockers_list
            if evidence:
                metadata["evidence"] = evidence
            await client.post(
                "/api/v1/meta/agents/heartbeat",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "session_id": session_id,
                    "agent_type": agent_type,
                    "status": "active",
                    "action": "work_summary",
                    "detail": summary,
                    "plan_id": plan_id,
                    "metadata": metadata or None,
                },
            )
            results.append(f"Activity logged for session {session_id[:8]}")
        except Exception as e:
            results.append(f"Activity log failed: {e}")

    # 2. Update session with latest summary and plan context
    if session_id != "unregistered":
        try:
            session_update: dict[str, Any] = {
                "session_id": session_id,
                "engine": agent_type,
                "source": "mcp",
            }
            if profile_id:
                session_update["profile_id"] = profile_id
            if plan_id:
                session_update["last_plan_id"] = plan_id
                session_update["scope_key"] = f"plan:{plan_id}"
            await _proxy(
                method="POST",
                path="/api/v1/meta/agents/register-chat-session",
                body=session_update,
            )
        except Exception:
            pass

    # 3. Update plan checkpoint (if plan_id + checkpoint_id provided)
    if plan_id and checkpoint_id:
        try:
            body: dict[str, Any] = {
                "checkpoint_id": checkpoint_id,
                "note": summary,
            }
            if points_delta:
                body["points_delta"] = points_delta
            if evidence:
                body["append_evidence"] = [
                    {"kind": "git_commit" if len(e) in (7, 8, 40) and all(c in "0123456789abcdef" for c in e.lower()) else "file_path", "ref": e}
                    for e in evidence
                ]

            resp = await _proxy(
                method="POST",
                path=f"/api/v1/dev/plans/progress/{plan_id}",
                body=body,
            )
            resp_text = resp[0].text if resp else ""
            if '"checkpoint"' in resp_text or '"checkpointId"' in resp_text:
                results.append(f"Plan {plan_id} checkpoint '{checkpoint_id}' updated")
            else:
                results.append(f"Plan update response: {resp_text[:200]}")
        except Exception as e:
            results.append(f"Plan update failed: {e}")

    return [types.TextContent(type="text", text="\n".join(results))]


async def _handle_ask_user(arguments: dict[str, Any]) -> list[types.TextContent]:
    """Prompt the user via the hook server and return their response."""
    port = _get_hook_port()
    if not port:
        return [types.TextContent(type="text", text="Cannot prompt user: hook server not available. The bridge must be running with the hook server enabled.")]

    title = arguments.get("title", "Agent Question")
    description = arguments.get("description", "")
    interaction_type = arguments.get("interaction_type", "approve_deny")
    choices = arguments.get("choices")
    placeholder = arguments.get("placeholder")

    # Caller-tunable wait. Clamp to a sane range; the agent sizes this to the
    # question (long for "user may be on mobile / away", short for trivial
    # gates). The default is generous — unlike a CLI prompt the user may not be
    # looking at the panel, and a timeout here is not a refusal — so 5 min gives
    # them room to notice the nudge and answer. Agents can extend up to 2h when
    # the user is expected to be away.
    try:
        timeout_s = int(arguments.get("timeout_s", 300) or 300)
    except (TypeError, ValueError):
        timeout_s = 300
    timeout_s = max(10, min(timeout_s, 7200))

    payload: dict[str, Any] = {
        "title": title,
        "description": description,
        "interaction_type": interaction_type,
        "timeout_s": timeout_s,
    }
    if choices:
        payload["choices"] = choices
    if placeholder:
        payload["placeholder"] = placeholder

    try:
        # Keep the transport ceiling just above the server-side wait so the
        # confirm endpoint returns a clean {approved:false, timed_out:true}
        # instead of the client raising a read timeout.
        client = httpx.AsyncClient(timeout=timeout_s + 10)
        resp = await client.post(f"http://127.0.0.1:{port}/confirm", json=payload)
        await client.aclose()
        if resp.status_code == 200:
            data = resp.json()
            approved = data.get("approved", False)
            if not approved:
                if data.get("timed_out"):
                    return [types.TextContent(type="text", text=(
                        f"User did not respond within {timeout_s}s — the prompt "
                        f"timed out. This is NOT a refusal: the user may be away "
                        f"from the screen. Do not assume the answer is 'no'. "
                        f"Either proceed only if safe to do so without their "
                        f"input, or ask again (consider a larger timeout_s)."
                    ))]
                return [types.TextContent(type="text", text="User declined / cancelled the prompt.")]
            # Return the response based on interaction type
            if interaction_type == "choice":
                choice = data.get("choice", "")
                # Freeform escape hatch: the UI may let the user write a custom
                # answer instead of picking an offered option (mirrors the CLI's
                # "Other" choice). When that happens no choice id is returned —
                # surface the free text instead of an empty selection.
                if not choice and data.get("text"):
                    return [types.TextContent(type="text", text=f"User responded (custom): {data['text']}")]
                label = choice
                if choices:
                    match = next((c for c in choices if c.get("id") == choice), None)
                    if match:
                        label = match.get("label", choice)
                return [types.TextContent(type="text", text=f"User selected: {label} (id: {choice})")]
            elif interaction_type == "text_input":
                text = data.get("text", "")
                return [types.TextContent(type="text", text=f"User responded: {text}")]
            else:
                return [types.TextContent(type="text", text="User approved.")]
        return [types.TextContent(type="text", text=f"Hook server returned status {resp.status_code}")]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Failed to prompt user: {e}")]


# ── Handlers ──────────────────────────────────────────────────────


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    await _init_tools()
    all_tools = [_REGISTER_SESSION_TOOL, _LOG_WORK_TOOL, _SET_TAB_IDENTITY_TOOL, _ASK_USER_TOOL] + _dynamic_tools

    # In HTTP mode, narrow tools by the per-request scope header (X-Scope-Key:
    # a comma-separated contract-ID list naming the focus contracts). Returns
    # None when there's nothing to narrow on → full toolset.
    enabled_names = resolve_focus_filter_names(_request_scope.get(), _contracts_cache)
    if enabled_names is not None:
        return [t for t in all_tools if t.name in enabled_names]

    return all_tools


async def _signal_tool_activity(tool_name: str) -> None:
    """Fire-and-forget heartbeat on tool use — keeps session alive and visible."""
    if not _registered_session_id or _registered_session_id == "__bridge__":
        return
    token = _get_token()
    if not token:
        return
    try:
        client = _get_client()
        await client.post(
            "/api/v1/meta/agents/heartbeat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "session_id": _registered_session_id,
                "agent_type": _extract_agent_type(token),
                "status": "active",
                "action": "tool_use",
                "detail": tool_name,
            },
        )
    except Exception:
        pass


async def _auto_register_if_needed() -> None:
    """Auto-register session on first tool call if not already registered.

    Ensures every MCP session is tracked — even if the agent never
    explicitly calls register_session. Uses token claims to derive
    session ID and profile, then starts the heartbeat loop.

    The backend resolves a default profile if the token doesn't carry one.
    The resolved profile_id is captured for token refresh.

    Bridge-managed sessions (PIXSIM_TOKEN_FILE set) are skipped — the
    chat flow in ws_chat.py already creates the ChatSession record and
    the bridge sends session-level heartbeats.
    """
    global _heartbeat_task, _registered_session_id, _resolved_profile_id, _bridge_session_cache
    if _registered_session_id:
        return
    # Bridge-managed: chat flow handles ChatSession creation + bridge sends heartbeats
    if os.environ.get("PIXSIM_BRIDGE_MANAGED"):
        _registered_session_id = "__bridge__"  # prevent re-entry
        _bridge_session_cache.clear()
        return
    token = _get_token()
    if not token:
        return
    try:
        session_id = _derive_stable_session_id(token)
        profile_id = _extract_profile_from_token(token)
        agent_type = _extract_agent_type(token)
        results = await _proxy(
            method="POST",
            path="/api/v1/meta/agents/register-chat-session",
            body={
                "session_id": session_id,
                "engine": agent_type,
                "label": f"Auto-registered ({session_id[:8]})",
                "profile_id": profile_id,
                "source": "mcp-auto",
            },
        )
        _registered_session_id = session_id
        _bridge_session_cache.clear()

        # Capture the backend-resolved profile_id for token refresh
        if results and results[0].text:
            try:
                resp_data = json.loads(results[0].text)
                resolved = resp_data.get("profile_id")
                if resolved and isinstance(resolved, str):
                    _resolved_profile_id = resolved
            except (json.JSONDecodeError, IndexError):
                pass

        # Proactively refresh token if expired — the register endpoint uses
        # optional auth so it never triggers the 401 self-heal in _proxy.
        import time as _t
        claims = _decode_token_claims(token)
        exp = claims.get("exp", 0)
        if exp and isinstance(exp, (int, float)) and exp < _t.time():
            refreshed = await _try_refresh_token()
            if refreshed:
                print("[pixsim-mcp] Proactive token refresh after auto-register", file=sys.stderr)

        if not _heartbeat_task or _heartbeat_task.done():
            _heartbeat_task = asyncio.create_task(_heartbeat_loop(session_id, agent_type))
        label = f"{session_id[:8]}"
        if _resolved_profile_id:
            label += f" (profile: {_resolved_profile_id})"
        print(f"[pixsim-mcp] Auto-registered session {label}", file=sys.stderr)
    except Exception:
        pass  # Non-fatal — tool call proceeds regardless


_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _resolve_operation(name: str, arguments: dict) -> tuple[str | None, str | None]:
    """Resolve ``(http_method, endpoint_id)`` for a tool call, for approval gating.

    ``endpoint_id`` is None for non-grouped / escape-hatch tools. ``method`` is
    None when it can't be resolved — callers treat that as a write (fail safe).
    """
    if name == "call_api":
        return (str(arguments.get("method", "GET")).upper(), None)
    if _dynamic_routes.get(f"_grouped::{name}"):
        endpoint_id = arguments.get("endpoint")
        route = _dynamic_routes.get(f"{name}::{endpoint_id}") if endpoint_id else None
        method = route.get("method") if isinstance(route, dict) else None
        return (str(method).upper() if method else None, endpoint_id)
    resolved = _tool_aliases.get(name, name)
    route = _dynamic_routes.get(resolved)
    method = route.get("method") if isinstance(route, dict) else None
    endpoint_id = resolved.split("::", 1)[1] if "::" in resolved else None
    return (str(method).upper() if method else None, endpoint_id)


def _tool_needs_approval(
    tool_name: str,
    approval_set: set[str],
    *,
    method: str | None = None,
    endpoint_id: str | None = None,
) -> bool:
    """Decide whether a resolved tool call requires user approval.

    Operation-aware matching:
      * An explicit operation pin (``group::endpoint_id``, ``tool::endpoint_id``,
        or a bare ``endpoint_id``) gates exactly that operation, any method.
      * A group / tool-name entry (``assets_management`` or its legacy
        ``group__short`` form) gates only that group's WRITE operations
        (POST/PUT/PATCH/DELETE); reads pass silently. When the method can't be
        resolved we fail safe and treat the call as a write.
    """
    short = tool_name.split("__", 1)[-1] if "__" in tool_name else tool_name

    # 1. Explicit per-operation pins — surgical, any method.
    if endpoint_id:
        if approval_set & {f"{tool_name}::{endpoint_id}", f"{short}::{endpoint_id}", endpoint_id}:
            return True

    # 2. A fine-grained tool name ("group__operation") IS a single operation,
    #    so ticking it gates that operation regardless of method (like a pin).
    if "__" in tool_name and tool_name in approval_set:
        return True

    # 3. A bare group name → gate writes only; reads pass silently.
    if tool_name in approval_set or (short and short in approval_set):
        return method is None or method in _WRITE_METHODS

    return False


def _get_mcp_approval_set() -> set[str]:
    """Read the MCP approval tools list.

    Resolution order:
    1. Persisted service settings file (live — reflects launcher UI changes without restart)
    2. PIXSIM_MCP_APPROVAL_TOOLS env var (fallback — set at bridge startup)
    """
    # 1. Read from persisted settings file (data/launcher/service_settings/ai-client.json)
    try:
        from pathlib import Path as _Path
        # Derive project root from this file's location: pixsim7/client/mcp_server.py → 2 levels up
        project_root = _Path(__file__).resolve().parents[2]
        settings_file = project_root / "data" / "launcher" / "service_settings" / "ai-client.json"
        if settings_file.exists():
            data = json.loads(settings_file.read_text(encoding="utf-8"))
            tools = data.get("mcp_approval_tools", [])
            if isinstance(tools, list) and tools:
                return {str(t).strip() for t in tools if t}
    except Exception:
        pass
    # 2. Fallback to env var
    raw = MCP_APPROVAL_TOOLS.strip()
    if not raw:
        return set()
    return {t.strip() for t in raw.split(",") if t.strip()}


def _get_hook_port() -> int | None:
    """Resolve the hook server port from env var or well-known file."""
    if HOOK_PORT:
        try:
            return int(HOOK_PORT)
        except ValueError:
            pass
    try:
        from pathlib import Path
        port_file = Path.home() / ".pixsim" / "hook_port"
        if port_file.exists():
            return int(port_file.read_text().strip())
    except Exception:
        pass
    return None


async def _request_mcp_tool_approval(
    tool_name: str,
    arguments: dict,
    *,
    method: str | None = None,
    endpoint_id: str | None = None,
) -> bool:
    """Ask the bridge hook server for user approval. Returns True if approved."""
    port = _get_hook_port()
    if not port:
        return True  # no hook server — auto-approve (fail-open)

    # Name the concrete operation on the card so the user knows what they're
    # approving (e.g. "assets_management → delete_asset [DELETE]"), not just the group.
    if endpoint_id:
        op_label = f"{tool_name} → {endpoint_id}" + (f" [{method}]" if method else "")
    else:
        op_label = tool_name + (f" [{method}]" if method else "")

    try:
        client = httpx.AsyncClient(timeout=130)
        resp = await client.post(
            f"http://127.0.0.1:{port}/confirm",
            json={
                "tool_name": tool_name,
                "tool_input": arguments,
                "title": f"MCP Tool: {op_label}",
                "description": f"The agent wants to call {op_label}",
                "timeout_s": 120,
            },
        )
        await client.aclose()
        if resp.status_code == 200:
            return resp.json().get("approved", False)
        return True  # non-200 — fail-open
    except Exception as e:
        print(f"[pixsim-mcp] Approval request failed: {e}", file=sys.stderr)
        return True  # fail-open


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict[str, Any]
) -> list[types.TextContent]:
    await _init_tools()
    await _auto_register_if_needed()

    # Signal activity on every tool call (fire-and-forget)
    asyncio.ensure_future(_signal_tool_activity(name))

    # MCP tool approval gate — check if this tool requires user confirmation.
    # Operation-aware: a gated group prompts only on its WRITE operations
    # (resolved from the endpoint's HTTP method); reads pass silently. Specific
    # operations can be pinned via "group::endpoint_id". See _tool_needs_approval.
    approval_set = _get_mcp_approval_set()
    if approval_set:
        op_method, op_endpoint = _resolve_operation(name, arguments)
        if _tool_needs_approval(name, approval_set, method=op_method, endpoint_id=op_endpoint):
            approved = await _request_mcp_tool_approval(
                name, arguments, method=op_method, endpoint_id=op_endpoint
            )
            if not approved:
                return [types.TextContent(type="text", text=f"Tool call denied by user: {name}")]

    # Built-in tools
    if name == "register_session":
        return await _handle_register_session(arguments)
    if name == "log_work":
        return await _handle_log_work(arguments)
    if name == "set_tab_identity":
        return await _handle_set_tab_identity(arguments)
    if name == "ask_user":
        return await _handle_ask_user(arguments)

    # Generic escape-hatch tool
    if name == "call_api":
        return await _proxy(
            method=arguments.get("method", "GET"),
            path=arguments.get("path", ""),
            query_params=arguments.get("params"),
            body=arguments.get("body"),
        )

    # ── Grouped tool dispatch ──
    # If this tool name has a grouped marker, resolve the endpoint from the
    # "endpoint" argument and look up the route as "toolname::endpoint_id".
    if _dynamic_routes.get(f"_grouped::{name}"):
        endpoint_id = arguments.get("endpoint")
        if not endpoint_id:
            return [types.TextContent(type="text", text=f"Missing 'endpoint' parameter for grouped tool: {name}")]

        route_key = f"{name}::{endpoint_id}"
        route = _dynamic_routes.get(route_key)
        if not route:
            return [types.TextContent(type="text", text=f"Unknown endpoint '{endpoint_id}' in tool {name}")]

        method = route["method"]
        path_template = route["path_template"]

        path = path_template
        remaining = dict(arguments)
        remaining.pop("endpoint", None)
        for key in list(remaining):
            placeholder = f"{{{key}}}"
            if placeholder in path:
                path = path.replace(placeholder, str(remaining.pop(key)))

        if method == "GET":
            query = remaining.pop("params", None) or remaining or None
            return await _proxy(method="GET", path=path, query_params=query)
        else:
            body = remaining.pop("body", remaining or None)
            return await _proxy(method=method, path=path, body=body)

    # ── Fine-grained tool dispatch (original) ──
    resolved_name = _tool_aliases.get(name, name)

    # Handle aliases that point to grouped routes (e.g. "toolname::endpoint_id")
    if "::" in resolved_name:
        tool_name, endpoint_id = resolved_name.split("::", 1)
        route = _dynamic_routes.get(resolved_name)
        if not route:
            return [types.TextContent(type="text", text=f"Unknown tool: {name}")]
    else:
        route = _dynamic_routes.get(resolved_name)

    if not route:
        return [types.TextContent(type="text", text=f"Unknown tool: {name}")]

    method = route["method"]
    path_template = route["path_template"]

    # Substitute path parameters from arguments
    path = path_template
    remaining = dict(arguments)
    for key in list(remaining):
        placeholder = f"{{{key}}}"
        if placeholder in path:
            path = path.replace(placeholder, str(remaining.pop(key)))

    if method == "GET":
        query = remaining.pop("params", None) or remaining or None
        return await _proxy(method="GET", path=path, query_params=query)
    else:
        body = remaining.pop("body", remaining or None)
        return await _proxy(method=method, path=path, body=body)


# ── HTTP proxy ────────────────────────────────────────────────────

MAX_RESPONSE_CHARS = 8000

# Persistent client — reuses TCP connections across tool calls
_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(base_url=API_URL, timeout=60)
    return _http_client


def _get_expired_token_claims() -> tuple[str, dict]:
    """Read the current (possibly expired) token and decode its claims.

    For HTTP transport the expiring credential is usually forwarded per
    request (``Authorization`` header -> ``_request_token`` contextvar), so
    prefer that first. Fall back to process/file sources for STDIO mode.
    """
    req_token = _request_token.get()
    if isinstance(req_token, str) and req_token.strip():
        expired = req_token.strip()
    else:
        expired = API_TOKEN or ""
    if API_TOKEN_FILE:
        try:
            with open(API_TOKEN_FILE, "r") as f:
                expired = f.read().strip() or expired
        except OSError:
            pass
    if _refreshed_token:
        expired = _refreshed_token
    return expired, _decode_token_claims(expired)


async def _try_refresh_token() -> str | None:
    """Attempt to mint a fresh token using the user's login token.

    Strategy depends on what kind of token expired:
    - Agent token (has profile_id): mint via /dev/agent-profiles/{id}/token
    - Bridge token (purpose=bridge): use login token directly (it's already valid)
    - Unknown: try login token as-is

    Returns the new token on success, None on failure.
    """
    global _refreshed_token

    expired, claims = _get_expired_token_claims()
    purpose = claims.get("purpose", "")
    profile_id = (
        claims.get("profile_id")
        or claims.get("agent_id")
        or _normalize_profile_id(_request_profile_id.get())
        or _resolved_profile_id  # from auto-registration
    )

    login_token = _get_login_token()
    if not login_token:
        print("[pixsim-mcp] Token refresh failed: no valid login token at ~/.pixsim/token. Run 'pixsim login' to fix.", file=sys.stderr)
        return None

    new_token: str | None = None

    if profile_id:
        # Has a profile — mint a proper agent token via the profile endpoint
        new_token = await _mint_via_profile(profile_id, login_token)
    if not new_token:
        # No profile or mint failed — fall back to login token directly
        new_token = login_token

    if not new_token:
        return None

    # Persist: update in-memory cache and token file
    _refreshed_token = new_token
    if API_TOKEN_FILE:
        try:
            with open(API_TOKEN_FILE, "w") as f:
                f.write(new_token)
        except OSError:
            pass

    label = f"profile {profile_id}" if profile_id else f"purpose={purpose or 'login'}"
    print(f"[pixsim-mcp] Token refreshed ({label})", file=sys.stderr)
    return new_token


async def _mint_via_profile(profile_id: str, login_token: str) -> str | None:
    """Mint a fresh agent token via the profile endpoint."""
    try:
        client = _get_client()
        resp = await client.post(
            f"/api/v1/dev/agent-profiles/{profile_id}/token",
            params={"hours": 24},
            headers={"Authorization": f"Bearer {login_token}"},
        )
        if resp.status_code != 200:
            print(
                f"[pixsim-mcp] Profile token mint returned {resp.status_code} "
                f"for {profile_id} — self-heal will fall back to login token.",
                file=sys.stderr,
            )
            return None
        data = resp.json()
        # The endpoint (agent_profiles.mint_profile_token) responds with
        # ``AgentProfileTokenResponse(access_token=...)``. The legacy
        # ``token`` key was never emitted, so reading only ``token`` made
        # profile-based self-heal ALWAYS fail silently (it fell back to the
        # raw login token, which for agent sessions is the wrong purpose /
        # often absent) — that is the sub-24h "MCP disconnected" cause.
        # Prefer ``access_token``; keep ``token`` as a defensive fallback in
        # case the response shape ever changes again.
        return data.get("access_token") or data.get("token") or None
    except Exception as exc:
        print(f"[pixsim-mcp] Profile token mint raised: {exc}", file=sys.stderr)
        return None


async def _proxy(
    method: str,
    path: str,
    query_params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> list[types.TextContent]:
    """Proxy a request to the PixSim API and return the result.

    On 401 (expired token), attempts a self-heal: mints a fresh agent token
    using the user's login token, then retries the request once.
    """
    try:
        token = _get_token()
        headers = _identity_headers(token)
        client = _get_client()

        # A body-less write resolves to body=None, but FastAPI routes that
        # declare a required body model 422 on an absent body (e.g.
        # plans.claim / plans.release, whose only field is optional and which
        # callers reasonably omit since the MCP schema marks just `endpoint`
        # required). Send an empty object for write methods so a field-less
        # write succeeds instead of failing on a field the agent can't see.
        method_upper = method.upper()
        json_body = body
        if json_body is None and method_upper in {"POST", "PATCH", "PUT"}:
            json_body = {}

        resp = await client.request(
            method=method_upper,
            url=path,
            params=query_params,
            json=json_body,
            headers=headers,
        )

        # Self-heal on 401: try to refresh the token and retry once
        if resp.status_code == 401:
            new_token = await _try_refresh_token()
            if new_token:
                headers = _identity_headers(new_token)
                resp = await client.request(
                    method=method_upper,
                    url=path,
                    params=query_params,
                    json=json_body,
                    headers=headers,
                )

        try:
            data = resp.json()
            text = json.dumps(data, indent=2, default=str)
        except Exception:
            text = resp.text

        if resp.status_code >= 400:
            text = f"HTTP {resp.status_code}: {text}"

        if len(text) > MAX_RESPONSE_CHARS:
            text = text[:MAX_RESPONSE_CHARS] + "\n... (truncated)"

        return [types.TextContent(type="text", text=text)]

    except httpx.TimeoutException:
        return [types.TextContent(type="text", text=f"Timeout: {method} {path}")]
    except httpx.ConnectError:
        return [types.TextContent(
            type="text",
            text=f"Connection refused: {API_URL}{path} — is the backend running?",
        )]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error: {e}")]


# ── Entry point ───────────────────────────────────────────────────


main = None  # defined below — backward compat for importers


async def _main_stdio() -> None:
    """Run MCP server over STDIO (default — backward compat for direct CLI use)."""
    print(f"[pixsim-mcp] Starting STDIO — API: {API_URL}", file=sys.stderr)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


def _build_http_app(mcp_path: str = "/mcp") -> Any:
    """Build a Starlette ASGI app with StreamableHTTP transport.

    Uses ``StreamableHTTPSessionManager`` in stateless mode — each
    request is independent, no session affinity needed.

    Per-request contextvars are set from headers via ASGI middleware
    *before* the MCP handler runs, enabling dynamic tool filtering
    and per-request token resolution.

    Headers:
        Authorization: Bearer <token>
        X-Scope-Key: comma-separated contract IDs for tool filtering
        X-Chat-Session-Id: conversation session ID
        X-Profile-Id: agent profile ID
    """
    import contextlib
    from collections.abc import AsyncIterator

    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route
    from starlette.types import ASGIApp, Receive, Scope, Send
    from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

    session_manager = StreamableHTTPSessionManager(
        app=server,
        json_response=True,
        stateless=True,
    )

    @contextlib.asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncIterator[None]:
        async with session_manager.run():
            yield

    # Middleware: extract headers into contextvars before MCP handles the request
    class RequestContextMiddleware:
        def __init__(self, app: ASGIApp) -> None:
            self.app = app

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "http":
                headers = dict(scope.get("headers", []))
                # Headers arrive as bytes
                auth = (headers.get(b"authorization") or b"").decode()
                if auth.lower().startswith("bearer "):
                    _request_token.set(auth[7:].strip())
                scope_key = (headers.get(b"x-scope-key") or b"").decode().strip()
                _request_scope.set(scope_key or None)
                session_id = (headers.get(b"x-chat-session-id") or b"").decode().strip()
                _request_session_id.set(session_id or None)
                profile_id = (headers.get(b"x-profile-id") or b"").decode().strip()
                _request_profile_id.set(profile_id or None)
            await self.app(scope, receive, send)

    async def handle_health(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "transport": "http", "tools": len(_dynamic_tools)})

    async def handle_tools(request: Request) -> JSONResponse:
        """Return the list of available MCP tool names with group info."""
        await _init_tools()
        tools = []
        for t in [_REGISTER_SESSION_TOOL, _LOG_WORK_TOOL, _SET_TAB_IDENTITY_TOOL] + _dynamic_tools:
            full_name = t.name
            if "__" in full_name:
                group, short_name = full_name.split("__", 1)
            else:
                group, short_name = "built_in", full_name
            entry = {
                "name": full_name,
                "short_name": short_name,
                "group": group,
                "description": t.description or "",
            }
            # For grouped tools, expose sub-operations so callers (e.g. the
            # approval-settings UI) can gate individual endpoints, not just the
            # whole group. Each op carries its HTTP method + a write flag.
            if _dynamic_routes.get(f"_grouped::{full_name}"):
                prefix = f"{full_name}::"
                eps = []
                for key, route in _dynamic_routes.items():
                    if not key.startswith(prefix) or not isinstance(route, dict):
                        continue
                    if not route.get("path_template"):
                        continue
                    method = str(route.get("method", "GET")).upper()
                    eps.append({
                        "id": key[len(prefix):],
                        "method": method,
                        "summary": route.get("summary", ""),
                        "write": method in _WRITE_METHODS,
                    })
                entry["endpoints"] = sorted(eps, key=lambda e: (not e["write"], e["id"]))
            tools.append(entry)
        return JSONResponse({"tools": tools, "total": len(tools)})

    app = Starlette(
        routes=[
            Route("/health", handle_health, methods=["GET"]),
            Route("/tools", handle_tools, methods=["GET"]),
            Mount(mcp_path, app=session_manager.handle_request),
        ],
        middleware=[Middleware(RequestContextMiddleware)],
        lifespan=lifespan,
    )
    return app


main = _main_stdio  # backward compat


def _main_http(port: int = 9100, host: str = "127.0.0.1") -> None:
    """Run MCP server over HTTP/SSE using StreamableHTTP transport."""
    import uvicorn

    print(f"[pixsim-mcp] Starting HTTP on {host}:{port} — API: {API_URL}", file=sys.stderr)

    # Pre-init tools before serving (fetch contracts once)
    async def _pre_init():
        await _init_tools()
    asyncio.run(_pre_init())

    app = _build_http_app()
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="PixSim MCP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server instead of STDIO")
    parser.add_argument("--port", type=int, default=9100, help="HTTP port (default: 9100)")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP bind address (default: 127.0.0.1)")
    args = parser.parse_args()

    if args.http:
        _main_http(port=args.port, host=args.host)
    else:
        asyncio.run(_main_stdio())
