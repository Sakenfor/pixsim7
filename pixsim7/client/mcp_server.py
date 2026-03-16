"""
MCP stdio server — thin proxy between Claude CLI and PixSim API.

Spawned by Claude CLI via --mcp-config. Exposes PixSim API endpoints
as MCP tools so Claude can query assets, generations, characters, etc.

The tool list is static (matching the user.assistant meta contract)
with a generic call_api escape hatch for any endpoint.
"""
from __future__ import annotations

import asyncio
import json
import os
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

server = Server("pixsim")


# ── Tool definitions (mirrors user.assistant contract endpoints) ──

TOOLS: list[types.Tool] = [
    types.Tool(
        name="list_assets",
        description="Browse and search user assets",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search query text"},
                "media_type": {
                    "type": "string",
                    "enum": ["image", "video"],
                    "description": "Filter by media type",
                },
                "limit": {"type": "integer", "description": "Max results (default 50)"},
                "offset": {"type": "integer", "description": "Pagination offset"},
            },
        },
    ),
    types.Tool(
        name="analyze_asset",
        description="Run AI analysis on a specific asset",
        inputSchema={
            "type": "object",
            "properties": {
                "asset_id": {"type": "integer", "description": "Asset ID to analyze"},
            },
            "required": ["asset_id"],
        },
    ),
    types.Tool(
        name="list_generations",
        description="List generations with status and type filters",
        inputSchema={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "running", "completed", "failed", "cancelled"],
                    "description": "Filter by generation status",
                },
                "operation_type": {"type": "string", "description": "Filter by operation type"},
                "limit": {"type": "integer", "description": "Max results (default 50)"},
                "offset": {"type": "integer", "description": "Pagination offset"},
            },
        },
    ),
    types.Tool(
        name="create_generation",
        description="Create a new image or video generation",
        inputSchema={
            "type": "object",
            "properties": {
                "body": {"type": "object", "description": "Full generation request body"},
            },
            "required": ["body"],
        },
    ),
    types.Tool(
        name="list_prompt_families",
        description="Browse prompt families for authoring",
        inputSchema={
            "type": "object",
            "properties": {
                "prompt_type": {"type": "string", "description": "Filter by prompt type"},
                "category": {"type": "string", "description": "Filter by category"},
                "is_active": {"type": "boolean", "description": "Active only (default true)"},
                "limit": {"type": "integer", "description": "Max results"},
                "offset": {"type": "integer", "description": "Pagination offset"},
            },
        },
    ),
    types.Tool(
        name="list_scenes",
        description="List available game scenes",
        inputSchema={"type": "object", "properties": {}},
    ),
    types.Tool(
        name="list_characters",
        description="List characters with optional filters",
        inputSchema={
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filter by character category"},
                "species": {"type": "string", "description": "Filter by species"},
                "limit": {"type": "integer", "description": "Max results"},
                "offset": {"type": "integer", "description": "Pagination offset"},
            },
        },
    ),
    # ── Plan management tools ──
    types.Tool(
        name="get_plan_context",
        description=(
            "Get AI agent work context: current assignment, all active plans, "
            "and available API actions. Start here for plan work."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "plan_id": {"type": "string", "description": "Request a specific plan (optional, auto-assigns if omitted)"},
            },
        },
    ),
    types.Tool(
        name="create_plan",
        description="Create a new plan with Document + PlanRegistry. Use parent_id for sub-plans.",
        inputSchema={
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Unique plan ID slug"},
                "title": {"type": "string", "description": "Plan title"},
                "summary": {"type": "string", "description": "Brief summary"},
                "markdown": {"type": "string", "description": "Full plan content (markdown)"},
                "plan_type": {
                    "type": "string",
                    "enum": ["feature", "bugfix", "refactor", "exploration", "task", "proposal"],
                    "description": "Plan type (default: feature)",
                },
                "status": {"type": "string", "enum": ["active", "parked", "done", "blocked"], "description": "Initial status"},
                "stage": {"type": "string", "description": "Free-form stage label"},
                "owner": {"type": "string", "description": "Owner / lane"},
                "priority": {"type": "string", "enum": ["high", "normal", "low"], "description": "Priority"},
                "parent_id": {"type": "string", "description": "Parent plan ID for sub-plans"},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags"},
                "code_paths": {"type": "array", "items": {"type": "string"}, "description": "Relevant code paths"},
            },
            "required": ["id", "title"],
        },
    ),
    types.Tool(
        name="list_plans",
        description="List all plans, optionally filtered by status or owner",
        inputSchema={
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["active", "parked", "done", "blocked"], "description": "Filter by status"},
                "owner": {"type": "string", "description": "Filter by owner (substring match)"},
            },
        },
    ),
    types.Tool(
        name="get_plan",
        description="Get full plan detail with markdown, checkpoints, children",
        inputSchema={
            "type": "object",
            "properties": {
                "plan_id": {"type": "string", "description": "Plan ID"},
            },
            "required": ["plan_id"],
        },
    ),
    types.Tool(
        name="update_plan",
        description="Update plan fields: status, stage, owner, priority, summary, markdown",
        inputSchema={
            "type": "object",
            "properties": {
                "plan_id": {"type": "string", "description": "Plan ID to update"},
                "status": {"type": "string", "enum": ["active", "parked", "done", "blocked"]},
                "stage": {"type": "string", "description": "Free-form stage label"},
                "owner": {"type": "string"},
                "priority": {"type": "string", "enum": ["high", "normal", "low"]},
                "summary": {"type": "string"},
            },
            "required": ["plan_id"],
        },
    ),
    # ── Generic escape hatch ──
    types.Tool(
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
    ),
]

# Route table: tool name → (HTTP method, path template)
ROUTES: dict[str, tuple[str, str]] = {
    "list_assets": ("GET", "/api/v1/assets"),
    "analyze_asset": ("POST", "/api/v1/assets/{asset_id}/analyze"),
    "list_generations": ("GET", "/api/v1/generations"),
    "create_generation": ("POST", "/api/v1/generations"),
    "list_prompt_families": ("GET", "/api/v1/prompts/families"),
    "list_scenes": ("GET", "/api/v1/game/scenes"),
    "list_characters": ("GET", "/api/v1/characters"),
    # Plans
    "get_plan_context": ("GET", "/api/v1/dev/plans/agent-context"),
    "create_plan": ("POST", "/api/v1/dev/plans"),
    "list_plans": ("GET", "/api/v1/dev/plans"),
    "get_plan": ("GET", "/api/v1/dev/plans/{plan_id}"),
    "update_plan": ("PATCH", "/api/v1/dev/plans/update/{plan_id}"),
}


# ── Handlers ──────────────────────────────────────────────────────


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return TOOLS


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict[str, Any]
) -> list[types.TextContent]:
    # Generic escape-hatch tool
    if name == "call_api":
        return await _proxy(
            method=arguments.get("method", "GET"),
            path=arguments.get("path", ""),
            query_params=arguments.get("params"),
            body=arguments.get("body"),
        )

    route = ROUTES.get(name)
    if not route:
        return [types.TextContent(type="text", text=f"Unknown tool: {name}")]

    method, path_template = route

    # Substitute path parameters (e.g. {asset_id}) from arguments
    path = path_template
    remaining = dict(arguments)
    for key in list(remaining):
        placeholder = f"{{{key}}}"
        if placeholder in path:
            path = path.replace(placeholder, str(remaining.pop(key)))

    if method == "GET":
        return await _proxy(method="GET", path=path, query_params=remaining or None)
    else:
        body = remaining.pop("body", remaining or None)
        return await _proxy(method=method, path=path, body=body)


# ── HTTP proxy ────────────────────────────────────────────────────

MAX_RESPONSE_CHARS = 8000


async def _proxy(
    method: str,
    path: str,
    query_params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> list[types.TextContent]:
    """Proxy a request to the PixSim API and return the result."""
    try:
        headers = {}
        if API_TOKEN:
            headers["Authorization"] = f"Bearer {API_TOKEN}"

        async with httpx.AsyncClient(base_url=API_URL, timeout=60, headers=headers) as client:
            resp = await client.request(
                method=method.upper(),
                url=path,
                params=query_params,
                json=body,
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
