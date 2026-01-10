"""
Webhook Dispatcher Handler Plugin

Dispatches events to registered webhook URLs for integrations.
Auto-discovered and registered via event handler plugin system.

Implementation notes:
- Webhook targets are configured via application settings (webhook_config_json).
- Outbound requests are validated to avoid private/loopback targets by default.
- Payloads can be HMAC-signed for integrity verification.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import socket
from ipaddress import ip_address
from typing import List, Optional
from urllib.parse import urlparse

from datetime import datetime, timezone

import httpx
from pydantic import BaseModel, Field, ValidationError

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.logging import get_event_logger
from pixsim7.backend.main.shared.retry_utils import (
    with_retry,
    RetryConfig,
    is_retryable_http_status,
)


# ===== HANDLER MANIFEST =====

class EventHandlerManifest(BaseModel):
    """Manifest for event handler plugins"""
    id: str
    name: str
    version: str
    description: str
    author: str
    enabled: bool = True
    subscribe_to: str = "*"


manifest = EventHandlerManifest(
    id="webhooks",
    name="Webhook Dispatcher",
    version="1.0.0",
    description="Dispatches events to registered webhook URLs for third-party integrations (Zapier, Discord, Slack, etc.)",
    author="PixSim Team",
    enabled=False,  # Disabled until implemented
    subscribe_to="*",  # Subscribe to all events (can be filtered per webhook config)
)


class WebhookConfig(BaseModel):
    """Runtime configuration for a single webhook endpoint."""

    url: str = Field(..., description="Destination URL for the webhook POST")
    event_types: Optional[List[str]] = Field(
        default=None,
        description="Optional list of event types to subscribe to (e.g., 'job:completed'). None or ['*'] means all events.",
    )
    retry_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Max retry attempts for this webhook. Defaults to settings.webhook_max_retries if not set.",
    )
    timeout: Optional[int] = Field(
        default=None,
        ge=1,
        description="Timeout in seconds for this webhook. Defaults to settings.webhook_timeout_seconds if not set.",
    )
    secret: Optional[str] = Field(
        default=None,
        description="Optional per-webhook HMAC secret. Overrides settings.webhook_hmac_secret when set.",
    )


def _load_webhook_configs() -> List[WebhookConfig]:
    """Load webhook configurations from settings.webhook_config_json."""
    logger = configure_logging("event_handler.webhooks")

    raw = settings.webhook_config_json
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Invalid webhook_config_json JSON", error=str(exc))
        return []

    if not isinstance(data, list):
        logger.error("webhook_config_json must be a JSON array")
        return []

    configs: List[WebhookConfig] = []
    for idx, item in enumerate(data):
        try:
            configs.append(WebhookConfig.model_validate(item))
        except ValidationError as exc:
            logger.error(
                "Invalid webhook config entry",
                index=idx,
                error=str(exc),
            )
    return configs


def _url_allows_public_http(url: str) -> bool:
    """
    Validate that the URL uses http/https and does not resolve to private or loopback addresses
    when webhook_block_private_networks is enabled.
    """
    logger = configure_logging("event_handler.webhooks")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        logger.warning("Webhook URL rejected due to unsupported scheme", url=url)
        return False

    host = parsed.hostname
    if not host:
        logger.warning("Webhook URL rejected due to missing hostname", url=url)
        return False

    # Resolve host to IPs and apply basic SSRF protections
    try:
        addr_info = socket.getaddrinfo(host, parsed.port or 80, proto=socket.IPPROTO_TCP)
    except Exception as exc:
        logger.warning("Webhook URL DNS resolution failed", url=url, error=str(exc))
        return False

    block_private = settings.webhook_block_private_networks

    for _, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        ip = ip_address(ip_str)

        if block_private and (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            logger.warning(
                "Webhook URL rejected due to non-public IP",
                url=url,
                ip=ip_str,
            )
            return False

        # Explicitly block common metadata service IPs
        if ip_str == "169.254.169.254":
            logger.warning(
                "Webhook URL rejected due to metadata IP",
                url=url,
                ip=ip_str,
            )
            return False

    return True


def _event_matches(config: WebhookConfig, event_type: str) -> bool:
    """Return True if this config is interested in the given event type."""
    if not config.event_types or "*" in config.event_types:
        return True
    return event_type in config.event_types


def _build_payload(event: Event) -> dict:
    """Build the JSON payload for webhook delivery."""
    timestamp = event.timestamp
    if not isinstance(timestamp, datetime):
        timestamp = datetime.now(tz=timezone.utc)

    return {
        "event_type": event.event_type,
        "event_id": event.event_id,
        "timestamp": timestamp.isoformat(),
        "data": event.data,
    }


def _build_signature_headers(body: bytes, event: Event, secret: Optional[str]) -> dict:
    """Return headers for HMAC-signed webhook payloads."""
    headers: dict = {}

    if not secret:
        return headers

    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    headers["X-PixSim7-Signature"] = f"sha256={digest}"
    if event.event_type:
        headers["X-PixSim7-Event-Type"] = event.event_type
    if event.event_id:
        headers["X-PixSim7-Event-ID"] = event.event_id

    return headers


# ===== WEBHOOK DELIVERY =====

async def _deliver_webhook_with_retry(
    url: str,
    body: bytes,
    headers: dict,
    timeout_seconds: int,
    max_retries: int,
    event_type: str,
    logger,
) -> None:
    """
    Deliver webhook with retries and exponential backoff.

    Preserves original semantics:
    - Only 2xx is success (3xx treated as failure)
    - Only retry on network errors or 5xx/429 (not 4xx client errors)
    - Swallow errors on exhaustion (log but don't raise)
    """

    async def send() -> httpx.Response:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(url, content=body, headers=headers)

            # Explicit 2xx check (original behavior: 3xx = failure)
            if not (200 <= response.status_code < 300):
                raise httpx.HTTPStatusError(
                    f"Non-2xx status: {response.status_code}",
                    request=response.request,
                    response=response,
                )
            return response

    def should_retry(exc: Exception) -> bool:
        """Only retry on network errors or retryable HTTP status (5xx, 429)."""
        if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
            return True
        if isinstance(exc, httpx.HTTPStatusError):
            return is_retryable_http_status(exc.response.status_code)
        return False

    try:
        response = await with_retry(
            send,
            config=RetryConfig(
                max_attempts=max_retries + 1,  # max_retries=3 means 4 total attempts
                backoff_base=1.0,
                backoff_max=30.0,
                retryable=(httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError),
            ),
            should_retry=should_retry,
            on_retry=lambda attempt, exc, delay: logger.warning(
                "Webhook delivery retry",
                url=url,
                event_type=event_type,
                attempt=attempt,
                error=str(exc),
                next_delay=f"{delay:.1f}s",
            ),
        )

        logger.info(
            "Webhook delivered",
            url=url,
            event_type=event_type,
            status_code=response.status_code,
        )

    except Exception as exc:
        # Exhausted retries or non-retryable error - log and swallow (original behavior)
        logger.error(
            "Webhook delivery failed",
            url=url,
            event_type=event_type,
            error=str(exc),
            max_retries=max_retries,
        )


# ===== EVENT HANDLER =====

async def handle_event(event: Event) -> None:
    """
    Dispatch event to registered webhooks

    Implementation:
    1. Load webhook configs from settings (webhook_config_json).
    2. Filter webhooks by event type subscription.
    3. For each matching webhook:
       - Validate URL and destination IP.
       - Build JSON payload.
       - Optionally sign payload with HMAC.
       - Send HTTP POST with timeout and retries.
    4. Log delivery outcomes for observability.

    Example webhook config:
    {
        "url": "https://hooks.slack.com/services/...",
        "event_types": ["job:completed", "job:failed"],
        "retry_count": 3,
        "timeout": 5
    }

    Use cases:
    - Zapier/Make integrations
    - Discord/Slack notifications
    - Custom user webhooks
    - Third-party service notifications
    """
    logger = configure_logging("event_handler.webhooks")

    configs = _load_webhook_configs()
    if not configs:
        return

    matching = [cfg for cfg in configs if _event_matches(cfg, event.event_type)]

    if not matching:
        return

    payload = _build_payload(event)
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")

    for cfg in matching:
        if not _url_allows_public_http(cfg.url):
            continue

        timeout_seconds = cfg.timeout or settings.webhook_timeout_seconds
        max_retries = cfg.retry_count if cfg.retry_count is not None else settings.webhook_max_retries
        secret = cfg.secret or settings.webhook_hmac_secret

        headers = {
            "Content-Type": "application/json",
        }
        headers.update(_build_signature_headers(body, event, secret))

        await _deliver_webhook_with_retry(
            url=cfg.url,
            body=body,
            headers=headers,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            event_type=event.event_type,
            logger=logger,
        )


# ===== LIFECYCLE HOOKS =====

def on_register():
    """Called when handler is registered"""
    logger = configure_logging("event_handler.webhooks")
    logger.info("Webhook dispatcher registered (disabled - not implemented)")


def on_unregister():
    """Called when handler is unregistered"""
    logger = configure_logging("event_handler.webhooks")
    logger.info("Webhook dispatcher unregistered")
