"""
Asset Ingestion Event Handler Plugin

Listens for asset:created events and enqueues media ingestion as an ARQ job
when enabled in settings.

Ingestion includes:
- Downloading from provider CDN
- Storing in local/cloud storage
- Extracting metadata (dimensions, duration)
- Generating thumbnails

The actual work runs in the ARQ worker via ``process_ingestion``.  Routing
through ARQ (with a unique job_id keyed on ``asset_id``) gives us
deduplication: if a second event for the same asset fires while ingestion is
already in flight, the second enqueue is a no-op.  Retry/backoff comes from
the worker's ``max_tries`` + ``retry_jobs`` settings, replacing the in-process
semaphore + ``asyncio.sleep`` retry chain that previously lived here.
"""
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
    version="1.1.0",
    description="Enqueues media ingestion (ARQ job) when assets are created",
    author="PixSim Team",
    enabled=True,
    subscribe_to=ASSET_CREATED,  # Only listen to asset:created events
)


# ===== EVENT HANDLER =====

async def handle_event(event: Event) -> None:
    """
    Handle asset:created events.

    Checks if ingestion is enabled and enqueues an ARQ job for the asset.
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

        from pixsim7.backend.main.infrastructure.queue.tasks import queue_task

        # Unique job_id per asset gives ARQ-level dedup: a concurrent
        # asset:created (or any other enqueuer) for the same asset that
        # hits Redis while a job is already queued/in-flight is a no-op.
        await queue_task(
            "process_ingestion",
            asset_id,
            _job_id=f"ingest:{asset_id}",
        )

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
