"""Helpers for reporting test/eval run results to the DB.

Eval harnesses call ``report_run()`` at the end of execution to persist
structured results that the UI can display.

Usage (async context with DB session)::

    from pixsim7.backend.main.services.testing.report import report_run

    run = await report_run(
        db=db,
        suite_id="block-evals",
        status="pass",
        started_at=start_time,
        finished_at=end_time,
        summary={
            "total": 42,
            "passed": 40,
            "failed": 2,
            "metrics": {"precision_at_1": 0.95, "coverage": 0.88},
            "failures": [{"test": "entry-12", "reason": "wrong block matched"}],
        },
    )

Usage (standalone script without existing DB session)::

    from pixsim7.backend.main.services.testing.report import report_run_standalone
    import asyncio

    asyncio.run(report_run_standalone(
        suite_id="block-evals",
        status="pass",
        started_at=start_time,
        summary={"total": 42, "passed": 42, "failed": 0},
    ))
"""

from __future__ import annotations

import platform
import subprocess
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import TestRunRecord


async def report_run(
    db: AsyncSession,
    *,
    suite_id: str,
    status: str,
    started_at: datetime,
    finished_at: Optional[datetime] = None,
    duration_ms: Optional[int] = None,
    summary: Optional[Dict[str, Any]] = None,
    environment: Optional[Dict[str, Any]] = None,
    auto_environment: bool = True,
) -> TestRunRecord:
    """Create a test run record in the DB.

    Args:
        db: Async DB session.
        suite_id: Must match a ``test_suites.id`` (run sync first).
        status: ``pass``, ``fail``, or ``error``.
        started_at: When the run began.
        finished_at: When the run ended (optional).
        duration_ms: Explicit duration. Auto-computed from timestamps if omitted.
        summary: Flexible dict — counts, metrics, failure details.
        environment: Explicit env dict. If ``auto_environment`` is True, merged
            with auto-detected values (git sha, python version).
        auto_environment: Whether to auto-detect git sha and python version.

    Returns:
        The persisted ``TestRunRecord``.
    """
    if duration_ms is None and finished_at and started_at:
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

    env = {}
    if auto_environment:
        env = _detect_environment()
    if environment:
        env.update(environment)

    run = TestRunRecord(
        suite_id=suite_id,
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=duration_ms,
        summary=summary or {},
        environment=env or None,
    )
    db.add(run)
    await db.flush()
    return run


async def report_run_standalone(
    *,
    suite_id: str,
    status: str,
    started_at: datetime,
    finished_at: Optional[datetime] = None,
    duration_ms: Optional[int] = None,
    summary: Optional[Dict[str, Any]] = None,
    environment: Optional[Dict[str, Any]] = None,
) -> TestRunRecord:
    """Report a run from a standalone script (creates its own DB session).

    Convenience wrapper for eval harnesses that don't have an existing session.
    """
    from pixsim7.backend.main.infrastructure.database.session import get_async_session

    async with get_async_session() as db:
        run = await report_run(
            db,
            suite_id=suite_id,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            summary=summary,
            environment=environment,
        )
        await db.commit()
        await db.refresh(run)
        return run


def _detect_environment() -> Dict[str, Any]:
    """Auto-detect git sha and python version."""
    env: Dict[str, Any] = {
        "python_version": platform.python_version(),
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
