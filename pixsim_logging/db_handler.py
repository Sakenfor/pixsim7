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
from datetime import datetime, timezone
from typing import Any
from queue import Queue
from threading import Thread, Event

from sqlalchemy import create_engine, Table, Column, MetaData
from sqlalchemy import Integer, String, DateTime, JSON, Text

from .schema import LOG_ENTRY_COLUMNS


def _to_json_safe(value: Any) -> Any:
    """
    Recursively convert values to JSON-serializable forms.

    - datetime -> ISO 8601 string (UTC if tz-aware)
    - dict -> dict with normalized values
    - list/tuple -> list with normalized values
    - set -> list with normalized values
    - other types are returned as-is; if they are not JSON-serializable,
      SQLAlchemy/driver will fall back to their string representation.
    """
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.isoformat(timespec="microseconds")

    if isinstance(value, dict):
        return {k: _to_json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [_to_json_safe(v) for v in value]

    if isinstance(value, set):
        return [_to_json_safe(v) for v in value]

    return value


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
        # Simple counters for very lightweight, best-effort diagnostics.
        self._dropped_logs = 0
        self._worker_errors = 0

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
            Column("service", String(150), nullable=False),
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

        # Auto-create table if missing can be convenient for standalone scripts,
        # but in managed deployments we usually want migrations to control the
        # schema (especially for TimescaleDB hypertables and policies).
        auto_create_env = os.getenv("PIXSIM_LOG_DB_AUTO_CREATE", "true").lower()
        auto_create = auto_create_env not in {"0", "false", "no", "off"}
        if auto_create:
            try:
                self.meta.create_all(self.engine, tables=[self.table])
            except Exception as exc:
                # Avoid blocking application startup, but emit a one-line hint so
                # operators can discover that DB ingestion is not actually working.
                print(f"[DBLogHandler] Failed to ensure log table exists: {exc}", flush=True)

        self.queue: Queue = Queue(maxsize=1000)
        self.shutdown_event = Event()
        self.worker_thread = Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def __call__(self, logger, method_name: str, event_dict: dict[str, Any]):
        # Enqueue a copy to avoid mutating caller dict
        try:
            self.queue.put_nowait(event_dict.copy())
        except Exception:
            # Queue is full or otherwise unusable; drop the log but increment
            # a counter and occasionally emit a diagnostic to stderr.
            self._dropped_logs += 1
            if self._dropped_logs in {1, 10, 100} or self._dropped_logs % 1000 == 0:
                print(
                    f"[DBLogHandler] Dropped logs due to full queue; total dropped={self._dropped_logs}",
                    flush=True,
                )
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
            except Exception as exc:
                # Never raise from worker, but record that an error occurred
                # and emit a sparse diagnostic for observability.
                self._worker_errors += 1
                if self._worker_errors in {1, 10, 100} or self._worker_errors % 1000 == 0:
                    print(
                        f"[DBLogHandler] Worker loop error (count={self._worker_errors}): {exc}",
                        flush=True,
                    )

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
        except Exception as exc:
            # Drop on error to avoid blocking application, but emit a terse
            # message so that ingestion failures do not go unnoticed.
            print(f"[DBLogHandler] Failed to flush {len(rows)} log rows: {exc}", flush=True)

    def _map_event(self, ev: dict[str, Any]) -> dict[str, Any]:
        """Map structlog event to DB row, collecting unknown keys into 'extra'."""
        row = {}
        extra = {}
        for k, v in ev.items():
            if k in LOG_ENTRY_COLUMNS:
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
        # Always set extra field (None if empty to avoid bind parameter errors)
        # Normalize to JSON-safe types so datetime and other objects don't break JSON encoding.
        row["extra"] = _to_json_safe(extra) if extra else None
        # Default env/service/level values so DB constraints hold even if upstream binding is missing.
        row.setdefault("env", os.getenv("PIXSIM_ENV", "dev"))
        default_service = os.getenv("PIXSIM_SERVICE_NAME") or os.getenv("PIXSIM_SERVICE") or os.getenv("SERVICE_NAME")
        row.setdefault("service", default_service or "unknown")
        level_value = row.get("level")
        if isinstance(level_value, str):
            row["level"] = level_value.upper()
        else:
            row["level"] = "INFO"

        # Set defaults for optional nullable fields to avoid bind parameter errors
        row.setdefault("request_id", None)
        row.setdefault("job_id", None)
        row.setdefault("submission_id", None)
        row.setdefault("artifact_id", None)
        row.setdefault("provider_job_id", None)
        row.setdefault("provider_id", None)
        row.setdefault("operation_type", None)
        row.setdefault("stage", None)
        row.setdefault("user_id", None)
        row.setdefault("error", None)
        row.setdefault("error_type", None)
        row.setdefault("duration_ms", None)
        row.setdefault("attempt", None)

        # Parse ISO timestamp string to datetime if needed and ensure UTC naive datetimes for DB.
        timestamp_value = row.get("timestamp")
        if isinstance(timestamp_value, str):
            try:
                parsed = datetime.fromisoformat(timestamp_value.replace("Z", "+00:00"))
            except Exception:
                parsed = None
            if parsed is not None:
                if parsed.tzinfo is not None:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                row["timestamp"] = parsed
            else:
                row.pop("timestamp", None)
        if not row.get("timestamp"):
            row["timestamp"] = datetime.utcnow()
        row.setdefault("created_at", row["timestamp"])
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
