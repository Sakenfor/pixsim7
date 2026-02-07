"""
Utility functions for versioning operations.

Shared helpers used across different versioning implementations.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


def format_timedelta(delta: timedelta) -> str:
    """
    Format timedelta as human-readable string.

    Examples:
        - "5 seconds"
        - "3 minutes"
        - "2 hours"
        - "1 day"
    """
    seconds = int(delta.total_seconds())

    if seconds < 0:
        return "in the future"
    elif seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    elif seconds < 3600:
        minutes = seconds // 60
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    elif seconds < 86400:
        hours = seconds // 3600
        return f"{hours} hour{'s' if hours != 1 else ''}"
    else:
        days = seconds // 86400
        return f"{days} day{'s' if days != 1 else ''}"


def time_since(dt: datetime) -> str:
    """Get human-readable time since a datetime."""
    if dt is None:
        return "unknown"
    delta = datetime.now(timezone.utc) - dt
    return format_timedelta(delta)


def compute_version_stats(versions: List[Any]) -> Dict[str, Any]:
    """
    Compute statistics from a list of versioned entities.

    Args:
        versions: List of entities with version_number attribute

    Returns:
        Dict with version_count, min_version, max_version, etc.
    """
    if not versions:
        return {
            "version_count": 0,
            "min_version": None,
            "max_version": None,
            "versions": [],
        }

    version_numbers = [
        getattr(v, 'version_number', None)
        for v in versions
        if getattr(v, 'version_number', None) is not None
    ]

    return {
        "version_count": len(versions),
        "min_version": min(version_numbers) if version_numbers else None,
        "max_version": max(version_numbers) if version_numbers else None,
        "versions": version_numbers,
    }


def build_version_diff_summary(
    old_entity: Any,
    new_entity: Any,
    fields: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Build a summary of differences between two versions.

    For entities with text content (prompts), can include text diff.
    For entities with binary content (assets), just shows metadata changes.

    Args:
        old_entity: Previous version
        new_entity: New version
        fields: Optional list of fields to compare

    Returns:
        Dict describing the differences
    """
    if fields is None:
        fields = ["description", "version_message"]

    diff = {
        "old_version": getattr(old_entity, 'version_number', None),
        "new_version": getattr(new_entity, 'version_number', None),
        "changes": [],
    }

    for field in fields:
        old_val = getattr(old_entity, field, None)
        new_val = getattr(new_entity, field, None)
        if old_val != new_val:
            diff["changes"].append({
                "field": field,
                "old": old_val,
                "new": new_val,
            })

    return diff


def validate_version_number(version_number: Optional[int]) -> bool:
    """Validate that a version number is valid (positive integer)."""
    return version_number is not None and version_number > 0


def generate_version_message(
    operation: str,
    source_version: Optional[int] = None,
    **kwargs
) -> str:
    """
    Generate a default version message for common operations.

    Args:
        operation: Type of operation (rollback, revert, fork, etc.)
        source_version: Source version number if applicable
        **kwargs: Additional context

    Returns:
        Human-readable version message
    """
    messages = {
        "initial": "Initial version",
        "rollback": f"Rollback to version {source_version}",
        "revert": f"Revert changes from version {source_version}",
        "fork": f"Forked from version {source_version}",
        "cherry_pick": f"Cherry-picked from version {source_version}",
        "merge": "Merged versions",
        "branch": f"Branched from version {source_version}",
    }

    message = messages.get(operation, f"Version created via {operation}")

    # Append additional context if provided
    if "branch_name" in kwargs:
        message += f" on branch '{kwargs['branch_name']}'"
    if "commit_message" in kwargs and kwargs["commit_message"]:
        message = kwargs["commit_message"]

    return message
