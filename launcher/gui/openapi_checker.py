"""
OpenAPI Freshness Checker

Checks if generated TypeScript types are up-to-date with the live OpenAPI schema.
Used by the launcher GUI to show freshness status on service cards.

Delegates to `pnpm openapi:check` for actual freshness verification.
"""
import hashlib
import json
import os
import subprocess
import sys
from enum import Enum
from typing import Optional
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
    """Compute a stable hash of an OpenAPI schema."""
    try:
        parsed = json.loads(schema_json)
        normalized = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:16]
    except json.JSONDecodeError:
        return hashlib.sha256(schema_json.encode('utf-8')).hexdigest()[:16]


def check_openapi_freshness(
    openapi_url: str,
    types_path: str,
    timeout: float = 2.0
) -> OpenAPICheckResult:
    """Check if generated types are fresh compared to live OpenAPI schema.

    Uses the Orval model directory for checking. The types_path should point
    to packages/shared/api/client/src/generated/openapi or similar.

    Args:
        openapi_url: URL to fetch OpenAPI JSON (e.g., http://localhost:8000/openapi.json)
        types_path: Path to generated Orval output directory (relative to ROOT)
        timeout: HTTP request timeout in seconds

    Returns:
        OpenAPICheckResult with status and details
    """
    import urllib.request
    import urllib.error

    # Resolve types path — check the model barrel file
    abs_types_dir = os.path.join(ROOT, types_path) if not os.path.isabs(types_path) else types_path
    model_barrel = os.path.join(abs_types_dir, 'model', 'index.ts')

    if not os.path.exists(model_barrel):
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Model barrel not found: {model_barrel}"
        )

    # Compute hash of existing model barrel as file_hash
    try:
        with open(model_barrel, 'r', encoding='utf-8') as f:
            barrel_content = f.read()
        file_hash = hashlib.sha256(barrel_content.encode('utf-8')).hexdigest()[:16]
    except Exception as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to read model barrel: {e}"
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

    live_hash = _compute_schema_hash(live_schema)

    # Check schema hash cache
    cache_path = os.path.join(abs_types_dir, '.schema-hash')
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

    abs_types_dir = os.path.join(ROOT, types_path) if not os.path.isabs(types_path) else types_path
    cache_path = os.path.join(abs_types_dir, '.schema-hash')

    try:
        req = urllib.request.Request(openapi_url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            live_schema = response.read().decode('utf-8')

        live_hash = _compute_schema_hash(live_schema)

        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'w') as f:
            f.write(live_hash)

        return True
    except Exception:
        return False
