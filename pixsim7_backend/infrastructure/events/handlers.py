"""
Event handlers for cross-cutting concerns

Registers handlers for:
- Event metrics (count events by type)
- Webhooks (dispatch events to external URLs)
- Future: Analytics, notifications, audit trail, etc.

Note: This is separate from pixsim_logging which handles structured logging.
Event handlers are for reacting to domain events (metrics, webhooks, side effects).
"""
from typing import Dict
from collections import defaultdict
from datetime import datetime

from pixsim7_backend.infrastructure.events.bus import (
    event_bus,
    Event,
    # Common event types
    JOB_CREATED,
    JOB_STARTED,
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_CANCELLED,
    ASSET_CREATED,
    ASSET_DOWNLOADED,
)
from pixsim_logging import configure_logging

logger = configure_logging("events")


# ===== EVENT METRICS =====

class EventMetrics:
    """
    Track event counts and patterns for monitoring

    Useful for:
    - Admin dashboard (show event counts)
    - Health monitoring (detect anomalies)
    - Analytics (user activity patterns)
    """

    def __init__(self):
        self.counts: Dict[str, int] = defaultdict(int)
        self.first_seen: Dict[str, datetime] = {}
        self.last_seen: Dict[str, datetime] = {}

    async def track_event(self, event: Event) -> None:
        """Track event occurrence"""
        event_type = event.event_type

        # Increment counter
        self.counts[event_type] += 1

        # Track first/last seen
        if event_type not in self.first_seen:
            self.first_seen[event_type] = event.timestamp
        self.last_seen[event_type] = event.timestamp

        # Log milestone counts (every 100th event)
        count = self.counts[event_type]
        if count % 100 == 0:
            logger.info(
                "event_milestone",
                event_type=event_type,
                count=count,
                first_seen=self.first_seen[event_type].isoformat(),
            )

    def get_stats(self) -> Dict[str, any]:
        """Get current metrics"""
        return {
            "total_events": sum(self.counts.values()),
            "by_type": dict(self.counts),
            "unique_types": len(self.counts),
        }


# Global metrics instance
_event_metrics = EventMetrics()


def get_event_metrics() -> EventMetrics:
    """Get the global event metrics tracker"""
    return _event_metrics


# ===== WEBHOOK DISPATCHER =====

async def dispatch_webhooks(event: Event) -> None:
    """
    Dispatch events to registered webhooks

    TODO: Implement webhook dispatching
    - Fetch webhook URLs from database/config
    - Filter by event type subscriptions
    - Send HTTP POST with event data
    - Handle retries and failures
    - Track delivery status

    Future enhancement for:
    - Zapier/Make integrations
    - Custom user webhooks
    - Third-party service notifications
    - Discord/Slack bots
    """
    # Placeholder for webhook implementation
    # logger.debug(f"Webhook dispatch for {event.event_type} (not implemented)")
    pass


# ===== AUDIT TRAIL =====

async def store_audit_event(event: Event) -> None:
    """
    Store events in audit trail database

    TODO: Implement audit trail storage
    - Create EventLog table (separate from log_entries)
    - Store full event data as JSONB
    - Index by event_type, timestamp, user_id
    - Retention policy (30 days? 90 days?)

    Useful for:
    - Compliance/audit requirements
    - User activity history
    - Debugging production issues
    - Data recovery
    """
    # Placeholder for audit storage
    pass


# ===== ANALYTICS =====

async def track_analytics(event: Event) -> None:
    """
    Send events to analytics platform

    TODO: Implement analytics tracking
    - Send to analytics service (Mixpanel, Amplitude, PostHog, etc.)
    - Track user behavior patterns
    - A/B test event tracking
    - Funnel analysis

    Examples:
    - job:created → Track generation requests by provider/model
    - job:completed → Track success rate by provider
    - asset:downloaded → Track download patterns
    """
    # Placeholder for analytics
    pass


# ===== NOTIFICATIONS =====

async def send_notifications(event: Event) -> None:
    """
    Send user notifications based on events

    TODO: Implement notification system
    - Email notifications (job completed, errors)
    - Push notifications (mobile app)
    - In-app notifications
    - SMS alerts (critical errors)

    Examples:
    - job:completed → Email with download link
    - job:failed → Alert user about failure
    - account:exhausted → Notify to add credits
    """
    # Placeholder for notifications
    pass


# ===== HANDLER REGISTRATION =====

def register_handlers() -> None:
    """
    Register all event handlers

    Called during application startup (main.py lifespan)
    """
    logger.info("Registering event handlers...")

    # Register metrics tracker for ALL events
    event_bus.subscribe("*", _event_metrics.track_event)
    logger.info("✓ Event metrics tracker registered")

    # Register webhook dispatcher for all events
    # event_bus.subscribe("*", dispatch_webhooks)
    # logger.info("✓ Webhook dispatcher registered")

    # Register specific handlers
    # event_bus.subscribe(JOB_CREATED, store_audit_event)
    # event_bus.subscribe(JOB_COMPLETED, track_analytics)
    # event_bus.subscribe(JOB_COMPLETED, send_notifications)
    # event_bus.subscribe(JOB_FAILED, send_notifications)

    logger.info(f"Event handlers registered: {len(event_bus._handlers)} event types")


# ===== UTILITY FUNCTIONS =====

def get_handler_stats() -> Dict[str, any]:
    """
    Get statistics about registered handlers

    Useful for admin dashboard
    """
    return {
        "registered_event_types": len(event_bus._handlers),
        "wildcard_handlers": len(event_bus._wildcard_handlers),
        "event_metrics": _event_metrics.get_stats(),
    }
