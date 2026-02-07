"""
Admin logs endpoint - query application logs

Provides log searching, filtering, and pagination for admin panel.
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Query
from pydantic import BaseModel
import logging
import os
import re
from pathlib import Path

router = APIRouter()


class LogEntry(BaseModel):
    """Single log entry"""
    timestamp: str
    level: str
    logger: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    user_id: Optional[int] = None
    job_id: Optional[int] = None
    exception: Optional[str] = None


class LogQueryResponse(BaseModel):
    """Log query response with pagination"""
    logs: list[LogEntry]
    total: int
    limit: int
    offset: int


def parse_log_line(line: str) -> Optional[LogEntry]:
    """
    Parse a log line into structured format

    Expected format from Python logging:
    2025-11-11 19:30:45,123 - INFO - main - Starting PixSim7
    """
    try:
        # Basic regex for common Python log format
        pattern = r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - (\w+) - ([\w\.]+) - (.+)'
        match = re.match(pattern, line)

        if not match:
            # Fallback: treat as plain message
            return LogEntry(
                timestamp=datetime.now(timezone.utc).isoformat(),
                level="INFO",
                logger="unknown",
                message=line.strip()
            )

        timestamp_str, level, logger, message = match.groups()

        # Parse timestamp (console logs use local time via %(asctime)s)
        timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S,%f').isoformat()

        # Extract user_id and job_id from message if present
        user_id = None
        job_id = None

        user_match = re.search(r'user[_\s]?id[:\s=]+(\d+)', message, re.IGNORECASE)
        if user_match:
            user_id = int(user_match.group(1))

        job_match = re.search(r'job[_\s]?id[:\s=]+(\d+)', message, re.IGNORECASE)
        if job_match:
            job_id = int(job_match.group(1))

        return LogEntry(
            timestamp=timestamp,
            level=level,
            logger=logger,
            message=message,
            user_id=user_id,
            job_id=job_id
        )
    except Exception as e:
        # If parsing fails, return as plain message
        return LogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level="ERROR",
            logger="log_parser",
            message=f"Failed to parse log: {line[:100]}"
        )


def get_log_files() -> list[Path]:
    """Get list of log files, newest first"""
    log_dir = Path("logs")

    if not log_dir.exists():
        # No logs directory, return empty
        return []

    # Get all .log files
    log_files = list(log_dir.glob("*.log"))

    # Sort by modification time (newest first)
    log_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    return log_files


def search_logs(
    level: Optional[str] = None,
    logger: Optional[str] = None,
    search: Optional[str] = None,
    user_id: Optional[int] = None,
    job_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0
) -> tuple[list[LogEntry], int]:
    """
    Search logs with filters

    Returns: (matching_logs, total_count)
    """
    all_logs: list[LogEntry] = []

    # Get log files
    log_files = get_log_files()

    if not log_files:
        # No log files, return empty
        return ([], 0)

    # Read logs from files (newest first)
    for log_file in log_files:
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            # Parse each line
            for line in reversed(lines):  # Newest first
                if not line.strip():
                    continue

                entry = parse_log_line(line)
                if entry:
                    all_logs.append(entry)

            # Limit how many logs we read (performance)
            if len(all_logs) >= 10000:
                break

        except Exception as e:
            logging.error(f"Failed to read log file {log_file}: {e}")

    # Apply filters
    filtered_logs = []

    for entry in all_logs:
        # Level filter
        if level and entry.level != level:
            continue

        # Logger filter
        if logger and logger.lower() not in entry.logger.lower():
            continue

        # Search filter
        if search and search.lower() not in entry.message.lower():
            continue

        # User ID filter
        if user_id is not None and entry.user_id != user_id:
            continue

        # Job ID filter
        if job_id is not None and entry.job_id != job_id:
            continue

        filtered_logs.append(entry)

    # Pagination
    total = len(filtered_logs)
    paginated = filtered_logs[offset:offset + limit]

    return (paginated, total)


@router.get("/logs", response_model=LogQueryResponse)
async def get_logs(
    level: Optional[str] = Query(None, description="Filter by log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)"),
    logger: Optional[str] = Query(None, description="Filter by logger name"),
    search: Optional[str] = Query(None, description="Search in log messages"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    job_id: Optional[int] = Query(None, description="Filter by job ID"),
    limit: int = Query(100, ge=1, le=500, description="Number of logs to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """
    Query application logs with filters and pagination

    Returns logs in reverse chronological order (newest first).

    **Example queries:**
    - `/admin/logs?level=ERROR` - Only errors
    - `/admin/logs?search=failed` - Search for "failed"
    - `/admin/logs?job_id=123` - Logs for job #123
    - `/admin/logs?level=ERROR&limit=50` - Last 50 errors
    """
    logs, total = search_logs(
        level=level,
        logger=logger,
        search=search,
        user_id=user_id,
        job_id=job_id,
        limit=limit,
        offset=offset
    )

    return LogQueryResponse(
        logs=logs,
        total=total,
        limit=limit,
        offset=offset
    )
