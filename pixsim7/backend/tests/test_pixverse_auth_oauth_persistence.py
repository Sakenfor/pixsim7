from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.services.provider.adapters.pixverse_auth import (
    PixverseAuthMixin,
)


class _TestProvider(PixverseAuthMixin):
    provider_id = "pixverse"

    def _evict_account_cache(self, account) -> None:
        return None


@pytest.mark.asyncio
async def test_try_auto_reauth_marks_oauth_only_and_persists_before_rollback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _TestProvider()
    account = SimpleNamespace(
        id=2,
        email="oauth@example.com",
        password="old-password",
        provider_metadata={},
        jwt_token=None,
        cookies={},
    )

    class _Settings:
        auto_reauth_enabled = True
        global_password = None

    class _FailingAuthService:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def login_with_password(self, *args, **kwargs):
            raise RuntimeError(
                "Please sign in via OAuth (Google, Discord, Apple) to set up your initial password.",
            )

    persist_mock = AsyncMock(return_value=True)
    rollback_mock = AsyncMock()

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.providers._load_provider_settings",
        lambda: {"pixverse": _Settings()},
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.pixverse_auth_service.PixverseAuthService",
        _FailingAuthService,
    )
    monkeypatch.setattr(provider, "_persist_oauth_only_account_state", persist_mock)
    monkeypatch.setattr(provider, "_rollback_session_if_needed", rollback_mock)

    result = await provider._try_auto_reauth(account)

    assert result is False
    assert account.password is None
    assert account.provider_metadata["auth_method"] == PixverseAuthMethod.GOOGLE.value
    persist_mock.assert_awaited_once_with(account)
    rollback_mock.assert_awaited_once_with(account)


@pytest.mark.asyncio
async def test_persist_oauth_only_account_state_uses_isolated_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _TestProvider()
    account = SimpleNamespace(
        id=99,
        provider_metadata={"foo": "bar", "auth_method": PixverseAuthMethod.GOOGLE.value},
    )
    stored = SimpleNamespace(
        provider_metadata={"existing": "value"},
        password="to-be-cleared",
    )
    commit_probe = AsyncMock()

    class _FakeSession:
        async def get(self, model, account_id: int):
            assert account_id == 99
            return stored

        async def commit(self) -> None:
            await commit_probe()

    class _FakeSessionContext:
        async def __aenter__(self):
            return _FakeSession()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
        lambda: _FakeSessionContext(),
    )

    persisted = await provider._persist_oauth_only_account_state(account)

    assert persisted is True
    assert stored.password is None
    assert stored.provider_metadata["auth_method"] == PixverseAuthMethod.GOOGLE.value
    assert stored.provider_metadata["existing"] == "value"
    assert stored.provider_metadata["foo"] == "bar"
    assert commit_probe.await_count == 1
