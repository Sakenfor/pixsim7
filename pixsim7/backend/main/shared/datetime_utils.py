"""
Datetime Utilities

Centralized timezone-aware datetime helpers.
Replaces deprecated datetime.utcnow() with timezone-aware equivalents.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional


def utcnow() -> datetime:
    """
    Get current UTC time with timezone awareness.

    Replacement for deprecated datetime.utcnow().
    Returns timezone-aware datetime in UTC.

    Returns:
        datetime: Current UTC time with timezone info

    Example:
        >>> from pixsim7.backend.main.shared.datetime_utils import utcnow
        >>> now = utcnow()
        >>> print(now)  # 2025-12-15 01:23:45.123456+00:00
    """
    return datetime.now(timezone.utc)


def utc_timestamp(dt: Optional[datetime] = None) -> float:
    """
    Get Unix timestamp for a datetime (or current time).

    Args:
        dt: Optional datetime to convert. If None, uses current time.

    Returns:
        float: Unix timestamp (seconds since epoch)
    """
    if dt is None:
        dt = utcnow()
    elif dt.tzinfo is None:
        # Assume naive datetimes are UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def from_timestamp(ts: float) -> datetime:
    """
    Create timezone-aware datetime from Unix timestamp.

    Args:
        ts: Unix timestamp (seconds since epoch)

    Returns:
        datetime: Timezone-aware datetime in UTC
    """
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def ensure_timezone_aware(dt: datetime) -> datetime:
    """
    Ensure a datetime is timezone-aware (assume UTC if naive).

    Args:
        dt: Datetime to check

    Returns:
        datetime: Timezone-aware datetime
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def add_hours(hours: int, base: Optional[datetime] = None) -> datetime:
    """
    Add hours to a datetime (or current time).

    Args:
        hours: Number of hours to add
        base: Base datetime. If None, uses current time.

    Returns:
        datetime: New datetime with hours added
    """
    if base is None:
        base = utcnow()
    return base + timedelta(hours=hours)


def add_days(days: int, base: Optional[datetime] = None) -> datetime:
    """
    Add days to a datetime (or current time).

    Args:
        days: Number of days to add
        base: Base datetime. If None, uses current time.

    Returns:
        datetime: New datetime with days added
    """
    if base is None:
        base = utcnow()
    return base + timedelta(days=days)


# Alias for consistency
now = utcnow
