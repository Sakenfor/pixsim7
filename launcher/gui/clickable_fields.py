"""
Clickable field registry for dynamic log viewer interactions.

Defines which fields are clickable, their styling, and available actions.
This makes it easy to add new clickable fields without modifying multiple files.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum


class ActionType(Enum):
    """Types of actions available for clickable fields."""
    FILTER = "filter"           # Filter current view by this field
    TRACE = "trace"             # Show full trace across all services
    COPY = "copy"               # Copy value to clipboard
    OPEN_URL = "open_url"       # Open external URL
    CUSTOM = "custom"           # Custom handler


@dataclass
class FieldAction:
    """Definition of an action available for a clickable field."""
    id: str
    label: str
    action_type: ActionType
    icon: str = ""
    is_default: bool = False    # If true, single-click triggers this action
    tooltip: str = ""
    # For OPEN_URL type, template with {value} placeholder
    url_template: Optional[str] = None
    # For TRACE type, specify which filters to adjust
    trace_config: Optional[Dict[str, Any]] = None


@dataclass
class ClickableField:
    """Definition of a clickable field in log viewer."""
    field_name: str
    color: str
    short_prefix: str           # e.g., "req" for request_id
    display_name: str           # e.g., "Request ID"
    actions: List[FieldAction]
    truncate_length: int = 0    # 0 = no truncation
    tooltip_template: str = ""  # e.g., "Click to filter by {field_name}"


class ClickableFieldRegistry:
    """
    Registry of clickable fields and their behaviors.

    Usage:
        registry = ClickableFieldRegistry()
        field_def = registry.get('request_id')
        if field_def:
            actions = field_def.actions
    """

    def __init__(self):
        self._fields: Dict[str, ClickableField] = {}
        self._register_defaults()

    def register(self, field: ClickableField):
        """Register a clickable field definition."""
        self._fields[field.field_name] = field

    def get(self, field_name: str) -> Optional[ClickableField]:
        """Get field definition by name."""
        return self._fields.get(field_name)

    def get_all(self) -> Dict[str, ClickableField]:
        """Get all registered fields."""
        return self._fields.copy()

    def is_clickable(self, field_name: str) -> bool:
        """Check if a field is registered as clickable."""
        return field_name in self._fields

    def get_default_action(self, field_name: str) -> Optional[FieldAction]:
        """Get the default action for a field (for single-click)."""
        field = self.get(field_name)
        if not field:
            return None
        for action in field.actions:
            if action.is_default:
                return action
        # Fallback to first action
        return field.actions[0] if field.actions else None

    def _register_defaults(self):
        """Register default clickable fields."""

        # Request ID - trace a request across services
        self.register(ClickableField(
            field_name="request_id",
            color="#FFB74D",  # Orange
            short_prefix="req",
            display_name="Request ID",
            truncate_length=8,
            tooltip_template="Request {value} - click for actions",
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter current view",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                    tooltip="Show only logs with this request ID"
                ),
                FieldAction(
                    id="trace",
                    label="Show full request trace",
                    action_type=ActionType.TRACE,
                    icon="📊",
                    tooltip="Show all logs for this request across all services",
                    trace_config={
                        "service": "All",
                        "time_range": "Last 24 hours",
                        "clear_other_filters": True,
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy request ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                    tooltip="Copy full request ID to clipboard"
                ),
            ]
        ))

        # Job ID - trace a job through its lifecycle
        self.register(ClickableField(
            field_name="job_id",
            color="#4DD0E1",  # Cyan
            short_prefix="job",
            display_name="Job ID",
            truncate_length=0,
            tooltip_template="Job {value} - click for actions",
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter current view",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                    tooltip="Show only logs with this job ID"
                ),
                FieldAction(
                    id="trace",
                    label="Show job lifecycle",
                    action_type=ActionType.TRACE,
                    icon="📊",
                    tooltip="Show full job lifecycle across API and worker",
                    trace_config={
                        "service": "All",
                        "time_range": "Last 6 hours",
                        "clear_other_filters": True,
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy job ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # User ID
        self.register(ClickableField(
            field_name="user_id",
            color="#CE93D8",  # Purple
            short_prefix="user",
            display_name="User ID",
            truncate_length=0,
            tooltip_template="User {value} - click for actions",
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by user",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="trace",
                    label="Show user activity",
                    action_type=ActionType.TRACE,
                    icon="👤",
                    tooltip="Show all activity for this user",
                    trace_config={
                        "service": "All",
                        "time_range": "Last hour",
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy user ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Provider ID
        self.register(ClickableField(
            field_name="provider_id",
            color="#81C784",  # Green
            short_prefix="provider",
            display_name="Provider",
            truncate_length=0,
            tooltip_template="Provider: {value}",
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by provider",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="errors",
                    label="Show provider errors",
                    action_type=ActionType.TRACE,
                    icon="⚠️",
                    tooltip="Show recent errors for this provider",
                    trace_config={
                        "service": "api",
                        "level": "ERROR",
                        "time_range": "Last hour",
                        "search": "provider_error",
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy provider ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Account ID
        self.register(ClickableField(
            field_name="account_id",
            color="#90CAF9",  # Light blue
            short_prefix="acct",
            display_name="Account ID",
            truncate_length=0,
            tooltip_template="Account {value}",
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by account",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="trace",
                    label="Show account activity",
                    action_type=ActionType.TRACE,
                    icon="📊",
                    trace_config={
                        "service": "All",
                        "time_range": "Last hour",
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy account ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Asset ID
        self.register(ClickableField(
            field_name="asset_id",
            color="#FFCC80",  # Light orange
            short_prefix="asset",
            display_name="Asset ID",
            truncate_length=0,
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by asset",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="copy",
                    label="Copy asset ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Artifact ID
        self.register(ClickableField(
            field_name="artifact_id",
            color="#B39DDB",  # Light purple
            short_prefix="artifact",
            display_name="Artifact ID",
            truncate_length=0,
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by artifact",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="trace",
                    label="Show artifact lifecycle",
                    action_type=ActionType.TRACE,
                    icon="📊",
                    trace_config={
                        "service": "All",
                        "time_range": "Last 6 hours",
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy artifact ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Provider Job ID (external ID from provider)
        self.register(ClickableField(
            field_name="provider_job_id",
            color="#A5D6A7",  # Light green
            short_prefix="pjob",
            display_name="Provider Job ID",
            truncate_length=12,
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by provider job",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="copy",
                    label="Copy provider job ID",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))

        # Error type - for filtering similar errors
        self.register(ClickableField(
            field_name="error_type",
            color="#EF9A9A",  # Light red
            short_prefix="err",
            display_name="Error Type",
            truncate_length=0,
            actions=[
                FieldAction(
                    id="filter",
                    label="Filter by error type",
                    action_type=ActionType.FILTER,
                    icon="🔍",
                    is_default=True,
                ),
                FieldAction(
                    id="search",
                    label="Search all occurrences",
                    action_type=ActionType.TRACE,
                    icon="🔎",
                    trace_config={
                        "service": "All",
                        "level": "ERROR",
                        "time_range": "Last 24 hours",
                    }
                ),
                FieldAction(
                    id="copy",
                    label="Copy error type",
                    action_type=ActionType.COPY,
                    icon="📋",
                ),
            ]
        ))


# Global registry instance
_registry: Optional[ClickableFieldRegistry] = None


def get_registry() -> ClickableFieldRegistry:
    """Get the global clickable field registry."""
    global _registry
    if _registry is None:
        _registry = ClickableFieldRegistry()
    return _registry


def get_field(field_name: str) -> Optional[ClickableField]:
    """Convenience function to get a field definition."""
    return get_registry().get(field_name)


def is_clickable(field_name: str) -> bool:
    """Convenience function to check if a field is clickable."""
    return get_registry().is_clickable(field_name)
