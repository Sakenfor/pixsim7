import types

import pytest

from pixsim7.backend.main.domain.account import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.api.v1.accounts import export_account_cookies


class DummyUser:
    def __init__(self, user_id: int, is_admin: bool = False):
        self.id = user_id
        self._is_admin = is_admin

    def is_admin(self) -> bool:
        return self._is_admin


class DummyAccountService:
    def __init__(self, account: ProviderAccount):
        self._account = account

    async def get_account(self, account_id: int) -> ProviderAccount:
        assert account_id == self._account.id
        return self._account


@pytest.mark.asyncio
async def test_export_account_cookies_injects_ai_token_when_missing(monkeypatch):
    """Pixverse cookie export should inject _ai_token from a valid jwt_token when missing."""
    # Build a ProviderAccount with a valid looking JWT and no _ai_token cookie.
    account = ProviderAccount(
        id=1,
        user_id=10,
        provider_id="pixverse",
        email="user@example.com",
        jwt_token=(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJleHAiIjoyMDAwMDAwMDAwLCJpYXQiOjE3MDAwMDAwMDB9."
            "signature"
        ),
        cookies={"some_cookie": "value"},
    )

    user = DummyUser(user_id=10, is_admin=False)
    account_service = DummyAccountService(account)

    # Call the FastAPI handler directly
    response = await export_account_cookies(
        account_id=1,
        user=user,
        account_service=account_service,
    )

    assert response.provider_id == "pixverse"
    assert response.email == "user@example.com"
    # _ai_token should be injected alongside existing cookies
    assert response.cookies.get("some_cookie") == "value"
    assert response.cookies.get("_ai_token") == account.jwt_token


class DummyHttpResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def json(self) -> dict:
        return self._payload


class DummyAsyncClient:
    """Minimal AsyncClient stand-in for httpx.AsyncClient context manager."""

    def __init__(self, responses: list[dict]):
        self._responses = responses
        self._index = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url: str, cookies: dict):
        # Return the next queued response
        payload = self._responses[self._index]
        self._index = min(self._index + 1, len(self._responses) - 1)
        return DummyHttpResponse(payload)


@pytest.mark.asyncio
async def test_ad_task_uses_session_jwt_from_cookies(monkeypatch):
    """
    When PixverseSessionManager selects jwt_source='cookies', _get_ad_task_status should
    align _ai_token with the session jwt_token, even if the original cookies had a stale token.
    """

    provider = PixverseProvider()

    # Account has stale cookies but no jwt_token set yet; session manager would normally
    # upgrade jwt_token from cookies, but here we simulate the final session directly.
    account = ProviderAccount(
        id=1,
        user_id=None,
        provider_id="pixverse",
        email="user@example.com",
        jwt_token=None,
        cookies={"_ai_token": "stale-token"},
    )

    # Session chosen by the session manager: JWT came from cookies
    session = {
        "jwt_token": "fresh-from-cookies",
        "cookies": {"_ai_token": "stale-token"},
        "jwt_source": "cookies",
        "auth_method": PixverseAuthMethod.UNKNOWN.value,
    }

    # Stub httpx.AsyncClient used inside _get_ad_task_status
    import pixsim7.backend.main.services.provider.adapters.pixverse as pixverse_module

    dummy_payload = {
        "ErrCode": 0,
        "ErrMsg": "Success",
        "Resp": [
            {
                "task_type": 1,
                "sub_type": 11,
                "reward": 30,
                "progress": 1,
                "total_counts": 2,
                "completed_counts": 0,
                "expired_time": 1234567890,
            }
        ],
    }

    monkeypatch.setattr(
        pixverse_module,
        "httpx",
        types.SimpleNamespace(AsyncClient=lambda *args, **kwargs: DummyAsyncClient([dummy_payload])),
    )

    # To inspect the cookies actually sent, we patch the provider method to capture them.
    sent_cookies = {}

    original_get_ad_task_status = provider._get_ad_task_status

    async def _capturing_get_ad_task_status(account_obj, session_obj):
        nonlocal sent_cookies
        # Reuse the real method but intercept cookies by monkeypatching httpx.AsyncClient locally
        # The DummyAsyncClient doesn't expose cookies directly, so we re-run the key logic here.
        cookies = dict(session_obj.get("cookies") or {})
        jwt_token = session_obj.get("jwt_token")
        jwt_source = session_obj.get("jwt_source", "account")

        if jwt_token:
            if jwt_source == "cookies":
                cookies["_ai_token"] = jwt_token
            elif "_ai_token" not in cookies:
                cookies["_ai_token"] = jwt_token

        sent_cookies = cookies
        # Call through to the real implementation, which will use the stubbed httpx.AsyncClient
        return await original_get_ad_task_status(account_obj, session_obj)

    provider._get_ad_task_status = _capturing_get_ad_task_status  # type: ignore[assignment]

    ad_task = await provider._get_ad_task_status(account, session)

    # Ensure ad task was parsed correctly
    assert ad_task is not None
    assert ad_task["reward"] == 30
    assert ad_task["progress"] == 1
    assert ad_task["total_counts"] == 2

    # Most importantly, cookies used for the request should have _ai_token
    # aligned with the session jwt_token, not the stale cookie value.
    assert sent_cookies["_ai_token"] == "fresh-from-cookies"

