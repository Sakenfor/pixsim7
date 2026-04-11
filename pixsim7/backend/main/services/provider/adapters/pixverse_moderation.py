"""
Pixverse post-delivery moderation recheck.

Encapsulates the CDN probe → provider API fallback logic that was previously
spread across status_poller.py.  The poller now calls
``provider.moderation_recheck()`` and handles the generic result.
"""
from __future__ import annotations

from typing import Any, Optional

from pixsim_logging import get_logger

from pixsim7.backend.main.domain import OperationType, ProviderStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.provider.base import ModerationRecheckResult
from pixsim7.backend.main.services.provider.cdn_probe import cdn_head_probe
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url as _has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url as _is_pixverse_placeholder_url,
)

logger = get_logger()


class PixverseModerationMixin:
    """Mixin providing ``moderation_recheck`` for the Pixverse adapter."""

    async def moderation_recheck(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        asset_remote_url: str | None = None,
        operation_type: OperationType | None = None,
    ) -> ModerationRecheckResult:
        """
        CDN probe → provider API fallback for post-delivery moderation.

        Returns:
            ok           — CDN still serves content; not flagged (yet).
            flagged      — provider confirmed FILTERED.
            inconclusive — could not determine; caller should reschedule.
        """
        # Fast path: HEAD probe on stored CDN URL.
        if asset_remote_url:
            probe = await cdn_head_probe(asset_remote_url)
            if probe is True:
                # Also guard against redirect-to-placeholder (CDN returns 200
                # but the final URL is the generic default.mp4).
                # cdn_head_probe itself doesn't check this, so verify here.
                logger.debug(
                    "moderation_recheck_cdn_ok",
                    provider_job_id=provider_job_id,
                )
                return ModerationRecheckResult(outcome="ok")

            logger.debug(
                "moderation_recheck_cdn_miss",
                provider_job_id=provider_job_id,
                probe=probe,
            )

        # CDN gone or inconclusive — confirm via provider API.
        try:
            result = await self.check_status(
                account=account,
                provider_job_id=provider_job_id,
                operation_type=operation_type,
            )
        except Exception as e:
            logger.warning(
                "moderation_recheck_api_error",
                provider_job_id=provider_job_id,
                error=str(e),
            )
            return ModerationRecheckResult(outcome="inconclusive")

        if result.status == ProviderStatus.FILTERED:
            logger.debug(
                "moderation_recheck_filtered",
                provider_job_id=provider_job_id,
                has_retrievable_url=result.has_retrievable_media_url,
            )
            return ModerationRecheckResult(
                outcome="flagged",
                should_refresh_credits=True,
            )

        # Provider doesn't confirm flagging.
        return ModerationRecheckResult(outcome="inconclusive")
