"""Applied-state ledger for one-shot data backfills.

``record_backfill_applied`` is the canonical write into the ``backfill_applied``
table. A ``tools/backfill_*.py`` script calls it once, after a successful
``--apply``, so the record exists regardless of how the script was launched —
the diagnostics runner, an agent's plain ``Bash`` call, or a human at a
terminal. That path-independence is the whole point: ``diagnostic_runs`` only
sees runner-launched runs (and includes dry-runs), so it can't answer "has this
backfill actually been applied?". This table can.

Actor resolution mirrors the runner's ``principal.source`` shape
(``agent:<id>`` / ``user:<id>``): the runner can hand the script an actor via
``$PIXSIM_BACKFILL_ACTOR``; absent that we fall back to ``cli:<os-user>``.

Every write is best-effort: a ledger hiccup (missing table before the migration
runs, DB down) must never fail the backfill it's recording.
"""

from __future__ import annotations

import getpass
import hashlib
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

from pixsim7.backend.main.shared.path_registry import get_path_registry

logger = logging.getLogger(__name__)

# Env var the diagnostics runner (or any launcher) can set to attribute an
# apply to a specific principal, using the same shape as run ``started_by``.
ACTOR_ENV_VAR = "PIXSIM_BACKFILL_ACTOR"


def resolve_actor(explicit: Optional[str] = None) -> str:
    """Actor string for an apply: explicit arg, else env, else ``cli:<os-user>``."""
    if explicit:
        return explicit
    env_actor = os.environ.get(ACTOR_ENV_VAR)
    if env_actor:
        return env_actor
    try:
        user = getpass.getuser()
    except Exception:  # noqa: BLE001 — getuser can raise if no login name
        user = "unknown"
    return f"cli:{user}"


def _repo_relative(script_path: str | Path) -> str:
    """Repo-relative posix path, matching diagnostics script-discovery keys."""
    p = Path(script_path)
    try:
        repo_root = get_path_registry().repo_root
        return p.resolve().relative_to(repo_root).as_posix()
    except Exception:  # noqa: BLE001 — path may be outside repo / registry unset
        return p.name


def _git_sha() -> Optional[str]:
    """Current repo HEAD sha, or None if git is unavailable."""
    try:
        repo_root = get_path_registry().repo_root
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0:
            return out.stdout.strip() or None
    except Exception:  # noqa: BLE001 — git missing / not a repo / timeout
        pass
    return None


def _script_sha256(script_path: str | Path) -> Optional[str]:
    """sha256 of the script file contents, or None if unreadable."""
    try:
        return hashlib.sha256(Path(script_path).read_bytes()).hexdigest()
    except Exception:  # noqa: BLE001 — file moved / unreadable
        return None


async def record_backfill_applied(
    script_path: str | Path,
    *,
    rows_affected: Optional[int] = None,
    actor: Optional[str] = None,
    notes: Optional[str] = None,
) -> None:
    """Append one row to ``backfill_applied`` for a successful ``--apply``.

    Pass ``__file__`` as ``script_path``. Best-effort: logs and returns on any
    failure so it never breaks the backfill it records.
    """
    rel_path = _repo_relative(script_path)
    try:
        from pixsim7.backend.main.domain.diagnostics import BackfillApplied
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        async with get_async_session() as session:
            session.add(
                BackfillApplied(
                    script_path=rel_path,
                    git_sha=_git_sha(),
                    script_sha256=_script_sha256(script_path),
                    applied_by=resolve_actor(actor),
                    rows_affected=rows_affected,
                    notes=notes,
                )
            )
            await session.commit()
        logger.info("backfill_applied recorded: %s (rows=%s)", rel_path, rows_affected)
    except Exception:
        logger.warning("backfill_applied record failed for %s", rel_path, exc_info=True)


async def list_backfill_status(session) -> list[dict]:
    """Per-script applied status for the diagnostics surface.

    Joins the *current* discovery of applyable scripts (``has_apply``) with the
    ledger, so the surface lists ALL known backfills — including never-applied
    ones — not just those that happen to have a row. ``current_version_applied``
    compares the last applied ``script_sha256`` against the file's current hash,
    distinguishing "applied current version" from "applied an older one".
    """
    from sqlalchemy import desc, select

    from pixsim7.backend.main.domain.diagnostics import BackfillApplied

    from .shell_script import get_discovery  # lazy: avoid import cycle

    backfills = [m for m in get_discovery().scripts if m.has_apply]
    paths = [m.path for m in backfills]

    rows_by_path: dict[str, list] = {}
    if paths:
        rows = (
            await session.execute(
                select(BackfillApplied)
                .where(BackfillApplied.script_path.in_(paths))
                .order_by(desc(BackfillApplied.applied_at))
            )
        ).scalars().all()
        for r in rows:
            rows_by_path.setdefault(r.script_path, []).append(r)

    repo_root = get_path_registry().repo_root
    out: list[dict] = []
    for m in backfills:
        history = rows_by_path.get(m.path, [])
        latest = history[0] if history else None  # ordered applied_at desc
        current_sha = _script_sha256(repo_root / m.path)
        out.append(
            {
                "script_path": m.path,
                "summary": m.summary,
                "applied_count": len(history),
                "last_applied_at": latest.applied_at.isoformat() if latest else None,
                "last_applied_by": latest.applied_by if latest else None,
                "last_rows_affected": latest.rows_affected if latest else None,
                "last_git_sha": latest.git_sha if latest else None,
                "current_version_applied": bool(
                    latest
                    and latest.script_sha256
                    and current_sha
                    and latest.script_sha256 == current_sha
                ),
            }
        )
    out.sort(key=lambda d: d["script_path"])
    return out
