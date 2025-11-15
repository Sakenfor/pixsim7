"""
Log ingestion and query service.

Handles centralized structured log storage and retrieval.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, func, delete
from sqlmodel import col

from pixsim7_backend.domain import LogEntry
from pixsim_logging import get_logger

logger = get_logger()

# Fields that map directly onto LogEntry columns; everything else goes into extra.
KNOWN_LOG_FIELDS = {
    "timestamp",
    "level",
    "service",
    "env",
    "msg",
    "request_id",
    "job_id",
    "submission_id",
    "artifact_id",
    "provider_job_id",
    "provider_id",
    "operation_type",
    "stage",
    "user_id",
    "error",
    "error_type",
    "duration_ms",
    "attempt",
}


class LogService:
    """Service for log ingestion and querying."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _normalize_log_data(self, log_data: dict) -> dict:
        """Normalize inbound log payload into LogEntry constructor kwargs."""
        timestamp = log_data.get("timestamp")
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                timestamp = datetime.utcnow()
        elif timestamp is None:
            timestamp = datetime.utcnow()

        entry_data: dict = {}
        extra_data: dict = {}

        for key, value in log_data.items():
            if key in KNOWN_LOG_FIELDS:
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
        stage: Optional[str] = None,
        stage_prefix: Optional[str] = None,
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
            stage: Filter by pipeline stage (exact match)
            stage_prefix: Filter by pipeline stage prefix (e.g. 'provider')
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
        if stage:
            filters.append(LogEntry.stage == stage)
        elif stage_prefix:
            # Prefix filter: matches stages like 'provider:submit', 'provider:status', etc.
            filters.append(col(LogEntry.stage).like(f"{stage_prefix}:%"))
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

    async def cleanup_old_logs(self, days: int = 30) -> int:
        """
        Delete logs older than specified days.

        Args:
            days: Number of days to retain

        Returns:
            Number of logs deleted
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

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
