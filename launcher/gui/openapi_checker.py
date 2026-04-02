"""
OpenAPI Freshness Checker

Checks if generated TypeScript types are up-to-date with the live OpenAPI schema.
Used by the launcher GUI to show freshness status on service cards.

Delegates to `pnpm openapi:check` for actual freshness verification.
"""
import os
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from typing import Optional

try:
    from .config import ROOT, service_env
except ImportError:
    from config import ROOT, service_env


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


def _resolve_types_dir(types_path: str) -> str:
    return os.path.join(ROOT, types_path) if not os.path.isabs(types_path) else types_path


def _probe_openapi_url(openapi_url: str, timeout: float) -> Optional[OpenAPICheckResult]:
    """Pre-flight OpenAPI endpoint availability before running pnpm check."""
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(openapi_url, method='GET')
        req.add_header('Accept', 'application/json')
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status != 200:
                return OpenAPICheckResult(
                    status=OpenAPIStatus.UNAVAILABLE,
                    message=f"OpenAPI endpoint returned status {response.status}",
                )
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return OpenAPICheckResult(
                status=OpenAPIStatus.NO_OPENAPI,
                message="Service does not expose OpenAPI at the configured endpoint",
            )
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to fetch schema: HTTP {e.code}",
        )
    except urllib.error.URLError as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to fetch schema: {e.reason}",
        )
    except Exception as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to fetch schema: {e}",
        )

    return None


def _run_openapi_check(openapi_url: str, types_dir: str, timeout: float) -> tuple[int, str]:
    pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    env = service_env()
    env['OPENAPI_URL'] = openapi_url
    env['OPENAPI_TYPES_OUT'] = types_dir
    env['OPENAPI_ORVAL_OUT'] = types_dir

    # openapi:check runs Orval + directory comparison, so allow longer than HTTP probe.
    process_timeout = max(10.0, timeout * 10.0)
    proc = subprocess.run(
        [pnpm_cmd, "-s", "openapi:check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
        timeout=process_timeout,
    )
    output = "\n".join(part for part in [proc.stdout.strip(), proc.stderr.strip()] if part).strip()
    return proc.returncode, output


def _is_stale_output(output: str) -> bool:
    if not output:
        return False

    lowered = output.lower()
    markers = (
        "[stale]",
        "is stale",
        "run `pnpm openapi:gen`",
        "run 'pnpm openapi:gen'",
        "content mismatch",
        "file count mismatch",
        "file list mismatch",
        "output directory does not exist",
    )
    return any(marker in lowered for marker in markers)


def check_openapi_freshness(
    openapi_url: str,
    types_path: str,
    timeout: float = 2.0
) -> OpenAPICheckResult:
    """Check if generated types are fresh compared to live OpenAPI schema.

    Uses `pnpm openapi:check` with service-specific environment variables so
    status matches the same logic used by the CLI and CI checks.

    Args:
        openapi_url: URL to fetch OpenAPI JSON (e.g., http://localhost:8000/openapi.json)
        types_path: Path to generated Orval output directory (relative to ROOT)
        timeout: HTTP request timeout in seconds

    Returns:
        OpenAPICheckResult with status and details
    """
    abs_types_dir = _resolve_types_dir(types_path)

    # Distinguish "service unavailable" from stale output before running pnpm.
    probe_failure = _probe_openapi_url(openapi_url, timeout=timeout)
    if probe_failure is not None:
        return probe_failure

    try:
        code, output = _run_openapi_check(openapi_url, abs_types_dir, timeout=timeout)
    except FileNotFoundError:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message="pnpm is not available in PATH",
        )
    except subprocess.TimeoutExpired:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message="openapi:check timed out",
        )
    except Exception as e:
        return OpenAPICheckResult(
            status=OpenAPIStatus.UNAVAILABLE,
            message=f"Failed to run openapi:check: {e}",
        )

    if code == 0:
        return OpenAPICheckResult(
            status=OpenAPIStatus.FRESH,
            message="Types are up-to-date",
        )

    if _is_stale_output(output):
        return OpenAPICheckResult(
            status=OpenAPIStatus.STALE,
            message="Schema/types are out of date - run 'pnpm openapi:gen'",
        )

    details = output.splitlines()[0] if output else f"openapi:check exited with code {code}"
    return OpenAPICheckResult(
        status=OpenAPIStatus.UNAVAILABLE,
        message=f"openapi:check failed: {details}",
    )


def update_schema_cache(openapi_url: str, types_path: str, timeout: float = 2.0) -> bool:
    """Deprecated no-op kept for backward compatibility with launcher callers."""
    _ = (openapi_url, types_path, timeout)
    return True
