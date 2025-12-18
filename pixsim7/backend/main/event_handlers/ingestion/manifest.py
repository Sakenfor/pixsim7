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

from pixsim7.backend.main.infrastructure.events.bus import Event, ASSET_CREATED
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
        from pixsim7.backend.main.services.asset import get_media_settings
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
        from pixsim7.backend.main.services.asset import get_media_settings

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


async def _ingest_asset_background(asset_id: int) -> None:
    """
    Background task to ingest an asset.

    Uses semaphore for concurrency control.
    """
    semaphore = _get_semaphore()

    async with semaphore:
        try:
            # Import here to avoid circular imports
            from pixsim7.backend.main.infrastructure.database.session import get_async_session
            from pixsim7.backend.main.services.asset import AssetIngestionService

            async with get_async_session() as db:
                service = AssetIngestionService(db)
                await service.ingest_asset(asset_id)

        except Exception as e:
            logger.error(
                "background_ingestion_failed",
                asset_id=asset_id,
                error=str(e),
                exc_info=True
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
