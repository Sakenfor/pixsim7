"""Tests for the backfill applied-ledger helper + surface.

Unit tests cover the pure pieces (actor resolution, path normalization, content
hashing, best-effort error swallowing). DB tests run against a throwaway schema
(``ledger_session``) and cover the write path and the per-script status reduce
(latest-wins, applied_count, current_version_applied).
"""
from __future__ import annotations

import hashlib
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from pixsim7.backend.main.domain.diagnostics import BackfillApplied
from pixsim7.backend.main.services.diagnostics import applied_ledger as al
from pixsim7.backend.main.services.diagnostics import shell_script as ss
from pixsim7.backend.main.services.diagnostics.applied_ledger import (
    list_backfill_status,
    record_backfill_applied,
    resolve_actor,
)
from pixsim7.backend.main.shared.path_registry import get_path_registry

TEST_SUITE = {
    "id": "diagnostics-applied-ledger",
    "label": "Backfill Applied-Ledger",
    "kind": "integration",
    "category": "backend/services",
    "subcategory": "diagnostics",
    "covers": ["pixsim7/backend/main/services/diagnostics/applied_ledger.py"],
    "order": 25,
}


# ── resolve_actor: explicit > env > cli:<os-user> ────────────────────────────


def test_resolve_actor_explicit_wins(monkeypatch) -> None:
    monkeypatch.setenv("PIXSIM_BACKFILL_ACTOR", "agent:env")
    assert resolve_actor("user:explicit") == "user:explicit"


def test_resolve_actor_env_over_cli(monkeypatch) -> None:
    monkeypatch.setenv("PIXSIM_BACKFILL_ACTOR", "agent:env")
    assert resolve_actor() == "agent:env"


def test_resolve_actor_cli_fallback(monkeypatch) -> None:
    monkeypatch.delenv("PIXSIM_BACKFILL_ACTOR", raising=False)
    monkeypatch.setattr(al.getpass, "getuser", lambda: "tester")
    assert resolve_actor() == "cli:tester"


# ── path normalization + content hash ────────────────────────────────────────


def test_repo_relative_inside_repo_is_posix() -> None:
    rel = al._repo_relative(__file__)
    assert rel.endswith("test_applied_ledger.py")
    assert "\\" not in rel  # always posix, even on Windows


def test_repo_relative_outside_repo_falls_back_to_name(tmp_path) -> None:
    p = tmp_path / "loose_script.py"
    p.write_text("x = 1\n")
    assert al._repo_relative(p) == "loose_script.py"


def test_script_sha256_matches_hashlib(tmp_path) -> None:
    p = tmp_path / "s.py"
    body = b"print('hi')\n"
    p.write_bytes(body)
    assert al._script_sha256(p) == hashlib.sha256(body).hexdigest()


def test_script_sha256_missing_returns_none(tmp_path) -> None:
    assert al._script_sha256(tmp_path / "nope.py") is None


# ── record_backfill_applied: best-effort + write path ────────────────────────


@pytest.mark.asyncio
async def test_record_backfill_applied_swallows_db_errors(monkeypatch) -> None:
    # A ledger hiccup must never fail the backfill it records.
    from pixsim7.backend.main.infrastructure.database import session as session_mod

    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(session_mod, "get_async_session", boom)
    # Should not raise.
    await record_backfill_applied("tools/backfill_x.py", rows_affected=1)


@pytest.mark.asyncio
async def test_record_backfill_applied_writes_row(monkeypatch, ledger_session) -> None:
    from pixsim7.backend.main.infrastructure.database import session as session_mod

    @asynccontextmanager
    async def fake_session():
        yield ledger_session

    monkeypatch.setattr(session_mod, "get_async_session", fake_session)
    monkeypatch.setenv("PIXSIM_BACKFILL_ACTOR", "agent:tester")

    await record_backfill_applied(
        "tools/backfill_source_hash_match.py", rows_affected=7, notes="unit"
    )

    rows = (await ledger_session.execute(select(BackfillApplied))).scalars().all()
    assert len(rows) == 1
    r = rows[0]
    assert r.script_path == "tools/backfill_source_hash_match.py"
    assert r.applied_by == "agent:tester"
    assert r.rows_affected == 7
    assert r.notes == "unit"
    assert r.script_sha256  # hashed from the real file on disk


# ── list_backfill_status: discovery × ledger reduce ──────────────────────────


@pytest.mark.asyncio
async def test_list_backfill_status_never_applied(ledger_session) -> None:
    items = await list_backfill_status(ledger_session)
    assert items, "expected discovery to surface applyable backfill scripts"
    for it in items:
        assert it["applied_count"] == 0
        assert it["last_applied_at"] is None
        assert it["current_version_applied"] is False


@pytest.mark.asyncio
async def test_list_backfill_status_latest_wins_and_current_version(ledger_session) -> None:
    target = next(m.path for m in ss.get_discovery().scripts if m.has_apply)
    current_sha = al._script_sha256(get_path_registry().repo_root / target)
    assert current_sha  # sanity: the script exists

    ledger_session.add_all(
        [
            BackfillApplied(
                script_path=target,
                applied_by="cli:older",
                rows_affected=1,
                script_sha256="stale",
                applied_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
            ),
            BackfillApplied(
                script_path=target,
                applied_by="agent:newer",
                rows_affected=9,
                script_sha256=current_sha,
                applied_at=datetime(2021, 1, 1, tzinfo=timezone.utc),
            ),
        ]
    )
    await ledger_session.commit()

    row = next(
        it for it in await list_backfill_status(ledger_session) if it["script_path"] == target
    )
    assert row["applied_count"] == 2
    assert row["last_applied_by"] == "agent:newer"  # most-recent applied_at wins
    assert row["last_rows_affected"] == 9
    assert row["current_version_applied"] is True  # newest hash == current file


@pytest.mark.asyncio
async def test_list_backfill_status_stale_version_is_false(ledger_session) -> None:
    target = next(m.path for m in ss.get_discovery().scripts if m.has_apply)
    ledger_session.add(
        BackfillApplied(script_path=target, applied_by="cli:x", script_sha256="deadbeef")
    )
    await ledger_session.commit()

    row = next(
        it for it in await list_backfill_status(ledger_session) if it["script_path"] == target
    )
    assert row["applied_count"] == 1
    assert row["current_version_applied"] is False
