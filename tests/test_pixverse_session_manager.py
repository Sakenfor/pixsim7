import types

import pytest

from pixsim7.backend.main.domain.provider_auth import (
    PixverseAuthMethod,
    SessionErrorOutcome,
)
from pixsim7.backend.main.services.provider.adapters import pixverse_session_manager
from pixsim7.backend.main.services.provider.adapters.pixverse_session_manager import (
    PixverseSessionManager,
)


class DummyAccount:
    def __init__(self, *, jwt_token="token", cookies=None, provider_metadata=None, api_keys=None, password="secret"):
        self.id = 1
        self.email = "user@example.com"
        self.jwt_token = jwt_token
        self.cookies = cookies or {}
        self.provider_metadata = provider_metadata or {}
        self.api_keys = api_keys or []
        # Simulate a stored password so that auto-reauth paths are allowed in tests
        self.password = password


class DummyProvider:
    def __init__(self):
        self.provider_id = "pixverse"
        self.persist_calls = []
        self.evict_calls = []
        self.reauth_calls = 0

    async def _persist_if_credentials_changed(self, account, *, previous_jwt, previous_cookies):
        self.persist_calls.append((previous_jwt, previous_cookies, account.jwt_token, account.cookies))

    def _evict_account_cache(self, account):
        self.evict_calls.append(account.id)

    async def _try_auto_reauth(self, account):
        self.reauth_calls += 1
        # Simulate successful reauth by changing JWT
        account.jwt_token = "new-token"
        return True


def test_auth_method_from_metadata():
    meta = {"auth_method": "password"}
    assert PixverseAuthMethod.from_metadata(meta) is PixverseAuthMethod.PASSWORD

    meta = {"auth_method": "google"}
    assert PixverseAuthMethod.from_metadata(meta) is PixverseAuthMethod.GOOGLE

    meta = {}
    assert PixverseAuthMethod.from_metadata(meta) is PixverseAuthMethod.UNKNOWN


def test_classify_error_sdk_session_invalid():
    provider = DummyProvider()
    manager = PixverseSessionManager(provider)

    err = Exception("user is not login, error 10003")
    outcome = manager.classify_error(err, context="get_credits")

    assert outcome.is_session_error
    assert outcome.should_invalidate_cache
    assert outcome.should_attempt_reauth
    assert outcome.error_code == "10003"
    assert outcome.error_reason == "user_not_login"


def test_classify_error_json_errcode():
    provider = DummyProvider()
    manager = PixverseSessionManager(provider)

    data = {"ErrCode": 10005, "ErrMsg": "logged in elsewhere"}
    outcome = manager.classify_error(data, context="ad_task_status_json")

    assert outcome.is_session_error
    assert outcome.should_invalidate_cache
    assert outcome.should_attempt_reauth
    assert outcome.error_code == "10005"
    assert outcome.error_reason == "logged_elsewhere"


@pytest.mark.asyncio
async def test_run_with_session_triggers_auto_reauth(monkeypatch):
    # Avoid depending on real JWT refresh logic
    monkeypatch.setattr(pixverse_session_manager, "needs_refresh", lambda token, hours_threshold=12: False)
    monkeypatch.setattr(pixverse_session_manager, "extract_jwt_from_cookies", lambda cookies: None)

    provider = DummyProvider()
    account = DummyAccount(
        jwt_token="old-token",
        cookies={"_ai_token": "old-token"},
        provider_metadata={"auth_method": PixverseAuthMethod.PASSWORD.value},
    )

    # Stub provider settings loader used inside the session manager
    def _fake_load_settings():
        ns = types.SimpleNamespace(auto_reauth_enabled=True, global_password=None)
        return {provider.provider_id: ns}

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.providers._load_provider_settings",
        _fake_load_settings,
    )

    manager = PixverseSessionManager(provider)

    call_counter = {"calls": 0}

    async def failing_then_succeeding_op(session):
        call_counter["calls"] += 1
        # First call simulates a session-invalid error; second call succeeds
        if call_counter["calls"] == 1:
            raise Exception("user is not login, error 10003")
        return {"ok": True, "jwt_source": session.get("jwt_source")}

    result = await manager.run_with_session(
        account=account,
        op_name="get_credits",
        operation=failing_then_succeeding_op,
        retry_on_session_error=True,
    )

    # Operation should have been called twice: initial + after successful reauth
    assert call_counter["calls"] == 2
    # Auto-reauth should have been attempted once
    assert provider.reauth_calls == 1
    # New JWT should have been written
    assert account.jwt_token == "new-token"
    # Result from second call should be returned
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_auto_reauth_skipped_when_no_passwords(monkeypatch):
    """Ensure auto-reauth is skipped when neither account nor global password is available."""
    # Avoid depending on real JWT refresh logic
    monkeypatch.setattr(pixverse_session_manager, "needs_refresh", lambda token, hours_threshold=12: False)
    monkeypatch.setattr(pixverse_session_manager, "extract_jwt_from_cookies", lambda cookies: None)

    provider = DummyProvider()
    # Auth method allows password reauth, but neither account nor global password is set
    account = DummyAccount(
        jwt_token="old-token",
        cookies={"_ai_token": "old-token"},
        provider_metadata={"auth_method": PixverseAuthMethod.PASSWORD.value},
        password=None,
    )

    # Stub provider settings loader used inside the session manager
    def _fake_load_settings():
        ns = types.SimpleNamespace(auto_reauth_enabled=True, global_password=None)
        return {provider.provider_id: ns}

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.providers._load_provider_settings",
        _fake_load_settings,
    )

    manager = PixverseSessionManager(provider)

    async def failing_op(session):
        raise Exception("user is not login, error 10003")

    with pytest.raises(Exception):
        await manager.run_with_session(
            account=account,
            op_name="get_credits",
            operation=failing_op,
            retry_on_session_error=True,
        )

    # Auto-reauth should have been skipped entirely due to missing account+global password
    assert provider.reauth_calls == 0


@pytest.mark.asyncio
async def test_auto_reauth_allowed_with_global_password(monkeypatch):
    """Ensure auto-reauth is allowed when only a global password is configured."""
    # Avoid depending on real JWT refresh logic
    monkeypatch.setattr(pixverse_session_manager, "needs_refresh", lambda token, hours_threshold=12: False)
    monkeypatch.setattr(pixverse_session_manager, "extract_jwt_from_cookies", lambda cookies: None)

    provider = DummyProvider()
    # No per-account password, but provider settings will supply a global password
    account = DummyAccount(
        jwt_token="old-token",
        cookies={"_ai_token": "old-token"},
        provider_metadata={"auth_method": PixverseAuthMethod.PASSWORD.value},
        password=None,
    )

    # Stub provider settings loader to include a global password
    def _fake_load_settings():
        ns = types.SimpleNamespace(auto_reauth_enabled=True, global_password="global-secret")
        return {provider.provider_id: ns}

    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.providers._load_provider_settings",
        _fake_load_settings,
    )

    manager = PixverseSessionManager(provider)

    call_counter = {"calls": 0}

    async def failing_then_succeeding_op(session):
        call_counter["calls"] += 1
        if call_counter["calls"] == 1:
            raise Exception("user is not login, error 10003")
        return {"ok": True}

    result = await manager.run_with_session(
        account=account,
        op_name="get_credits",
        operation=failing_then_succeeding_op,
        retry_on_session_error=True,
    )

    # Auto-reauth should have been attempted once using the global password path
    assert provider.reauth_calls == 1
    assert result["ok"] is True
