"""Keep the image embedding daemon's hosted set in sync with the instances.

The daemon serves an allowed *set* of models (c3); a per-instance model_id
outside it is rejected (409). Rather than hand-maintaining that set via env, we
derive it from the enabled ``asset:embedding`` instances — the configured source
of truth — and push it to the daemon. The daemon unions it with its env baseline
and starts serving the model without a restart.

Best-effort by design: if the daemon is unreachable the push is skipped (the
daemon keeps its current/env set); callers must never let a sync failure break
the instance write or startup.
"""
from __future__ import annotations

import os

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain.providers.models.provider_instance_config import (
    ProviderInstanceConfig,
    ProviderInstanceConfigKind,
)

logger = configure_logging("service.embedding")

EMBEDDING_ANALYZER_ID = "asset:embedding"
_DEFAULT_URL = "http://localhost:8002"


async def compute_desired_embedding_models(db: AsyncSession) -> list[str]:
    """Distinct model_ids of the enabled asset:embedding instances."""
    stmt = (
        select(ProviderInstanceConfig.model_id)
        .where(ProviderInstanceConfig.kind == ProviderInstanceConfigKind.ANALYZER)
        .where(ProviderInstanceConfig.analyzer_id == EMBEDDING_ANALYZER_ID)
        .where(ProviderInstanceConfig.enabled.is_(True))
        .where(ProviderInstanceConfig.model_id.is_not(None))
        .distinct()
    )
    result = await db.execute(stmt)
    return sorted({m for m in result.scalars().all() if m})


async def compute_desired_default_model(db: AsyncSession) -> str | None:
    """The active embedder's model — the one the daemon should keep warm.

    Mirrors the app's "active instance" pick: the enabled, on_ingest
    asset:embedding instance (primary first, then priority). None when there's
    no active embedder, in which case the daemon keeps its startup default."""
    stmt = (
        select(ProviderInstanceConfig.model_id)
        .where(ProviderInstanceConfig.kind == ProviderInstanceConfigKind.ANALYZER)
        .where(ProviderInstanceConfig.analyzer_id == EMBEDDING_ANALYZER_ID)
        .where(ProviderInstanceConfig.enabled.is_(True))
        .where(ProviderInstanceConfig.on_ingest.is_(True))
        .where(ProviderInstanceConfig.model_id.is_not(None))
        .order_by(
            ProviderInstanceConfig.is_primary.desc(),
            ProviderInstanceConfig.priority.desc(),
            ProviderInstanceConfig.id.desc(),
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def push_allowed_models(model_ids: list[str], default: str | None = None) -> bool:
    """POST the allowed set (and optional default) to the daemon. False on any
    failure."""
    base_url = os.environ.get("PIXSIM_EMBEDDING_BASE_URL", _DEFAULT_URL).rstrip("/")
    payload: dict = {"model_ids": model_ids}
    if default:
        payload["default"] = default
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)
        ) as client:
            resp = await client.post(
                f"{base_url}/config/allowed-models",
                json=payload,
                headers={
                    "X-PixSim-Caller": "backend:embedding_daemon_sync",
                    "X-PixSim-Request-Kind": "config_allowed_models",
                    "X-PixSim-Item-Count": str(len(model_ids)),
                },
            )
        if resp.status_code != 200:
            logger.warning(
                "embedding_daemon_sync_rejected status=%s body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        return True
    except httpx.HTTPError as exc:
        logger.info("embedding_daemon_sync_unreachable error=%s", str(exc))
        return False


async def sync_embedding_daemon_models(db: AsyncSession) -> bool:
    """Derive the hosted set + default from instances and push them. Best-effort.

    Never raises — a sync failure (daemon down, etc.) must not break the caller
    (an instance write or backend startup). Returns whether the push landed.
    """
    try:
        desired = await compute_desired_embedding_models(db)
        default = await compute_desired_default_model(db)
    except Exception as exc:  # noqa: BLE001 — advisory sync, never fatal
        logger.warning("embedding_daemon_sync_compute_failed error=%s", str(exc))
        return False
    return await push_allowed_models(desired, default)
