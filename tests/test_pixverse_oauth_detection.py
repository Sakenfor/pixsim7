import types

import pytest

from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider


class DummyAccount:
    """Lightweight stand-in for ProviderAccount for _try_auto_reauth tests."""

    def __init__(self, *, email="user@example.com", password="secret", provider_metadata=None):
        self.id = 1
        self.email = email
        self.password = password
        self.provider_metadata = provider_metadata or {}
        self.jwt_token = None
        self.cookies = {}


@pytest.mark.asyncio
async def test_try_auto_reauth_marks_oauth_only_and_clears_password(monkeypatch):
    """_try_auto_reauth should mark accounts as GOOGLE and clear password on OAuth-only error."""

    provider = PixverseProvider()
    account = DummyAccount(
        email="oauth-only@example.com",
        password="secret",
        provider_metadata={},
    )

    # Stub provider settings loader to enable auto-reauth
    def _fake_load_settings():
        ns = types.SimpleNamespace(auto_reauth_enabled=True, global_password=None)
        return {provider.provider_id: ns}

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.providers._load_provider_settings",
        _fake_load_settings,
    )

    # Fake PixverseAuthService that always raises the OAuth-only message
    class FakeAuthService:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def login_with_password(self, email, password, headless=True, timeout_ms=60_000):
            raise Exception(
                "Login failed: Please sign in via OAuth (Google, Discord, Apple) to set up your initial password."
            )

    import pixsim7.backend.main.services.provider.pixverse_auth_service as pas

    monkeypatch.setattr(pas, "PixverseAuthService", FakeAuthService)

    # Avoid touching a real database session from _persist_account_credentials
    async def _fake_persist(account_obj):
        return

    monkeypatch.setattr(provider, "_persist_account_credentials", _fake_persist)

    success = await provider._try_auto_reauth(account)

    # Auto-reauth should be reported as failed
    assert success is False

    # Account should now be tagged as OAuth-only
    assert account.provider_metadata.get("auth_method") == PixverseAuthMethod.GOOGLE.value

    # Password should be cleared so future auto-reauth is skipped
    assert account.password is None

