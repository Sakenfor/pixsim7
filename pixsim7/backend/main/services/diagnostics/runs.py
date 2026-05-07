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

from .base import Diagnostic, DiagnosticEvent

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
        run._task = asyncio.create_task(
            self._execute(run, diagnostic),
            name=f"diagnostic-run:{diagnostic.spec.id}:{run_id}",
        )
        return run

    async def _execute(self, run: DiagnosticRun, diagnostic: Diagnostic) -> None:
        try:
            async for event in diagnostic.run(run.params, run.cancel_event):
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


diagnostic_run_manager = DiagnosticRunManager()
