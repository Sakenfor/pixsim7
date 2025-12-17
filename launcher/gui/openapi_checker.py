"""
OpenAPI Freshness Checker

Checks if generated TypeScript types are up-to-date with the live OpenAPI schema.
Used by the launcher GUI to show freshness status on service cards.
"""
import hashlib
import json
import os
import re
from enum import Enum
from typing import Optional, Tuple
from dataclasses import dataclass

try:
    from .config import ROOT
except ImportError:
    from config import ROOT


class OpenAPIStatus(Enum):
    """OpenAPI types freshness status."""
    FRESH = "fresh"        # Types match live schema
    STALE = "stale"        # Types differ from live schema
    UNAVAILABLE = "unavailable"  # Can't check (service down, no types file, etc.)
    NO_OPENAPI = "no_openapi"    # Service doesn't expose OpenAPI


@dataclass
class OpenAPICheckResult:
    """Result of an OpenAPI freshness check."""
    status: OpenAPIStatus
    message: str = ""
    live_hash: Optional[str] = None
    file_hash: Optional[str] = None


def _compute_schema_hash(schema_json: str) -> str:
    """Compute a stable hash of an OpenAPI schema.

    Normalizes the JSON to ensure consistent hashing regardless of
    formatting differences.
    """
    try:
        # Parse and re-serialize to normalize formatting
        parsed = json.loads(schema_json)
        normalized = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:16]
    except json.JSONDecodeError:
        # Fall back to raw hash if not valid JSON
        return hashlib.sha256(schema_json.encode('utf-8')).hexdigest()[:16]


def _extract_schema_from_generated(types_content: str) -> Optional[str]:
    """Extract the embedded schema hash or compute from the generated types.

    The openapi-typescript generator includes the source URL and we can
    use the content itself for comparison since it's deterministically
    generated from the schema.
    """
    # Compute hash of the generated content (excluding comments that may vary)
    # Strip the header comment block and hash the rest
    lines = types_content.split('\n')
    content_lines = []
    in_header = True
    for line in lines:
        if in_header and (line.startswith('/**') or line.startswith(' *') or line.startswith(' */')):
            continue
        if in_header and not line.strip():
            continue
        in_header = False
        content_lines.append(line)

    content = '\n'.join(content_lines)
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]


def check_openapi_freshness(
    openapi_url: str,
    types_path: str,
    timeout: float = 2.0
) -> OpenAPICheckResult:
    """Check if generated types are fresh compared to live OpenAPI schema.

    Args:
        openapi_url: URL to fetch OpenAPI JSON (e.g., http://localhost:8000/openapi.json)
        types_path: Path to generated types file (relative to ROOT)
        timeout: HTTP request timeout in seconds

    Returns:
        OpenAPICheckResult with status and details
    """
    import urllib.request
    import urllib.error

    # Resolve types path
    abs_types_path = os.path.join(ROOT, types_path) if not os.path.isabs(types_path) else types_path

    # Check if types file exists
    if not os.path.exists(abs_types_path):
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Types file not found: {types_path}"
        )

    # Read and hash the types file
    try:
        with open(abs_types_path, 'r', encoding='utf-8') as f:
            types_content = f.read()
        file_hash = _extract_schema_from_generated(types_content)
    except Exception as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to read types file: {e}"
        )

    # Fetch live OpenAPI schema
    try:
        req = urllib.request.Request(openapi_url, method='GET')
        req.add_header('Accept', 'application/json')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            live_schema = response.read().decode('utf-8')
    except urllib.error.URLError as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to fetch schema: {e.reason}",
            file_hash=file_hash
        )
    except Exception as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to fetch schema: {e}",
            file_hash=file_hash
        )

    # Hash the live schema
    live_hash = _compute_schema_hash(live_schema)

    # To properly compare, we need to regenerate the types and compare.
    # Since that's expensive, we use a simpler heuristic:
    # - Store the schema hash in a cache file alongside the types
    # - Compare current schema hash with cached hash

    cache_path = abs_types_path + '.schema-hash'
    cached_hash = None

    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                cached_hash = f.read().strip()
        except Exception:
            pass

    if cached_hash == live_hash:
        return OpenAPICheckResult(
            status=OpenAPIStatus.FRESH,
            message="Types are up-to-date",
            live_hash=live_hash,
            file_hash=file_hash
        )
    elif cached_hash is None:
        # No cache - can't determine freshness without regenerating
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message="No schema cache - run 'pnpm openapi:gen' to establish baseline",
            live_hash=live_hash,
            file_hash=file_hash
        )
    else:
        return OpenAPICheckResult(
            status=OpenAPIStatus.STALE,
            message="Schema has changed - run 'pnpm openapi:gen' to update",
            live_hash=live_hash,
            file_hash=file_hash
        )


def update_schema_cache(openapi_url: str, types_path: str, timeout: float = 2.0) -> bool:
    """Update the schema hash cache after regenerating types.

    Call this after running 'pnpm openapi:gen' to update the cached hash.

    Returns:
        True if cache was updated successfully
    """
    import urllib.request

    abs_types_path = os.path.join(ROOT, types_path) if not os.path.isabs(types_path) else types_path
    cache_path = abs_types_path + '.schema-hash'

    try:
        req = urllib.request.Request(openapi_url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            live_schema = response.read().decode('utf-8')

        live_hash = _compute_schema_hash(live_schema)

        with open(cache_path, 'w') as f:
            f.write(live_hash)

        return True
    except Exception:
        return False
