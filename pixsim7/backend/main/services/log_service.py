"""
Log ingestion and query service.

Handles centralized structured log storage and retrieval.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, func, delete, text
from sqlmodel import col

from pixsim7.backend.main.domain import LogEntry
from pixsim_logging import get_logger
from pixsim_logging.schema import LOG_ENTRY_COLUMNS

logger = get_logger()


class LogService:
    """Service for log ingestion and querying."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _trace_id_filter_clause(self, trace_id: str):
        """Build a dialect-aware SQL clause filtering by extra.trace_id."""
        bind = self.db.get_bind()
        dialect = bind.dialect.name if bind is not None else ""
        if dialect == "sqlite":
            return text("json_extract(extra, '$.trace_id') = :trace_id").bindparams(trace_id=trace_id)
        # PostgreSQL / default
        return text("extra->>'trace_id' = :trace_id").bindparams(trace_id=trace_id)

    def _normalize_log_data(self, log_data: dict) -> dict:
        """Normalize inbound log payload into LogEntry constructor kwargs."""
        timestamp = log_data.get("timestamp")
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                timestamp = datetime.now(timezone.utc)
        elif timestamp is None:
            timestamp = datetime.now(timezone.utc)

        entry_data: dict = {}
        extra_data: dict = {}

        for key, value in log_data.items():
            # Let created_at be controlled by the backend DB default; treat it as extra
            # even though it is a real column so ingestion clients cannot override it.
            if key in LOG_ENTRY_COLUMNS and key != "created_at":
                entry_data[key] = value
            else:
                extra_data[key] = value

        entry_data["timestamp"] = timestamp
        if extra_data:
            entry_data["extra"] = extra_data

        return entry_data

    async def ingest_log(self, log_data: dict) -> LogEntry:
        """
        Ingest a single structured log entry.

        Args:
            log_data: Dictionary containing log fields

        Returns:
            Created LogEntry
        """
        entry_data = self._normalize_log_data(log_data)
        log_entry = LogEntry(**entry_data)
        self.db.add(log_entry)
        await self.db.commit()
        await self.db.refresh(log_entry)
        return log_entry

    async def ingest_batch(self, logs: List[dict]) -> int:
        """
        Ingest multiple log entries in batch.

        Args:
            logs: List of log dictionaries

        Returns:
            Number of logs ingested
        """
        entries: List[LogEntry] = []
        for log_data in logs:
            try:
                entry_data = self._normalize_log_data(log_data)
                entries.append(LogEntry(**entry_data))
            except Exception as e:
                logger.error(
                    "log_ingest_failed",
                    error=str(e),
                    error_type=e.__class__.__name__,
                    log_data=log_data,
                )

        if not entries:
            return 0

        self.db.add_all(entries)
        await self.db.commit()
        return len(entries)

    async def query_logs(
        self,
        *,
        service: Optional[str] = None,
        level: Optional[str] = None,
        job_id: Optional[int] = None,
        request_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        stage: Optional[str] = None,
        stage_prefix: Optional[str] = None,
        channel: Optional[str] = None,
        domain: Optional[str] = None,
        provider_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[LogEntry], int]:
        """
        Query logs with filters.

        Args:
            service: Filter by service name
            level: Filter by log level
            job_id: Filter by job ID
            request_id: Filter by request ID
            trace_id: Filter by trace ID
            stage: Filter by pipeline stage (exact match)
            stage_prefix: Filter by pipeline stage prefix (e.g. 'provider')
            channel: Filter by log channel (cron, pipeline, api, system)
            provider_id: Filter by provider
            start_time: Logs after this time
            end_time: Logs before this time
            search: Text search in msg and error fields
            limit: Maximum results to return
            offset: Offset for pagination

        Returns:
            Tuple of (log entries, total count)
        """
        # Build filters
        filters = []

        if service:
            filters.append(LogEntry.service == service)
        if level:
            filters.append(LogEntry.level == level)
        if job_id is not None:
            filters.append(LogEntry.job_id == job_id)
        if request_id:
            filters.append(LogEntry.request_id == request_id)
        if trace_id:
            filters.append(self._trace_id_filter_clause(trace_id))
        if stage:
            filters.append(LogEntry.stage == stage)
        elif stage_prefix:
            # Prefix filter: matches stages like 'provider:submit', 'provider:status', etc.
            filters.append(col(LogEntry.stage).like(f"{stage_prefix}:%"))
        if channel:
            filters.append(LogEntry.channel == channel)
        if domain:
            filters.append(LogEntry.domain == domain)
        if provider_id:
            filters.append(LogEntry.provider_id == provider_id)
        if start_time:
            filters.append(LogEntry.timestamp >= start_time)
        if end_time:
            filters.append(LogEntry.timestamp <= end_time)
        if search:
            search_pattern = f"%{search}%"
            filters.append(
                or_(
                    col(LogEntry.msg).like(search_pattern),
                    col(LogEntry.error).like(search_pattern)
                )
            )

        # Build query
        query = select(LogEntry)
        if filters:
            query = query.where(and_(*filters))

        # Get total count
        count_query = select(func.count()).select_from(LogEntry)
        if filters:
            count_query = count_query.where(and_(*filters))
        result = await self.db.execute(count_query)
        total = result.scalar_one()

        # Apply ordering and pagination
        query = query.order_by(desc(LogEntry.timestamp))
        query = query.limit(limit).offset(offset)

        # Execute
        result = await self.db.execute(query)
        logs = result.scalars().all()

        return list(logs), total

    async def get_job_trace(self, job_id: int) -> List[LogEntry]:
        """
        Get complete log trace for a job.

        Returns all logs related to a job, ordered by timestamp.

        Args:
            job_id: Job ID to trace

        Returns:
            List of log entries for the job
        """
        query = (
            select(LogEntry)
            .where(LogEntry.job_id == job_id)
            .order_by(LogEntry.timestamp)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_request_trace(self, request_id: str) -> List[LogEntry]:
        """
        Get complete log trace for an API request.

        Args:
            request_id: Request ID to trace

        Returns:
            List of log entries for the request
        """
        query = (
            select(LogEntry)
            .where(LogEntry.request_id == request_id)
            .order_by(LogEntry.timestamp)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_trace_id_trace(self, trace_id: str) -> List[LogEntry]:
        """
        Get complete log trace for a trace ID.

        Args:
            trace_id: Trace ID to trace

        Returns:
            List of log entries for the trace ID
        """
        query = (
            select(LogEntry)
            .where(self._trace_id_filter_clause(trace_id))
            .order_by(LogEntry.timestamp)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def cleanup_old_logs(self, days: int = 30) -> int:
        """
        Delete logs older than specified days.

        This helper is primarily intended for non-Timescale deployments or
        ad-hoc maintenance scripts. In a TimescaleDB setup with retention
        policies configured via migrations, prefer those database-level
        policies instead of calling this method on a schedule.

        Args:
            days: Number of days to retain

        Returns:
            Number of logs deleted
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(func.count())
            .select_from(LogEntry)
            .where(LogEntry.timestamp < cutoff)
        )
        count = result.scalar_one()

        # Delete old logs
        await self.db.execute(
            delete(LogEntry).where(LogEntry.timestamp < cutoff)
        )
        await self.db.commit()

        logger.info("cleaned_up_old_logs", deleted_count=count, cutoff_days=days)

        return count

    async def get_distinct_values(self, column: str) -> list[str]:
        """Return distinct non-null values for a log column (service, channel, domain, etc.)."""
        allowed = {"service", "channel", "domain", "level", "provider_id", "operation_type", "stage"}
        if column not in allowed:
            raise ValueError(f"Column {column!r} not allowed; pick from {allowed}")
        sql = text(f"SELECT DISTINCT {column} FROM log_entries WHERE {column} IS NOT NULL ORDER BY {column}")
        rows = (await self.db.execute(sql)).all()
        return [row[0] for row in rows]

    async def get_fields(
        self,
        *,
        service: Optional[str] = None,
        sample_limit: int = 300
    ) -> Dict[str, Any]:
        """
        Discover available log fields by inspecting recent log entries.

        Returns a union of:
        - Known column names from the LogEntry model
        - Dynamic keys found in the 'extra' JSON field

        Args:
            service: Optional service name to scope field discovery
            sample_limit: Number of recent rows to inspect (default: 300)

        Returns:
            Dictionary containing:
            - service: The service filter used (or None)
            - fields: All available fields (sorted)
            - dynamic: Dynamic fields from 'extra' (sorted)
            - count: Number of rows inspected
        """
        # Known columns from LogEntry model
        known_cols: Set[str] = {
            "id", "timestamp", "level", "service", "env", "msg", "request_id",
            "trace_id",
            "job_id", "submission_id", "generation_id", "provider_job_id",
            "provider_id", "operation_type", "stage", "domain", "channel", "user_id", "error",
            "error_type", "duration_ms", "attempt", "extra", "created_at"
        }

        params: Dict[str, Any] = {"limit": sample_limit}
        where_service = ""
        if service:
            where_service = "WHERE service = :service"
            params["service"] = service

        # Fetch recent rows to discover dynamic keys in 'extra'
        sql = text(
            f"SELECT service, extra FROM log_entries {where_service} "
            f"ORDER BY timestamp DESC LIMIT :limit"
        )
        rows = (await self.db.execute(sql, params)).all()

        # Collect all dynamic keys from 'extra' JSON fields
        dynamic_keys: Set[str] = set()
        for svc, extra in rows:
            if isinstance(extra, dict):
                for k in extra.keys():
                    dynamic_keys.add(k)

        all_fields = sorted(list(known_cols.union(dynamic_keys)))

        return {
            "service": service,
            "fields": all_fields,
            "dynamic": sorted(list(dynamic_keys)),
            "count": len(rows)
        }

    async def query_account_events(
        self,
        *,
        account_id: Optional[int] = None,
        event_type: Optional[str] = None,
        provider_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        """Query the account_events satellite table.

        Returns (rows, total_count).  Uses raw SQL since the table may not
        be managed by the ORM session.
        """
        where_clauses: List[str] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if account_id is not None:
            where_clauses.append("account_id = :account_id")
            params["account_id"] = account_id
        if event_type:
            where_clauses.append("event_type = :event_type")
            params["event_type"] = event_type
        if provider_id:
            where_clauses.append("provider_id = :provider_id")
            params["provider_id"] = provider_id
        if start_time:
            where_clauses.append("timestamp >= :start_time")
            params["start_time"] = start_time
        if end_time:
            where_clauses.append("timestamp <= :end_time")
            params["end_time"] = end_time

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        count_sql = text(f"SELECT count(*) FROM account_events {where_sql}")
        count_result = await self.db.execute(count_sql, params)
        total = count_result.scalar_one()

        data_sql = text(
            f"SELECT * FROM account_events {where_sql} "
            f"ORDER BY timestamp DESC LIMIT :limit OFFSET :offset"
        )
        rows_result = await self.db.execute(data_sql, params)
        columns = list(rows_result.keys())
        rows = [dict(zip(columns, row)) for row in rows_result.fetchall()]

        return rows, total

    async def get_distinct(
        self,
        field: str,
        *,
        service: Optional[str] = None,
        provider_id: Optional[str] = None,
        operation_type: Optional[str] = None,
        stage: Optional[str] = None,
        domain: Optional[str] = None,
        request_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        job_id: Optional[int] = None,
        user_id: Optional[int] = None,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        Get distinct values for a specified field.

        Supports both base columns (e.g., 'level', 'service') and dynamic
        keys stored in the 'extra' JSON field.

        Args:
            field: Field name to get distinct values for
            service: Filter by service name
            provider_id: Filter by provider
            operation_type: Filter by operation type
            stage: Filter by pipeline stage
            request_id: Filter by request ID
            trace_id: Filter by trace ID
            job_id: Filter by job ID
            user_id: Filter by user ID
            limit: Maximum number of distinct values to return

        Returns:
            Dictionary containing:
            - field: The field name queried
            - count: Number of distinct values found
            - values: List of distinct values (sorted)
        """
        # Known base columns that can be queried directly
        base_cols = {
            "level", "service", "env", "msg", "request_id", "job_id",
            "submission_id", "generation_id", "provider_job_id", "provider_id",
            "operation_type", "stage", "domain", "channel", "user_id", "error_type", "attempt",
            "duration_ms"
        }

        is_base = field in base_cols
        bind = self.db.get_bind()
        dialect = bind.dialect.name if bind is not None else ""

        # Build WHERE clause from filters
        where_clauses: List[str] = []
        params: Dict[str, Any] = {"limit": limit}

        def add_clause(col: str, val: Any) -> None:
            if val is not None:
                where_clauses.append(f"{col} = :{col}")
                params[col] = val

        add_clause("service", service)
        add_clause("provider_id", provider_id)
        add_clause("operation_type", operation_type)
        add_clause("stage", stage)
        add_clause("domain", domain)
        add_clause("request_id", request_id)
        add_clause("job_id", job_id)
        add_clause("user_id", user_id)

        if trace_id is not None:
            params["trace_id_filter"] = trace_id
            if dialect == "sqlite":
                where_clauses.append("json_extract(extra, '$.trace_id') = :trace_id_filter")
            else:
                where_clauses.append("extra->>'trace_id' = :trace_id_filter")

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        # Build SQL based on whether field is a base column or dynamic key
        if is_base:
            # Query base column directly
            null_check = f"{field} IS NOT NULL"
            if where_sql:
                sql = text(
                    f"SELECT DISTINCT {field} AS value FROM log_entries "
                    f"{where_sql} AND {null_check} ORDER BY value LIMIT :limit"
                )
            else:
                sql = text(
                    f"SELECT DISTINCT {field} AS value FROM log_entries "
                    f"WHERE {null_check} ORDER BY value LIMIT :limit"
                )
        else:
            # Query dynamic key from 'extra' JSON field
            params["extra_key"] = field
            if dialect == "sqlite":
                value_expr = "json_extract(extra, '$.' || :extra_key)"
                extra_filter = f"{value_expr} IS NOT NULL"
            else:
                value_expr = "extra->>:extra_key"
                extra_filter = f"{value_expr} IS NOT NULL"

            if where_sql:
                sql = text(
                    f"SELECT DISTINCT {value_expr} AS value FROM log_entries "
                    f"{where_sql} AND {extra_filter} ORDER BY value LIMIT :limit"
                )
            else:
                sql = text(
                    f"SELECT DISTINCT {value_expr} AS value FROM log_entries "
                    f"WHERE {extra_filter} ORDER BY value LIMIT :limit"
                )

        # Execute query
        rows = (await self.db.execute(sql, params)).all()
        values = [r[0] for r in rows if r[0] is not None]

        return {
            "field": field,
            "count": len(values),
            "values": values
        }
