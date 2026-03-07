"""Generic batched satellite table writer.

Same Queue + daemon-thread pattern as :class:`DBLogHandler` but for arbitrary
tables (e.g. ``account_events``).  ``pixsim_logging`` stays domain-agnostic —
the handler just writes dicts to the table defined by the caller.

Usage::

    handler = SatelliteTableHandler(db_url, "account_events", columns=[...])
    handler.write({"event_type": "selected", "account_id": 2, ...})
    # ...
    handler.shutdown()
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from queue import Queue
from threading import Event, Thread
from typing import Any, List

from sqlalchemy import Column, MetaData, Table, create_engine


class SatelliteTableHandler:
    """Non-blocking batched writer for a satellite table."""

    def __init__(
        self,
        db_url: str,
        table_name: str,
        columns: List[Column],
        batch_size: int = 10,
        flush_interval: float = 5.0,
    ) -> None:
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self._dropped = 0

        self.engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=5,
        )
        self.meta = MetaData()
        self.table = Table(table_name, self.meta, *columns, extend_existing=True)

        auto_create = os.getenv("PIXSIM_LOG_DB_AUTO_CREATE", "true").lower() not in {
            "0", "false", "no", "off",
        }
        if auto_create:
            try:
                self.meta.create_all(self.engine, tables=[self.table])
            except Exception as exc:
                print(f"[SatelliteTableHandler] Failed to ensure table '{table_name}': {exc}", flush=True)

        self._col_names = {c.name for c in columns}
        self.queue: Queue = Queue(maxsize=5000)
        self.shutdown_event = Event()
        self.worker_thread = Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    # -- public API ----------------------------------------------------------

    def write(self, row: dict) -> None:
        """Enqueue a row dict for batched insert (non-blocking, fire-and-forget)."""
        try:
            self.queue.put_nowait(row)
        except Exception:
            self._dropped += 1
            if self._dropped in {1, 10, 100} or self._dropped % 1000 == 0:
                print(
                    f"[SatelliteTableHandler] Dropped rows; total={self._dropped}",
                    flush=True,
                )

    def shutdown(self) -> None:
        self.shutdown_event.set()
        self.worker_thread.join(timeout=5.0)

    # -- internals -----------------------------------------------------------

    def _worker(self) -> None:
        batch: list[dict] = []
        last_flush = time.time()

        while not self.shutdown_event.is_set():
            try:
                try:
                    item = self.queue.get(timeout=0.1)
                    batch.append(item)
                except Exception:
                    pass

                if len(batch) >= self.batch_size or (
                    batch and (time.time() - last_flush) >= self.flush_interval
                ):
                    self._flush(batch)
                    batch = []
                    last_flush = time.time()
            except Exception as exc:
                print(f"[SatelliteTableHandler] Worker error: {exc}", flush=True)

        if batch:
            self._flush(batch)

    def _flush(self, batch: list[dict]) -> None:
        if not batch:
            return
        rows = [self._clean(row) for row in batch]
        try:
            with self.engine.begin() as conn:
                conn.execute(self.table.insert(), rows)
        except Exception as exc:
            print(
                f"[SatelliteTableHandler] Flush failed ({len(rows)} rows): {exc}",
                flush=True,
            )

    def _clean(self, row: dict) -> dict:
        """Keep only columns that belong to this table and set defaults."""
        out: dict[str, Any] = {col: None for col in self._col_names}
        for k, v in row.items():
            if k in self._col_names:
                out[k] = v
        out.setdefault("timestamp", datetime.now(timezone.utc))
        return out


def create_satellite_handler_from_env(
    table_name: str,
    columns: List[Column],
    batch_size: int = 10,
    flush_interval: float = 5.0,
) -> SatelliteTableHandler | None:
    """Factory: create a handler if a DB URL is configured in env."""
    db_url = (
        os.getenv("PIXSIM_LOG_DB_URL")
        or os.getenv("LOG_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )
    if not db_url:
        return None
    try:
        return SatelliteTableHandler(
            db_url=db_url,
            table_name=table_name,
            columns=columns,
            batch_size=batch_size,
            flush_interval=flush_interval,
        )
    except Exception:
        return None
