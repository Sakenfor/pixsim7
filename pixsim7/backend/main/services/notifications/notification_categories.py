"""
Notification Category Registry.

Categories self-register their defaults and granularity options.
Notifications code doesn't hardcode what categories exist.
Filtering happens on the read side — emit_notification() always writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


@dataclass
class NotificationCategoryGranularityOption:
    """A granularity option for a notification category."""

    id: str
    label: str
    description: str = ""


@dataclass
class NotificationCategorySpec:
    """Specification for a notification category."""

    id: str
    label: str
    description: str = ""
    icon: str = "bell"
    default_enabled: bool = True
    default_granularity: str = "all"
    granularity_options: List[NotificationCategoryGranularityOption] = field(
        default_factory=list
    )
    sort_order: int = 100


def _opt(id: str, label: str, description: str = "") -> NotificationCategoryGranularityOption:
    """Shorthand for creating a granularity option."""
    return NotificationCategoryGranularityOption(id=id, label=label, description=description)


# Standard option sets reused across categories
_ALL_OFF = [
    _opt("all", "All", "Show all notifications"),
    _opt("off", "Off", "Suppress all notifications"),
]

_ALL_STATUS_OFF = [
    _opt("all_changes", "All changes", "Show all change notifications"),
    _opt("status_only", "Status changes only", "Only show status transitions"),
    _opt("off", "Off", "Suppress all notifications"),
]

_ALL_ERRORS_OFF = [
    _opt("all", "All", "Show all notifications"),
    _opt("errors_only", "Errors only", "Only show error notifications"),
    _opt("off", "Off", "Suppress all notifications"),
]

_ALL_FAILURES_OFF = [
    _opt("all", "All", "Show all notifications"),
    _opt("failures_only", "Failures only", "Only show failure notifications"),
    _opt("off", "Off", "Suppress all notifications"),
]


class NotificationCategoryRegistry(SimpleRegistry[str, NotificationCategorySpec]):
    """Registry for notification category specifications."""

    def __init__(self) -> None:
        super().__init__(
            name="NotificationCategoryRegistry",
            allow_overwrite=True,
            seed_on_init=True,
        )

    def _get_item_key(self, item: NotificationCategorySpec) -> str:
        return item.id

    def _seed_defaults(self) -> None:
        for spec in _BUILTIN_CATEGORIES:
            self.register(spec.id, spec)

    def get_sorted(self) -> List[NotificationCategorySpec]:
        """Return all categories sorted by sort_order."""
        return sorted(self._items.values(), key=lambda c: c.sort_order)

    def get_default_granularity(self, category_id: str) -> Optional[str]:
        """Get the default granularity for a category, or None if not found."""
        spec = self.get_or_none(category_id)
        if spec is None:
            return None
        return "all" if spec.default_enabled else "off"


_BUILTIN_CATEGORIES: List[NotificationCategorySpec] = [
    NotificationCategorySpec(
        id="system",
        label="System",
        description="System announcements and maintenance notices",
        icon="settings",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_ALL_OFF,
        sort_order=10,
    ),
    NotificationCategorySpec(
        id="plan",
        label="Plans",
        description="Plan status changes and updates",
        icon="clipboard",
        default_enabled=True,
        default_granularity="all_changes",
        granularity_options=_ALL_STATUS_OFF,
        sort_order=20,
    ),
    NotificationCategorySpec(
        id="document",
        label="Documents",
        description="Document creation and modification",
        icon="file",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_ALL_OFF,
        sort_order=30,
    ),
    NotificationCategorySpec(
        id="feature",
        label="Features",
        description="Feature announcements and releases",
        icon="star",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_ALL_OFF,
        sort_order=40,
    ),
    NotificationCategorySpec(
        id="agent_session",
        label="Agent Sessions",
        description="AI agent session activity and results",
        icon="bot",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_ALL_ERRORS_OFF,
        sort_order=50,
    ),
    NotificationCategorySpec(
        id="review_workflow",
        label="Reviews",
        description="Review workflow status and approvals",
        icon="checkCircle",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_ALL_STATUS_OFF,
        sort_order=60,
    ),
    NotificationCategorySpec(
        id="generation",
        label="Generations",
        description="Image and video generation results",
        icon="image",
        default_enabled=False,
        default_granularity="off",
        granularity_options=_ALL_FAILURES_OFF,
        sort_order=70,
    ),
    NotificationCategorySpec(
        id="asset_analysis",
        label="Asset Analysis",
        description="Asset enrichment and analysis results",
        icon="search",
        default_enabled=False,
        default_granularity="off",
        granularity_options=_ALL_OFF,
        sort_order=80,
    ),
    NotificationCategorySpec(
        id="character",
        label="Characters",
        description="Character creation and updates",
        icon="user",
        default_enabled=False,
        default_granularity="off",
        granularity_options=_ALL_OFF,
        sort_order=90,
    ),
]


# Global singleton
notification_category_registry = NotificationCategoryRegistry()
