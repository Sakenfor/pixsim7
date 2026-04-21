"""
Backend-side implementations of pixsim7.automation.protocols.

This is the ONE direction of import we allow: backend → automation. Automation
code never imports from backend. Binding happens in lifespan (main.py) and in
the automation-worker startup — both call bind_automation_capabilities().

Adapters are thin: map SQLModel rows to frozen snapshot DTOs, delegate the
actual I/O to existing backend services. The fallback logic (e.g., account
password → provider global password) lives here, not in automation.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Sequence

from sqlalchemy import select

from pixsim7.automation.locator import (
    bind_account_lookup,
    bind_job_queue,
    bind_path_registry,
    bind_provider_metadata,
)
from pixsim7.automation.protocols import (
    AccountSnapshot,
    PixverseAdTask,
)
from pixsim7.backend.main.domain.enums import AccountStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.infrastructure.queue import (
    AUTOMATION_QUEUE_NAME,
    queue_task,
)
from pixsim7.backend.main.shared.path_registry import get_path_registry as _get_backend_path_registry


# ── Account lookup ──

class BackendAccountLookup:
    """Resolves ProviderAccount rows to AccountSnapshot, with password fallback."""

    async def get(self, account_id: int) -> Optional[AccountSnapshot]:
        async for db in get_db():
            account = await db.get(ProviderAccount, account_id)
            if account is None:
                return None
            return _to_snapshot(account, self._resolve_password(account))
        return None  # pragma: no cover — get_db always yields at least once

    async def list_active(
        self,
        *,
        provider_id: Optional[str] = None,
        account_ids: Optional[Sequence[int]] = None,
        exclude_account_ids: Optional[Sequence[int]] = None,
    ) -> list[AccountSnapshot]:
        async for db in get_db():
            query = select(ProviderAccount).where(
                ProviderAccount.status == AccountStatus.ACTIVE
            )
            if provider_id is not None:
                query = query.where(ProviderAccount.provider_id == provider_id)
            if account_ids:
                query = query.where(ProviderAccount.id.in_(list(account_ids)))
            if exclude_account_ids:
                query = query.where(~ProviderAccount.id.in_(list(exclude_account_ids)))

            result = await db.execute(query)
            accounts = result.scalars().all()
            return [_to_snapshot(a, self._resolve_password(a)) for a in accounts]
        return []  # pragma: no cover

    @staticmethod
    def _resolve_password(account: ProviderAccount) -> Optional[str]:
        """Account password → provider global_password fallback.

        Centralized here so automation never touches provider settings.
        """
        if account.password:
            return account.password
        try:
            from pixsim7.backend.main.api.v1.providers import _load_provider_settings
            settings_map = _load_provider_settings()
            settings = settings_map.get(account.provider_id)
            if settings and settings.global_password:
                return settings.global_password
        except Exception:
            pass
        return None


def _to_snapshot(account: ProviderAccount, resolved_password: Optional[str]) -> AccountSnapshot:
    return AccountSnapshot(
        id=account.id,
        email=account.email,
        provider_id=account.provider_id,
        resolved_password=resolved_password,
    )


# ── Provider metadata ──

class BackendProviderMetadata:
    """Per-provider runtime data (currently Pixverse ad tasks only)."""

    async def pixverse_ad_task(self, account_id: int) -> Optional[PixverseAdTask]:
        try:
            from pixsim7.backend.main.services.provider import registry as provider_registry
            async for db in get_db():
                account = await db.get(ProviderAccount, account_id)
                if account is None:
                    return None
                provider = provider_registry.get("pixverse")
                if not hasattr(provider, "get_ad_watch_task"):
                    return None
                ad_task = await provider.get_ad_watch_task(
                    account, retry_on_session_error=False
                )
                if not isinstance(ad_task, dict):
                    return None
                return PixverseAdTask(
                    total_counts=_as_int(ad_task.get("total_counts")),
                    progress=_as_int(ad_task.get("progress")),
                    completed_counts=_as_int(ad_task.get("completed_counts")),
                )
        except Exception:
            return None
        return None


def _as_int(value: object) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


# ── Job queue ──

class ArqJobQueue:
    """Enqueues process_automation jobs to the AUTOMATION_QUEUE_NAME arq queue."""

    async def enqueue_automation(self, execution_id: int) -> str:
        return await queue_task(
            "process_automation",
            execution_id,
            queue_name=AUTOMATION_QUEUE_NAME,
        )


# ── Path registry ──

class BackendPathRegistry:
    """Forwards the one path automation needs from backend's path registry."""

    @property
    def automation_screenshots_root(self) -> Path:
        return _get_backend_path_registry().automation_screenshots_root


# ── Binding ──

def bind_automation_capabilities() -> None:
    """Bind concrete adapters into pixsim7.automation.locator.

    Idempotent — uses locator's replace=True default. Called from main-api
    lifespan (main.py) and automation-worker startup (arq_worker.py).
    """
    bind_account_lookup(BackendAccountLookup())
    bind_provider_metadata(BackendProviderMetadata())
    bind_job_queue(ArqJobQueue())
    bind_path_registry(BackendPathRegistry())
