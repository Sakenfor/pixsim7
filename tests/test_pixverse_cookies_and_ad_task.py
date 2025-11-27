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
async def test_ad_task_prefers_account_cookies_over_session_jwt(monkeypatch):
    """
    _get_ad_task_status should treat the browser-imported cookies on the account as
    authoritative for ad-task requests and not overwrite _ai_token with the session JWT.
    """

    provider = PixverseProvider()

    # Account has an _ai_token cookie imported from the browser.
    account = ProviderAccount(
        id=1,
        user_id=None,
        provider_id="pixverse",
        email="user@example.com",
        jwt_token=None,
        cookies={"_ai_token": "cookie-token"},
    )

    # Session chosen by the session manager (e.g., from cookies)
    session = {
        "jwt_token": "fresh-from-cookies",
        "cookies": {"_ai_token": "cookie-token"},
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

    # Capture cookies passed into DummyAsyncClient.get()
    sent_cookies = {}

    class CapturingAsyncClient(DummyAsyncClient):
        async def get(self, url: str, cookies: dict):
            nonlocal sent_cookies
            sent_cookies = dict(cookies)
            return await super().get(url, cookies)

    monkeypatch.setattr(
        pixverse_module,
        "httpx",
        types.SimpleNamespace(AsyncClient=lambda *args, **kwargs: CapturingAsyncClient([dummy_payload])),
    )

    ad_task = await provider._get_ad_task_status(account, session)

    # Ensure ad task was parsed correctly
    assert ad_task is not None
    assert ad_task["reward"] == 30
    assert ad_task["progress"] == 1
    assert ad_task["total_counts"] == 2

    # Cookies used for the request should preserve the account's _ai_token value
    # rather than overwriting it with the session JWT.
    assert sent_cookies.get("_ai_token") == "cookie-token"
