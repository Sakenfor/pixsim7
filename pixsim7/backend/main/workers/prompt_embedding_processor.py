"""
Prompt embedding processor worker — embeds a single PromptVersion as an ARQ
job (plan: embedding-service-generalization, Phase C).

Routed through ARQ (job_id keyed on ``version_id``) for the same reasons as
prompt tagging: dedup of rapid re-saves, retry/backoff on the provider call,
and keeping the embedding provider call out of the API request loop.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.embedding.prompt_service import (
    PromptEmbeddingService,
    PromptVersionNotFoundError,
)
from pixsim7.backend.main.workers.asset_job import run_keyed_job
from pixsim_logging import get_logger

logger = get_logger()


async def _embed_version(db: AsyncSession, version_id: UUID) -> dict:
    service = PromptEmbeddingService(db)
    try:
        await service.embed_version(version_id)
    except PromptVersionNotFoundError as exc:
        # Surface as ValueError so run_keyed_job marks it skipped (no retry).
        raise ValueError(str(exc)) from exc
    return {"embedded": True}


async def process_prompt_embedding(ctx: dict, version_id: str) -> dict:
    """Embed a single prompt version.

    ``version_id`` is passed as a string so it survives ARQ's serialization
    cleanly; we coerce back to UUID inside the operation.
    """
    version_uuid = UUID(version_id)
    return await run_keyed_job(
        "prompt-embedding",
        "version_id",
        str(version_uuid),
        operation=lambda db: _embed_version(db, version_uuid),
    )
