"""
Ingestion processor worker — runs the full ``AssetIngestionService.ingest_asset``
pipeline as an ARQ job.

Replaces the in-process ``asyncio.create_task(_ingest_asset_background(...))``
fire-and-forget pattern that the ``asset:created`` event handler used to use,
and the inline ``service.ingest_asset(...)`` call in the
``/media/ingestion/trigger/{asset_id}`` API endpoint.

Routing through ARQ (with a unique job_id keyed on ``asset_id``) gives us:

- **Deduplication**: a second enqueue for the same asset while a job is in
  flight is a no-op.  Concurrent triggers (event handler + API request) attach
  to the same job instead of racing on the same content-addressed file.
- **Retry/backoff** via the worker's ``max_tries`` + ``retry_jobs`` settings.
- **Cross-process** ownership: ingestion always runs in the worker, never in
  the API request loop, so we have a single writer per asset.

Selective regeneration flags (``store_for_serving``, ``extract_metadata``,
``generate_thumbnails``, ``generate_previews``) are forwarded to
``ingest_asset`` so the API trigger can scope the work — for example
"regenerate thumbnails only" without re-storing.
"""
from __future__ import annotations

from typing import Optional

from pixsim7.backend.main.workers.asset_job import run_asset_job


async def process_ingestion(
    ctx: dict,
    asset_id: int,
    *,
    force: bool = False,
    store_for_serving: Optional[bool] = None,
    extract_metadata: bool = True,
    generate_thumbnails: Optional[bool] = None,
    generate_previews: Optional[bool] = None,
    derivatives_mode: str = "auto",
) -> dict:
    """Run ``AssetIngestionService.ingest_asset`` for ``asset_id`` under the
    shared asset-job envelope (logging, DB session, error classification,
    health tracker)."""
    return await run_asset_job(
        "ingestion",
        asset_id,
        operation=lambda service: service.ingest_asset(
            asset_id,
            force=force,
            store_for_serving=store_for_serving,
            extract_metadata=extract_metadata,
            generate_thumbnails=generate_thumbnails,
            generate_previews=generate_previews,
            derivatives_mode=derivatives_mode,
        ),
        success_payload=lambda asset: {
            "stored_key": asset.stored_key,
            "ingest_status": asset.ingest_status,
            "thumbnail_key": asset.thumbnail_key,
            "preview_key": asset.preview_key,
        },
        extra_log_fields={
            "force": force,
            "store_for_serving": store_for_serving,
            "extract_metadata": extract_metadata,
            "generate_thumbnails": generate_thumbnails,
            "generate_previews": generate_previews,
            "derivatives_mode": derivatives_mode,
        },
    )
