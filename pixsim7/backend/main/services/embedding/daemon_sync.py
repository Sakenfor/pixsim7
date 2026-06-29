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
_DEFAULT_TEXT_URL = "http://localhost:8003"
TEXT_EMBED_MODEL_ENV = "PIXSIM_TEXT_EMBED_MODEL"
_DEFAULT_TEXT_MODEL = "BAAI/bge-base-en-v1.5"


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


# ── text embedding daemon (single model) ─────────────────────────────────────
#
# The text daemon serves one model and warm-swaps it on POST /config. This is
# the single-model analog of push_allowed_models; it intentionally mirrors that
# function's shape (best-effort, caller headers) — they could share transport
# once both settle.


async def push_text_embedding_model(model_id: str) -> bool:
    """POST the served model to the text-embedding daemon's /config. Best-effort:
    False (never raises) if the model is empty or the daemon is unreachable /
    rejects it. The daemon warm-swaps without a restart."""
    if not model_id:
        return False
    base_url = os.environ.get(
        "PIXSIM_TEXT_EMBEDDING_BASE_URL", _DEFAULT_TEXT_URL
    ).rstrip("/")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)
        ) as client:
            resp = await client.post(
                f"{base_url}/config",
                json={"model": model_id},
                headers={
                    "X-PixSim-Caller": "backend:text_embedding_daemon_sync",
                    "X-PixSim-Request-Kind": "config_text_model",
                },
            )
        if resp.status_code != 200:
            logger.warning(
                "text_embedding_daemon_sync_rejected status=%s body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        return True
    except httpx.HTTPError as exc:
        logger.info("text_embedding_daemon_sync_unreachable error=%s", str(exc))
        return False


def compute_desired_text_embedding_model() -> str:
    """The HF model id the text daemon should serve.

    Today this reads ``PIXSIM_TEXT_EMBED_MODEL`` (matching what the daemon loads
    at startup). Plan analyzer-preset-driven-embedder-config (p5) replaces this
    with the DB/analyzer-preset-resolved model, so changing the active text
    embedder re-pushes here and the daemon warm-swaps without a restart."""
    return os.environ.get(TEXT_EMBED_MODEL_ENV, _DEFAULT_TEXT_MODEL)


async def sync_text_embedding_daemon() -> bool:
    """Push the desired served model to the text daemon. Best-effort, never
    raises. Returns whether the push landed."""
    return await push_text_embedding_model(compute_desired_text_embedding_model())
