"""
Asset Ingestion Event Handler Plugin

Listens for asset:created events and triggers media ingestion
when enabled in settings.

Ingestion includes:
- Downloading from provider CDN
- Storing in local/cloud storage
- Extracting metadata (dimensions, duration)
- Generating thumbnails
"""
import asyncio
from typing import Optional
from pydantic import BaseModel

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.services.asset.events import ASSET_CREATED
from pixsim_logging import get_logger

logger = get_logger()


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
    id="ingestion",
    name="Asset Ingestion Handler",
    version="1.0.0",
    description="Triggers media ingestion pipeline when assets are created",
    author="PixSim Team",
    enabled=True,
    subscribe_to=ASSET_CREATED,  # Only listen to asset:created events
)


# ===== EVENT HANDLER =====

# Semaphore for concurrency control
_ingestion_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    """Get or create ingestion semaphore."""
    global _ingestion_semaphore
    if _ingestion_semaphore is None:
        from pixsim7.backend.main.services.media import get_media_settings
        settings = get_media_settings()
        _ingestion_semaphore = asyncio.Semaphore(settings.concurrency_limit)
    return _ingestion_semaphore


async def handle_event(event: Event) -> None:
    """
    Handle asset:created events.

    Checks if ingestion is enabled and queues the asset for processing.
    """
    # Only handle asset:created events
    if event.event_type != ASSET_CREATED:
        return

    try:
        from pixsim7.backend.main.services.media import get_media_settings

        settings = get_media_settings()

        # Check if auto-ingestion is enabled
        if not settings.ingest_on_asset_add:
            logger.debug(
                "ingestion_skipped_disabled",
                asset_id=event.data.get("asset_id"),
                detail="ingest_on_asset_add is disabled"
            )
            return

        asset_id = event.data.get("asset_id")
        if not asset_id:
            logger.warning(
                "ingestion_skipped_no_asset_id",
                event_data=event.data
            )
            return

        # Queue ingestion (runs in background)
        asyncio.create_task(_ingest_asset_background(asset_id))

        logger.debug(
            "ingestion_queued",
            asset_id=asset_id,
        )

    except Exception as e:
        logger.error(
            "ingestion_handler_error",
            event_type=event.event_type,
            error=str(e),
            exc_info=True
        )


async def _ingest_asset_background(
    asset_id: int,
    *,
    _retry: int = 0,
    _max_retries: int = 2,
) -> None:
    """
    Background task to ingest an asset.

    Uses semaphore for concurrency control.  On failure (typically CDN 404
    for not-yet-propagated videos) schedules a delayed retry so the asset
    isn't permanently stuck in FAILED state.
    """
    semaphore = _get_semaphore()
    failed = False

    async with semaphore:
        try:
            from pixsim7.backend.main.infrastructure.database.session import get_async_session
            from pixsim7.backend.main.services.asset import AssetIngestionService

            async with get_async_session() as db:
                service = AssetIngestionService(db)
                await service.ingest_asset(asset_id, force=(_retry > 0))

        except Exception as e:
            failed = True
            logger.error(
                "background_ingestion_failed",
                asset_id=asset_id,
                retry=_retry,
                error=str(e),
            )

    # Schedule delayed retry OUTSIDE the semaphore so other ingestions
    # aren't blocked during the wait.
    if failed and _retry < _max_retries:
        delay = 60 * (_retry + 1)  # 60s, 120s
        logger.info(
            "ingestion_retry_scheduled",
            asset_id=asset_id,
            retry=_retry + 1,
            delay_sec=delay,
        )
        await asyncio.sleep(delay)
        asyncio.create_task(
            _ingest_asset_background(
                asset_id,
                _retry=_retry + 1,
                _max_retries=_max_retries,
            )
        )


# ===== LIFECYCLE HOOKS =====

def on_register():
    """Called when handler is registered."""
    logger.info(
        "ingestion_handler_registered",
        msg="Asset ingestion handler registered"
    )


def on_unregister():
    """Called when handler is unregistered."""
    logger.info(
        "ingestion_handler_unregistered",
        msg="Asset ingestion handler unregistered"
    )
