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
import json
import os
import re
import sys
from typing import Any

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
API_SCOPE = os.environ.get("PIXSIM_SCOPE", "")  # "user" or "dev"; empty = all


def _get_token() -> str:
    """Read the freshest token.

    Priority: per-request token file > env var > ~/.pixsim/token
    """
    # 1. Per-request token file (written by bridge before each task)
    if API_TOKEN_FILE:
        try:
            with open(API_TOKEN_FILE, "r") as f:
                token = f.read().strip()
                if token:
                    return token
        except OSError:
            pass
    # 2. Env var (set at MCP server startup)
    if API_TOKEN:
        return API_TOKEN
    # 3. Persistent login token (~/.pixsim/token)
    try:
        from pathlib import Path
        stored = Path.home() / ".pixsim" / "token"
        token = stored.read_text().strip()
        if token:
            return token
    except (OSError, FileNotFoundError):
        pass
    return ""

server = Server("pixsim")


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


async def _fetch_contracts() -> list[dict]:
    """Fetch contracts from meta API. Returns empty list on failure."""
    try:
        token = _get_token()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        client = _get_client()

        params = {}
        if API_SCOPE:
            params["audience"] = API_SCOPE
        resp = await client.get("/api/v1/meta/contracts", params=params, headers=headers)
        if resp.status_code != 200:
            print(f"[pixsim-mcp] Meta contracts returned {resp.status_code}", file=sys.stderr)
            return []
        data = resp.json()
        return data.get("contracts", [])
    except Exception as e:
        print(f"[pixsim-mcp] Failed to fetch meta contracts: {e}", file=sys.stderr)
        return []


async def _init_tools() -> None:
    """Populate dynamic tools from meta contracts."""
    global _initialized
    if _initialized:
        return

    contracts = await _fetch_contracts()
    seen_tool_names: set[str] = set()

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

            # Skip non-API paths (e.g. filesystem references)
            if not path.startswith("/"):
                continue

            # Skip endpoints explicitly marked disabled in runtime metadata.
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

            # Backward-compat alias for previously endpoint-only names.
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

    _initialized = True
    print(
        f"[pixsim-mcp] Loaded {len(_dynamic_routes)} tools from "
        f"{len(contracts)} contracts",
        file=sys.stderr,
    )


# ── Handlers ──────────────────────────────────────────────────────


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    await _init_tools()
    return _dynamic_tools


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict[str, Any]
) -> list[types.TextContent]:
    await _init_tools()

    # Generic escape-hatch tool
    if name == "call_api":
        return await _proxy(
            method=arguments.get("method", "GET"),
            path=arguments.get("path", ""),
            query_params=arguments.get("params"),
            body=arguments.get("body"),
        )

    resolved_name = _tool_aliases.get(name, name)
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


async def _proxy(
    method: str,
    path: str,
    query_params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> list[types.TextContent]:
    """Proxy a request to the PixSim API and return the result."""
    try:
        token = _get_token()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        client = _get_client()

        resp = await client.request(
            method=method.upper(),
            url=path,
            params=query_params,
            json=body,
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


async def main() -> None:
    print(f"[pixsim-mcp] Starting — API: {API_URL}", file=sys.stderr)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
