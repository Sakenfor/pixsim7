from __future__ import annotations

from datetime import timedelta, timezone
from pathlib import Path
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.docs.models import PlanRegistry, PlanSyncRun
from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.docs import plan_sync
from pixsim7.backend.main.services.docs.plans import PlanEntry
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_plan_sync_{uuid4().hex}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            mapped_conn = await conn.execution_options(schema_translate_map={"dev_meta": schema})
            await mapped_conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[PlanSyncRun.__table__, PlanRegistry.__table__, EntityAudit.__table__],
                )
            )

            session = AsyncSession(
                bind=mapped_conn,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
            try:
                yield session
            finally:
                await session.close()
        finally:
            if outer_tx.is_active:
                await outer_tx.rollback()

    await engine.dispose()


def _entry(plan_id: str, *, status: str = "active", scope: str = "active") -> PlanEntry:
    return PlanEntry(
        id=plan_id,
        title=f"Plan {plan_id}",
        status=status,
        stage="execution",
        owner="docs lane",
        last_updated="2026-03-13",
        priority="normal",
        summary="",
        plan_path=f"docs/plans/{scope}/{plan_id}/plan.md",
        code_paths=[],
        companions=[],
        handoffs=[],
        tags=[],
        depends_on=[],
        scope=scope,
        markdown="# Plan",
    )


@pytest.mark.asyncio
async def test_sync_restores_removed_plan_even_when_manifest_hash_matches(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = PlanRegistry(
        id="restore-plan",
        title="Restore Plan",
        status="removed",
        stage="execution",
        owner="docs lane",
        revision=4,
        priority="normal",
        summary="",
        scope="active",
        code_paths=[],
        companions=[],
        handoffs=[],
        tags=[],
        depends_on=[],
        manifest_hash="same-hash",
    )
    db_session.add(row)
    await db_session.commit()

    monkeypatch.setattr(
        plan_sync,
        "build_plans_index",
        lambda: {"entries": {"restore-plan": _entry("restore-plan")}, "errors": []},
    )
    monkeypatch.setattr(plan_sync, "_find_manifest_path", lambda _pid, _scope: Path("manifest.yaml"))
    monkeypatch.setattr(plan_sync, "compute_manifest_hash", lambda _path: "same-hash")

    result = await plan_sync.sync_plans(db_session)
    updated = await db_session.get(PlanRegistry, "restore-plan")

    assert updated is not None
    assert result.run_id is not None
    assert result.updated == 1
    assert result.changed_fields.get("status") == 1
    assert result.duration_ms is not None
    assert updated.status == "active"
    assert updated.revision == 5

    events = (
        await db_session.execute(
            select(EntityAudit)
            .where(EntityAudit.entity_id == "restore-plan", EntityAudit.domain == "plan")
            .order_by(EntityAudit.timestamp.asc())
        )
    ).scalars().all()
    status_changes = [ev for ev in events if ev.action == "field_changed" and ev.field == "status"]
    assert status_changes
    assert status_changes[-1].old_value == "removed"
    assert status_changes[-1].new_value == "active"

    sync_run_id = (status_changes[-1].extra or {}).get("sync_run_id")
    assert sync_run_id is not None


@pytest.mark.asyncio
async def test_sync_removed_event_uses_previous_status(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = PlanRegistry(
        id="remove-plan",
        title="Remove Plan",
        status="active",
        stage="execution",
        owner="docs lane",
        revision=2,
        priority="normal",
        summary="",
        scope="active",
        code_paths=[],
        companions=[],
        handoffs=[],
        tags=[],
        depends_on=[],
        manifest_hash="old-hash",
    )
    db_session.add(row)
    await db_session.commit()

    monkeypatch.setattr(plan_sync, "build_plans_index", lambda: {"entries": {}, "errors": []})

    result = await plan_sync.sync_plans(db_session)
    updated = await db_session.get(PlanRegistry, "remove-plan")

    assert updated is not None
    assert result.removed == 1
    assert updated.status == "removed"
    assert updated.revision == 3

    events = (
        await db_session.execute(
            select(EntityAudit)
            .where(EntityAudit.entity_id == "remove-plan", EntityAudit.domain == "plan")
            .order_by(EntityAudit.timestamp.desc())
        )
    ).scalars().all()
    assert events
    assert events[0].action == "status_changed"
    assert events[0].old_value == "active"
    assert events[0].new_value == "removed"

    runs = (await db_session.execute(select(PlanSyncRun))).scalars().all()
    assert len(runs) == 1
    assert runs[0].status == "success"
    assert runs[0].duration_ms is not None
    assert (runs[0].changed_fields or {}).get("status") == 1


@pytest.mark.asyncio
async def test_sync_aborts_when_manifest_loader_reports_errors(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = PlanRegistry(
        id="stable-plan",
        title="Stable Plan",
        status="active",
        stage="execution",
        owner="docs lane",
        revision=1,
        priority="normal",
        summary="",
        scope="active",
        code_paths=[],
        companions=[],
        handoffs=[],
        tags=[],
        depends_on=[],
        manifest_hash="hash",
    )
    db_session.add(row)
    await db_session.commit()

    monkeypatch.setattr(
        plan_sync,
        "build_plans_index",
        lambda: {"entries": {}, "errors": ["broken manifest"]},
    )

    with pytest.raises(ValueError, match="contains errors"):
        await plan_sync.sync_plans(db_session)

    unchanged = await db_session.get(PlanRegistry, "stable-plan")
    assert unchanged is not None
    assert unchanged.status == "active"

    events = (await db_session.execute(select(EntityAudit))).scalars().all()
    assert events == []

    runs = (await db_session.execute(select(PlanSyncRun))).scalars().all()
    assert len(runs) == 1
    assert runs[0].status == "failed"
    assert runs[0].error_message
    assert runs[0].duration_ms is not None


@pytest.mark.asyncio
async def test_sync_raises_when_advisory_lock_is_not_available(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(plan_sync, "build_plans_index", lambda: {"entries": {}, "errors": []})

    async def _raise_lock_error(_db: AsyncSession) -> None:
        raise plan_sync.PlanSyncLockedError("A plan sync is already in progress.")

    monkeypatch.setattr(plan_sync, "_acquire_sync_lock", _raise_lock_error)

    with pytest.raises(plan_sync.PlanSyncLockedError):
        await plan_sync.sync_plans(db_session)


@pytest.mark.asyncio
async def test_prune_plan_sync_history_dry_run_then_delete(
    db_session: AsyncSession,
) -> None:
    now = plan_sync.utcnow()
    old_ts = now - timedelta(days=120)
    recent_ts = now - timedelta(days=5)

    old_run = PlanSyncRun(
        status="success",
        started_at=old_ts,
        finished_at=old_ts,
        duration_ms=250,
    )
    recent_run = PlanSyncRun(
        status="success",
        started_at=recent_ts,
        finished_at=recent_ts,
        duration_ms=100,
    )
    db_session.add(old_run)
    db_session.add(recent_run)
    await db_session.flush()

    db_session.add(
        PlanRegistry(
            id="retention-plan",
            title="Retention Plan",
            status="active",
            stage="execution",
            owner="docs lane",
            revision=1,
            priority="normal",
            summary="",
            scope="active",
            code_paths=[],
            companions=[],
            handoffs=[],
            tags=[],
            depends_on=[],
            manifest_hash="hash",
        )
    )
    await db_session.flush()

    db_session.add(
        EntityAudit(
            domain="plan",
            entity_type="plan_registry",
            entity_id="retention-plan",
            action="field_changed",
            field="status",
            old_value="proposed",
            new_value="execution",
            actor="system",
            extra={"sync_run_id": str(old_run.id)},
            timestamp=old_ts,
        )
    )
    db_session.add(
        EntityAudit(
            domain="plan",
            entity_type="plan_registry",
            entity_id="retention-plan",
            action="field_changed",
            field="owner",
            old_value="a",
            new_value="b",
            actor="system",
            extra={"sync_run_id": str(recent_run.id)},
            timestamp=recent_ts,
        )
    )
    await db_session.commit()

    dry_run = await plan_sync.prune_plan_sync_history(
        db_session,
        retention_days=90,
        dry_run=True,
    )
    assert dry_run.dry_run is True
    assert dry_run.events_deleted == 1
    assert dry_run.runs_deleted == 1

    event_count_before = (
        await db_session.execute(select(func.count()).select_from(EntityAudit))
    ).scalar_one()
    run_count_before = (
        await db_session.execute(select(func.count()).select_from(PlanSyncRun))
    ).scalar_one()
    assert event_count_before == 2
    assert run_count_before == 2

    applied = await plan_sync.prune_plan_sync_history(
        db_session,
        retention_days=90,
        dry_run=False,
    )
    assert applied.dry_run is False
    assert applied.events_deleted == 1
    assert applied.runs_deleted == 1

    event_count_after = (
        await db_session.execute(select(func.count()).select_from(EntityAudit))
    ).scalar_one()
    run_count_after = (
        await db_session.execute(select(func.count()).select_from(PlanSyncRun))
    ).scalar_one()
    assert event_count_after == 1
    assert run_count_after == 1

    remaining_runs = (await db_session.execute(select(PlanSyncRun))).scalars().all()
    assert len(remaining_runs) == 1
    remaining_ts = remaining_runs[0].started_at
    assert remaining_ts is not None
    assert remaining_ts.replace(tzinfo=timezone.utc) >= recent_ts.replace(tzinfo=timezone.utc)
