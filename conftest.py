"""Root conftest — pytest auto-submission plugin.

Automatically submits test run results to the pixsim backend after each
pytest session.  Each test file that defines a ``TEST_SUITE`` dict gets
its own run record with per-suite pass/fail counts.

Configuration (environment variables):
    PIXSIM_TEST_SUBMIT=1        Enable auto-submission (off by default)
    PIXSIM_API_URL              Backend base URL (default: http://localhost:8000)
    PIXSIM_API_TOKEN            Bearer token for auth (optional in debug mode)

How it works:
    1. pytest_collect_modifyitems: scans collected items for TEST_SUITE metadata
    2. pytest_runtest_makereport: tracks pass/fail/error per suite
    3. pytest_sessionfinish: POSTs results to /api/v1/dev/testing/runs
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import time
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ── Configuration ──────────────────────────────────────────────────

def _is_enabled() -> bool:
    return os.environ.get("PIXSIM_TEST_SUBMIT", "").strip() in ("1", "true", "yes")


def _api_base() -> str:
    return os.environ.get("PIXSIM_API_URL", "http://localhost:8000").rstrip("/")


def _api_token() -> str:
    return os.environ.get("PIXSIM_API_TOKEN", "")


# ── Per-suite result tracking ──────────────────────────────────────

@dataclass
class SuiteResult:
    suite_id: str
    label: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)


# Module-level state (populated during collection + test execution)
_suite_for_item: dict[str, str] = {}        # nodeid -> suite_id
_suite_results: dict[str, SuiteResult] = {}  # suite_id -> SuiteResult
_session_start: float = 0.0


# ── Hooks ──────────────────────────────────────────────────────────

def pytest_configure(config):
    """Register the plugin marker."""
    config.addinivalue_line(
        "markers",
        "auto_submit: automatically submit results to pixsim backend",
    )


def pytest_collection_modifyitems(config, items):
    """Scan collected test items for TEST_SUITE metadata."""
    global _session_start
    _session_start = time.time()

    if not _is_enabled():
        return

    seen_modules: set[str] = set()

    for item in items:
        module = item.module
        if module is None:
            continue
        mod_name = module.__name__
        if mod_name in seen_modules:
            # Already processed — just map item to suite
            suite_meta = getattr(module, "TEST_SUITE", None)
            if isinstance(suite_meta, dict) and suite_meta.get("id"):
                _suite_for_item[item.nodeid] = suite_meta["id"]
            continue

        seen_modules.add(mod_name)
        suite_meta = getattr(module, "TEST_SUITE", None)
        if not isinstance(suite_meta, dict):
            continue
        suite_id = suite_meta.get("id", "")
        if not suite_id:
            continue

        if suite_id not in _suite_results:
            _suite_results[suite_id] = SuiteResult(
                suite_id=suite_id,
                label=suite_meta.get("label", suite_id),
            )
        _suite_for_item[item.nodeid] = suite_id


def pytest_runtest_makereport(item, call):
    """Track pass/fail/error per suite after each test phase."""
    if not _is_enabled():
        return

    # Only count the "call" phase (not setup/teardown)
    if call.when != "call":
        return

    suite_id = _suite_for_item.get(item.nodeid)
    if not suite_id or suite_id not in _suite_results:
        return

    result = _suite_results[suite_id]
    result.total += 1

    if call.excinfo is None:
        result.passed += 1
    elif call.excinfo.typename == "Skipped":
        result.skipped += 1
    else:
        # Distinguish assertion failures from unexpected errors
        if call.excinfo.typename in ("AssertionError", "AssertionError", "Failed"):
            result.failed += 1
        else:
            result.errors += 1
            result.failed += 1  # count errors as failures for status

        result.failures.append({
            "test": item.nodeid,
            "error": call.excinfo.typename,
            "message": str(call.excinfo.value)[:300],
        })


def pytest_sessionfinish(session, exitstatus):
    """Submit per-suite results to the backend API."""
    if not _is_enabled():
        return
    if not _suite_results:
        return

    session_end = time.time()
    duration_ms = int((session_end - _session_start) * 1000)
    now = datetime.now(timezone.utc)
    started_at = datetime.fromtimestamp(_session_start, tz=timezone.utc)

    env = _detect_environment()
    api_base = _api_base()
    token = _api_token()
    url = f"{api_base}/api/v1/dev/testing/runs"

    # Ensure suites are synced first (best-effort)
    _trigger_sync(api_base, token)

    submitted = 0
    db_fallback_queue: list[dict] = []

    for suite_id, result in _suite_results.items():
        if result.total == 0:
            continue

        status = "pass" if result.failed == 0 and result.errors == 0 else "fail"

        run_data = {
            "suite_id": suite_id,
            "status": status,
            "started_at": started_at,
            "finished_at": now,
            "duration_ms": duration_ms,
            "summary": {
                "total": result.total,
                "passed": result.passed,
                "failed": result.failed,
                "errors": result.errors,
                "skipped": result.skipped,
                "failures": result.failures[:20],  # cap to avoid huge payloads
            },
            "environment": env,
        }

        # Try HTTP API first
        http_payload = {
            **run_data,
            "started_at": started_at.isoformat(),
            "finished_at": now.isoformat(),
        }
        try:
            _post_json(url, http_payload, token)
            submitted += 1
        except Exception:
            db_fallback_queue.append(run_data)

    # Batch fallback to direct DB write for any that failed HTTP
    if db_fallback_queue:
        try:
            ok, fail = _submit_batch_via_db(db_fallback_queue, sync_first=True)
            submitted += ok
        except Exception as e:
            print(f"\n[pixsim] DB fallback failed: {e}")

    if submitted:
        print(f"\n[pixsim] Submitted {submitted} test run(s) to {api_base}")


# ── Helpers ────────────────────────────────────────────────────────

def _detect_environment() -> dict[str, Any]:
    env: dict[str, Any] = {
        "python_version": platform.python_version(),
        "platform": platform.system(),
    }
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).decode().strip()
        if sha:
            env["git_sha"] = sha
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return env


def _submit_batch_via_db(runs: list[dict], sync_first: bool = False) -> tuple[int, int]:
    """Fallback: write directly to DB when HTTP API is unavailable.

    Args:
        runs: List of run dicts to submit.
        sync_first: If True, sync test suites to DB before submitting runs.

    Returns (submitted, failed) counts.
    """
    import asyncio

    async def _do():
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from pixsim7.backend.main.services.testing.report import report_run

        ok = 0
        fail = 0
        async with get_async_session() as db:
            if sync_first:
                try:
                    from pixsim7.backend.main.services.testing.sync import sync_test_suites
                    await sync_test_suites(db)
                    await db.commit()
                except Exception:
                    await db.rollback()

            for run in runs:
                try:
                    await report_run(
                        db,
                        suite_id=run["suite_id"],
                        status=run["status"],
                        started_at=run["started_at"],
                        finished_at=run["finished_at"],
                        duration_ms=run["duration_ms"],
                        summary=run["summary"],
                        environment=run["environment"],
                    )
                    ok += 1
                except Exception as e:
                    await db.rollback()
                    fail += 1
                    print(f"\n[pixsim] DB submit failed for '{run['suite_id']}': {e}")
            if ok:
                await db.commit()
        return ok, fail

    return asyncio.run(_do())


def _trigger_sync(api_base: str, token: str) -> None:
    """Best-effort trigger of test suite sync so suite_ids exist in DB."""
    try:
        url = f"{api_base}/api/v1/dev/testing/sync"
        _post_json(url, {}, token)
    except Exception:
        pass  # sync failure is non-fatal


def _post_json(url: str, data: dict, token: str) -> dict:
    """POST JSON to the API and return parsed response."""
    body = json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8")[:200]
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {error_body}") from None
