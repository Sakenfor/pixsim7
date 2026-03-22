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

# Codex app-server expects UTF-8 for subprocess stdio streams.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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

    # ── Built-in file tools (work locally, complement API-based tools) ──

    _dynamic_tools.append(types.Tool(
        name="read_project_file",
        description=(
            "Read a file from the project repository. Use relative paths "
            "(e.g. 'pixsim7/backend/main/services/foo.py'). "
            "Returns file content with line numbers. Max 200KB."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the project",
                },
                "offset": {
                    "type": "integer",
                    "description": "Start reading from this line number (1-based, optional)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of lines to return (optional, default 500)",
                },
            },
            "required": ["path"],
        },
    ))
    _dynamic_routes["read_project_file"] = {"builtin": True}

    _dynamic_tools.append(types.Tool(
        name="list_project_files",
        description=(
            "List files in a project directory. Use relative paths "
            "(e.g. 'pixsim7/backend/main/services/'). Returns file names with sizes."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative directory path within the project (default: root)",
                },
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to filter files (e.g. '*.py', '**/*.ts')",
                },
            },
        },
    ))
    _dynamic_routes["list_project_files"] = {"builtin": True}

    _dynamic_tools.append(types.Tool(
        name="search_project_files",
        description=(
            "Search for text/regex patterns in project files. "
            "Returns matching lines with file paths and line numbers."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Text or regex pattern to search for",
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in (default: project root)",
                },
                "glob": {
                    "type": "string",
                    "description": "File glob to filter (e.g. '*.py', '*.ts')",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of matches to return (default 50)",
                },
            },
            "required": ["pattern"],
        },
    ))
    _dynamic_routes["search_project_files"] = {"builtin": True}

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


@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    # PixSim MCP currently exposes tools only.
    return []


@server.list_resource_templates()
async def handle_list_resource_templates() -> list[types.ResourceTemplate]:
    # PixSim MCP currently exposes tools only.
    return []


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict[str, Any]
) -> list[types.TextContent]:
    await _init_tools()

    # ── Built-in file tools ──
    if name == "read_project_file":
        return _builtin_read_file(arguments)
    if name == "list_project_files":
        return _builtin_list_files(arguments)
    if name == "search_project_files":
        return _builtin_search_files(arguments)

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


# ── Built-in file tool implementations ─────────────────────────────

_PROJECT_ROOT: str | None = None
_MAX_FILE_SIZE = 200_000  # 200KB
_SENSITIVE_PATTERNS = {".env", "credentials", "secret", ".key", ".pem", "id_rsa"}


def _get_project_root() -> str:
    """Resolve project root — walk up from this file to find the repo root."""
    global _PROJECT_ROOT
    if _PROJECT_ROOT:
        return _PROJECT_ROOT
    from pathlib import Path
    # Walk up from mcp_server.py → client/ → pixsim7/ → repo root
    candidate = Path(__file__).resolve().parent.parent.parent
    # Verify it looks like a repo root
    if (candidate / ".git").exists() or (candidate / "pixsim7").exists():
        _PROJECT_ROOT = str(candidate)
    else:
        _PROJECT_ROOT = str(Path.cwd())
    return _PROJECT_ROOT


def _safe_resolve(relative_path: str) -> str | None:
    """Resolve a relative path safely within the project root. Returns None if unsafe."""
    from pathlib import Path
    root = Path(_get_project_root())
    try:
        resolved = (root / relative_path).resolve()
        # Must stay within project root
        if not str(resolved).startswith(str(root)):
            return None
        # Block sensitive files
        name_lower = resolved.name.lower()
        for pattern in _SENSITIVE_PATTERNS:
            if pattern in name_lower:
                return None
        return str(resolved)
    except (ValueError, OSError):
        return None


def _builtin_read_file(args: dict) -> list[types.TextContent]:
    """Read a file from the project with line numbers."""
    from pathlib import Path
    rel_path = args.get("path", "")
    if not rel_path:
        return [types.TextContent(type="text", text="Error: 'path' is required")]

    resolved = _safe_resolve(rel_path)
    if not resolved:
        return [types.TextContent(type="text", text=f"Error: path '{rel_path}' is outside project or blocked")]

    p = Path(resolved)
    if not p.exists():
        return [types.TextContent(type="text", text=f"Error: file not found: {rel_path}")]
    if not p.is_file():
        return [types.TextContent(type="text", text=f"Error: not a file: {rel_path}")]
    if p.stat().st_size > _MAX_FILE_SIZE:
        return [types.TextContent(type="text", text=f"Error: file too large ({p.stat().st_size:,} bytes, max {_MAX_FILE_SIZE:,})")]

    offset = max(1, args.get("offset", 1))
    limit = min(2000, args.get("limit", 500))

    try:
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        selected = lines[offset - 1 : offset - 1 + limit]
        numbered = [f"{offset + i:>5}\t{line}" for i, line in enumerate(selected)]
        header = f"# {rel_path} ({len(lines)} lines total, showing {offset}-{offset + len(selected) - 1})"
        return [types.TextContent(type="text", text=header + "\n" + "\n".join(numbered))]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error reading file: {e}")]


def _builtin_list_files(args: dict) -> list[types.TextContent]:
    """List files in a project directory."""
    from pathlib import Path
    import fnmatch

    rel_path = args.get("path", "")
    pattern = args.get("pattern", "")
    root = Path(_get_project_root())
    target = root / rel_path if rel_path else root

    resolved = _safe_resolve(rel_path) if rel_path else str(root)
    if not resolved:
        return [types.TextContent(type="text", text=f"Error: path '{rel_path}' is outside project")]

    target = Path(resolved)
    if not target.exists():
        return [types.TextContent(type="text", text=f"Error: directory not found: {rel_path}")]
    if not target.is_dir():
        return [types.TextContent(type="text", text=f"Error: not a directory: {rel_path}")]

    try:
        if pattern and "**" in pattern:
            entries = sorted(target.glob(pattern))
        elif pattern:
            entries = sorted(target.glob(pattern))
        else:
            entries = sorted(target.iterdir())

        lines = []
        for entry in entries[:200]:
            rel = entry.relative_to(root)
            if entry.is_dir():
                lines.append(f"  {rel}/")
            else:
                size = entry.stat().st_size
                if size > 1_000_000:
                    size_str = f"{size / 1_000_000:.1f}MB"
                elif size > 1000:
                    size_str = f"{size / 1000:.0f}KB"
                else:
                    size_str = f"{size}B"
                lines.append(f"  {rel}  ({size_str})")

        header = f"# {rel_path or '.'} — {len(lines)} entries"
        if len(entries) > 200:
            header += f" (showing first 200 of {len(entries)})"
        return [types.TextContent(type="text", text=header + "\n" + "\n".join(lines))]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error: {e}")]


def _builtin_search_files(args: dict) -> list[types.TextContent]:
    """Search for a pattern in project files."""
    from pathlib import Path
    import re as _re

    search_pattern = args.get("pattern", "")
    if not search_pattern:
        return [types.TextContent(type="text", text="Error: 'pattern' is required")]

    rel_path = args.get("path", "")
    file_glob = args.get("glob", "")
    max_results = min(200, args.get("max_results", 50))
    root = Path(_get_project_root())

    search_dir = Path(_safe_resolve(rel_path) or str(root)) if rel_path else root
    if not search_dir.is_dir():
        return [types.TextContent(type="text", text=f"Error: directory not found: {rel_path}")]

    try:
        regex = _re.compile(search_pattern, _re.IGNORECASE)
    except _re.error as e:
        return [types.TextContent(type="text", text=f"Error: invalid regex: {e}")]

    # Skip directories and binary files
    skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next"}
    text_extensions = {
        ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
        ".toml", ".md", ".txt", ".css", ".html", ".sql", ".sh", ".cfg",
    }

    matches: list[str] = []

    def walk(directory: Path, depth: int = 0) -> None:
        if depth > 10 or len(matches) >= max_results:
            return
        try:
            for entry in sorted(directory.iterdir()):
                if len(matches) >= max_results:
                    return
                if entry.is_dir():
                    if entry.name not in skip_dirs:
                        walk(entry, depth + 1)
                elif entry.is_file():
                    if file_glob and not entry.match(file_glob):
                        continue
                    if not file_glob and entry.suffix.lower() not in text_extensions:
                        continue
                    if entry.stat().st_size > _MAX_FILE_SIZE:
                        continue
                    try:
                        content = entry.read_text(encoding="utf-8", errors="replace")
                        for line_no, line in enumerate(content.splitlines(), 1):
                            if regex.search(line):
                                rel = entry.relative_to(root)
                                matches.append(f"{rel}:{line_no}: {line.strip()[:150]}")
                                if len(matches) >= max_results:
                                    return
                    except (OSError, UnicodeDecodeError):
                        continue
        except PermissionError:
            pass

    walk(search_dir)

    if not matches:
        return [types.TextContent(type="text", text=f"No matches found for '{search_pattern}'")]

    header = f"# {len(matches)} match{'es' if len(matches) != 1 else ''} for '{search_pattern}'"
    if len(matches) >= max_results:
        header += f" (limited to {max_results})"
    return [types.TextContent(type="text", text=header + "\n" + "\n".join(matches))]


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
            text=f"Connection refused: {API_URL}{path} - is the backend running?",
        )]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error: {e}")]


# ── Entry point ───────────────────────────────────────────────────


async def main() -> None:
    print(f"[pixsim-mcp] Starting - API: {API_URL}", file=sys.stderr)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
