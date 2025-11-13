"""
Database handler for direct structured log ingestion.

Writes logs directly into a centralized TimescaleDB/PostgreSQL table.
Configured via environment variables (no dependency on backend code).

Environment:
  PIXSIM_LOG_DB_URL or LOG_DATABASE_URL: PostgreSQL URL (e.g. postgresql://user:pass@host:5432/db)
  PIXSIM_LOG_DB_TABLE: Table name (default: log_entries)
  PIXSIM_LOG_DB_BATCH_SIZE: Batch size (default 10)
  PIXSIM_LOG_DB_FLUSH_INTERVAL: Flush interval seconds (default 5.0)
"""
from __future__ import annotations
import os
import time
from typing import Any
from queue import Queue
from threading import Thread, Event

from sqlalchemy import create_engine, Table, Column, MetaData
from sqlalchemy import Integer, String, DateTime, JSON, Text


class DBLogHandler:
    """
    Structlog processor that batches and inserts logs directly into DB.
    """

    def __init__(
        self,
        db_url: str,
        table_name: str = "log_entries",
        batch_size: int = 10,
        flush_interval: float = 5.0,
    ) -> None:
        self.db_url = db_url
        self.batch_size = batch_size
        self.flush_interval = flush_interval

        # Engine + lightweight table definition (no ORM dependency)
        self.engine = create_engine(
            self.db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        self.meta = MetaData()
        self.table = Table(
            table_name,
            self.meta,
            Column("id", Integer, primary_key=True),
            Column("timestamp", DateTime, nullable=False),
            Column("level", String(20), nullable=False),
            Column("service", String(50), nullable=False),
            Column("env", String(20)),
            Column("msg", Text),
            Column("request_id", String(100)),
            Column("job_id", Integer),
            Column("submission_id", Integer),
            Column("artifact_id", Integer),
            Column("provider_job_id", String(255)),
            Column("provider_id", String(50)),
            Column("operation_type", String(50)),
            Column("stage", String(50)),
            Column("user_id", Integer),
            Column("error", Text),
            Column("error_type", String(100)),
            Column("duration_ms", Integer),
            Column("attempt", Integer),
            Column("extra", JSON),
            Column("created_at", DateTime),
            extend_existing=True,
        )

        # Auto-create table if missing. Safe due to extend_existing and guarded by try/except.
        try:
            self.meta.create_all(self.engine, tables=[self.table])
        except Exception:
            # Silently ignore to avoid blocking application startup.
            pass

        self.queue: Queue = Queue(maxsize=1000)
        self.shutdown_event = Event()
        self.worker_thread = Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def __call__(self, logger, method_name: str, event_dict: dict[str, Any]):
        # Enqueue a copy to avoid mutating caller dict
        try:
            self.queue.put_nowait(event_dict.copy())
        except Exception:
            pass
        return event_dict

    def _worker(self):
        batch = []
        last_flush = time.time()

        while not self.shutdown_event.is_set():
            try:
                try:
                    item = self.queue.get(timeout=0.1)
                    batch.append(item)
                except Exception:
                    pass

                if len(batch) >= self.batch_size or (batch and (time.time() - last_flush) >= self.flush_interval):
                    self._flush(batch)
                    batch = []
                    last_flush = time.time()
            except Exception:
                # Never raise from worker
                pass

        if batch:
            self._flush(batch)

    def _flush(self, batch: list[dict]):
        if not batch:
            return
        rows = []
        for ev in batch:
            rows.append(self._map_event(ev))

        try:
            with self.engine.begin() as conn:
                conn.execute(self.table.insert(), rows)
        except Exception:
            # Drop on error to avoid blocking application
            pass

    def _map_event(self, ev: dict[str, Any]) -> dict[str, Any]:
        """Map structlog event to DB row, collecting unknown keys into 'extra'."""
        known = {
            "timestamp", "level", "service", "env", "msg",
            "request_id", "job_id", "submission_id", "artifact_id", "provider_job_id",
            "provider_id", "operation_type", "stage", "user_id",
            "error", "error_type", "duration_ms", "attempt",
            "created_at",
        }
        row = {}
        extra = {}
        for k, v in ev.items():
            if k in known:
                row[k] = v
            else:
                extra[k] = v
        # Promote common message aliases if msg missing
        if "msg" not in row:
            if "event" in ev:
                row["msg"] = ev.get("event")
                extra.pop("event", None)  # Remove from extra if promoted
            elif "message" in ev:
                row["msg"] = ev.get("message")
                extra.pop("message", None)
        if extra:
            row["extra"] = extra
        # Default env
        row.setdefault("env", os.getenv("PIXSIM_ENV", "dev"))
        # Ensure level standardized
        if "level" in row and isinstance(row["level"], str):
            row["level"] = row["level"].upper()
        # Parse ISO timestamp string to datetime if needed
        try:
            from datetime import datetime
            if isinstance(row.get("timestamp"), str):
                row["timestamp"] = datetime.fromisoformat(row["timestamp"].replace('Z', '+00:00'))
        except Exception:
            pass
        return row

    def shutdown(self):
        self.shutdown_event.set()
        self.worker_thread.join(timeout=5.0)


def create_db_handler_from_env() -> DBLogHandler | None:
    """Create DB handler if a DB URL is configured in env."""
    db_url = os.getenv("PIXSIM_LOG_DB_URL") or os.getenv("LOG_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        return None
    table = os.getenv("PIXSIM_LOG_DB_TABLE", "log_entries")
    batch_size = int(os.getenv("PIXSIM_LOG_DB_BATCH_SIZE", "10"))
    flush_interval = float(os.getenv("PIXSIM_LOG_DB_FLUSH_INTERVAL", "5.0"))
    try:
        return DBLogHandler(db_url=db_url, table_name=table, batch_size=batch_size, flush_interval=flush_interval)
    except Exception:
        return None
