"""In-memory diagnostic run manager.

One process-wide manager tracks active + recent diagnostic runs.  Each
run owns a list of emitted events plus a fan-out of asyncio.Queue
subscribers (one per live WebSocket).  New subscribers replay history
before tailing.

Single-process by design — restarts wipe history.  That's fine for an
admin-only diagnostic surface; if multi-worker durability becomes a
requirement, persist events to a table and have streamers tail it.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

from .base import RUN_ACTOR_PARAM, Diagnostic, DiagnosticEvent

logger = logging.getLogger(__name__)


# Sentinel pushed onto subscriber queues when a run finishes.
_END = object()

# Cap how many runs we retain in memory.  Older runs evicted FIFO.
DEFAULT_MAX_RUNS = 50


@dataclass
class DiagnosticRun:
    run_id: str
    diagnostic_id: str
    params: dict[str, Any]
    started_by: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str = "pending"  # pending | running | completed | cancelled | errored
    error: Optional[str] = None
    events: list[dict[str, Any]] = field(default_factory=list)
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    _subscribers: list[asyncio.Queue] = field(default_factory=list)
    _task: Optional[asyncio.Task] = field(default=None, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def is_finished(self) -> bool:
        return self.status in ("completed", "cancelled", "errored")

    def to_summary(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "diagnostic_id": self.diagnostic_id,
            "status": self.status,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "started_by": self.started_by,
            "error": self.error,
            "event_count": len(self.events),
            "params": self.params,
        }

    def to_detail(self) -> dict[str, Any]:
        return {**self.to_summary(), "events": list(self.events)}

    async def emit(self, event: dict[str, Any]) -> None:
        """Append an event to the run log and fan-out to live subscribers."""
        async with self._lock:
            self.events.append(event)
            dead: list[asyncio.Queue] = []
            for q in self._subscribers:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    # Subscribers use unbounded queues, but be defensive.
                    dead.append(q)
            for q in dead:
                self._subscribers.remove(q)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        """Yield events: full history first, then live tail until terminal."""
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            for ev in self.events:
                q.put_nowait(ev)
            if self.is_finished():
                q.put_nowait(_END)
            else:
                self._subscribers.append(q)
                # Tag with end sentinel scheduling — finished_at flow will
                # broadcast _END when run completes.
        try:
            while True:
                item = await q.get()
                if item is _END:
                    return
                yield item
        finally:
            async with self._lock:
                if q in self._subscribers:
                    self._subscribers.remove(q)


class DiagnosticRunManager:
    def __init__(self, max_runs: int = DEFAULT_MAX_RUNS) -> None:
        self._runs: OrderedDict[str, DiagnosticRun] = OrderedDict()
        self._max_runs = max_runs
        self._lock = asyncio.Lock()

    async def start(
        self,
        diagnostic: Diagnostic,
        params: dict[str, Any],
        started_by: str,
    ) -> DiagnosticRun:
        run_id = str(uuid.uuid4())
        run = DiagnosticRun(
            run_id=run_id,
            diagnostic_id=diagnostic.spec.id,
            params=dict(params),
            started_by=started_by,
            started_at=datetime.now(timezone.utc),
            status="running",
        )
        async with self._lock:
            self._runs[run_id] = run
            while len(self._runs) > self._max_runs:
                self._runs.popitem(last=False)
        await self._persist_start(run)
        run._task = asyncio.create_task(
            self._execute(run, diagnostic),
            name=f"diagnostic-run:{diagnostic.spec.id}:{run_id}",
        )
        return run

    async def _execute(self, run: DiagnosticRun, diagnostic: Diagnostic) -> None:
        # Hand the diagnostic the run's actor without polluting the persisted
        # params (which are mirrored to ``diagnostic_runs`` as the user contract).
        run_params = {**run.params, RUN_ACTOR_PARAM: run.started_by}
        try:
            async for event in diagnostic.run(run_params, run.cancel_event):
                payload = (
                    event.to_dict()
                    if isinstance(event, DiagnosticEvent)
                    else dict(event)
                )
                payload.setdefault("type", "observation")
                payload.setdefault("t_rel", 0.0)
                await run.emit(payload)
                if run.cancel_event.is_set():
                    break
            if run.cancel_event.is_set():
                run.status = "cancelled"
            else:
                run.status = "completed"
        except asyncio.CancelledError:
            run.status = "cancelled"
            raise
        except Exception as exc:
            logger.exception("Diagnostic run %s errored", run.run_id)
            run.status = "errored"
            run.error = str(exc)
            try:
                await run.emit({"t_rel": 0.0, "type": "error", "message": str(exc)})
            except Exception:
                pass
        finally:
            run.finished_at = datetime.now(timezone.utc)
            try:
                await run.emit(
                    {"t_rel": 0.0, "type": "terminal", "status": run.status}
                )
            except Exception:
                pass
            # Wake any live subscribers so they exit their loops.
            async with run._lock:
                for q in run._subscribers:
                    try:
                        q.put_nowait(_END)
                    except Exception:
                        pass
                run._subscribers.clear()
            # Persist the terminal snapshot (events now include the terminal
            # event emitted above).  Best-effort: never let a DB hiccup leak
            # out of a finished run.
            await self._persist_final(run)

    def get(self, run_id: str) -> Optional[DiagnosticRun]:
        return self._runs.get(run_id)

    def list_recent(self, limit: int = 25) -> list[DiagnosticRun]:
        # OrderedDict preserves insertion order; latest = end.
        runs = list(self._runs.values())
        return list(reversed(runs))[:limit]

    def cancel(self, run_id: str) -> bool:
        run = self._runs.get(run_id)
        if not run or run.is_finished():
            return False
        run.cancel_event.set()
        return True

    # ── Durable persistence (best-effort mirror) ─────────────────────────
    #
    # The in-memory store above is the source of truth for *active* runs and
    # live streaming.  These methods mirror runs into the ``diagnostic_runs``
    # table so history survives a reload/restart and is visible from other
    # clients.  Every DB touch is wrapped: if the table is missing (migration
    # not yet applied) or the DB is down, runs keep working in-memory and we
    # just log.

    async def _persist_start(self, run: DiagnosticRun) -> None:
        try:
            from pixsim7.backend.main.domain.diagnostics import DiagnosticRunRecord
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                session.add(
                    DiagnosticRunRecord(
                        run_id=run.run_id,
                        diagnostic_id=run.diagnostic_id,
                        status=run.status,
                        started_by=run.started_by,
                        started_at=run.started_at,
                        params=dict(run.params),
                        events=[],
                        event_count=0,
                    )
                )
                await session.commit()
            await self._prune_persisted()
        except Exception:
            logger.warning("diagnostic run persist(start) failed run_id=%s", run.run_id, exc_info=True)

    async def _persist_final(self, run: DiagnosticRun) -> None:
        try:
            from pixsim7.backend.main.domain.diagnostics import DiagnosticRunRecord
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                rec = await session.get(DiagnosticRunRecord, run.run_id)
                if rec is None:
                    rec = DiagnosticRunRecord(
                        run_id=run.run_id,
                        diagnostic_id=run.diagnostic_id,
                        started_by=run.started_by,
                        started_at=run.started_at,
                        params=dict(run.params),
                    )
                    session.add(rec)
                rec.status = run.status
                rec.finished_at = run.finished_at
                rec.error = run.error
                rec.events = list(run.events)
                rec.event_count = len(run.events)
                await session.commit()
        except Exception:
            logger.warning("diagnostic run persist(final) failed run_id=%s", run.run_id, exc_info=True)

    async def _prune_persisted(self, keep: int = 200) -> None:
        try:
            from sqlalchemy import delete, desc, select

            from pixsim7.backend.main.domain.diagnostics import DiagnosticRunRecord
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                stale = (
                    await session.execute(
                        select(DiagnosticRunRecord.run_id)
                        .order_by(desc(DiagnosticRunRecord.started_at))
                        .offset(keep)
                    )
                ).scalars().all()
                if stale:
                    await session.execute(
                        delete(DiagnosticRunRecord).where(DiagnosticRunRecord.run_id.in_(stale))
                    )
                    await session.commit()
        except Exception:
            logger.debug("diagnostic run prune failed", exc_info=True)

    def _record_to_summary(self, rec: Any) -> dict[str, Any]:
        """DB record → summary dict.  A persisted ``running`` row that reached
        this path is not in memory ⇒ it was interrupted by a restart; relabel
        so the UI doesn't show a phantom 'running' run forever."""
        status = rec.status
        error = rec.error
        if status == "running":
            status = "errored"
            error = error or "interrupted (process restart)"
        return {
            "run_id": rec.run_id,
            "diagnostic_id": rec.diagnostic_id,
            "status": status,
            "started_at": rec.started_at.isoformat() if rec.started_at else None,
            "finished_at": rec.finished_at.isoformat() if rec.finished_at else None,
            "started_by": rec.started_by,
            "error": error,
            "event_count": rec.event_count,
            "params": rec.params or {},
        }

    async def list_summaries(self, limit: int = 25) -> list[dict[str, Any]]:
        """Recent runs, merging the in-memory store (fresh) with the DB
        (durable). In-memory wins per run_id."""
        summaries: dict[str, dict[str, Any]] = {}
        try:
            from sqlalchemy import desc, select

            from pixsim7.backend.main.domain.diagnostics import DiagnosticRunRecord
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                rows = (
                    await session.execute(
                        select(DiagnosticRunRecord)
                        .order_by(desc(DiagnosticRunRecord.started_at))
                        .limit(max(limit, 200))
                    )
                ).scalars().all()
            for rec in rows:
                summaries[rec.run_id] = self._record_to_summary(rec)
        except Exception:
            logger.warning("diagnostic run list(persisted) failed", exc_info=True)
        # In-memory runs override (fresher status / event_count).
        for run in self._runs.values():
            summaries[run.run_id] = run.to_summary()
        merged = sorted(summaries.values(), key=lambda s: s.get("started_at") or "", reverse=True)
        return merged[:limit]

    async def get_detail(self, run_id: str) -> Optional[dict[str, Any]]:
        """Run detail (summary + events) from memory if active, else DB."""
        run = self._runs.get(run_id)
        if run is not None:
            return run.to_detail()
        try:
            from pixsim7.backend.main.domain.diagnostics import DiagnosticRunRecord
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                rec = await session.get(DiagnosticRunRecord, run_id)
            if rec is None:
                return None
            return {**self._record_to_summary(rec), "events": list(rec.events or [])}
        except Exception:
            logger.warning("diagnostic run detail(persisted) failed run_id=%s", run_id, exc_info=True)
            return None


diagnostic_run_manager = DiagnosticRunManager()
