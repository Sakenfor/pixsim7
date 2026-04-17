import asyncio

import pytest

from pixverse.api.client import PixverseAPI
from pixverse.api import image as _image_mod
from pixverse.exceptions import APIError
from pixverse.models import Account


@pytest.fixture(autouse=True)
def _clear_module_state():
    """Clear module-level caches before/after each test to prevent cross-contamination."""
    _image_mod._image_search_state.clear()
    _image_mod._message_seen_ids.clear()
    _image_mod._found_image_cache.clear()
    yield
    _image_mod._image_search_state.clear()
    _image_mod._message_seen_ids.clear()
    _image_mod._found_image_cache.clear()


@pytest.fixture
def openapi_account() -> Account:
    return Account(
        email="test@example.com",
        password="password",
        session={
            "openapi_key": "mock_openapi_key",
            "use_method": "open-api",
        },
    )


@pytest.fixture
def hybrid_account() -> Account:
    return Account(
        email="test@example.com",
        password="password",
        session={
            "openapi_key": "mock_openapi_key",
            "jwt_token": "mock_jwt_token",
            "cookies": {"session": "mock_session"},
        },
    )


@pytest.mark.asyncio
async def test_get_image_openapi_normalizes_result_fields(monkeypatch, openapi_account):
    api = PixverseAPI()
    calls = []

    async def fake_request(method, endpoint, account, **kwargs):
        calls.append((method, endpoint, kwargs))
        return {
            "ErrCode": 0,
            "ErrMsg": "Success",
            "Resp": {
                "image_id": 123,
                "status": 1,
                "url": "https://media.pixverse.ai/pixverse/i2i/ori/example.jpg",
                "outputWidth": 1024,
                "outputHeight": 768,
            },
        }

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("123", openapi_account)

    assert calls[0][0] == "GET"
    assert calls[0][1] == "/openapi/v2/image/result/123"
    assert calls[0][2].get("prefer_openapi") is True

    assert result["image_id"] == 123
    assert result["image_status"] == 1
    assert result["status"] == "completed"
    assert result["image_url"] == "https://media.pixverse.ai/pixverse/i2i/ori/example.jpg"
    assert result["output_width"] == 1024
    assert result["output_height"] == 768


@pytest.mark.asyncio
async def test_get_image_openapi_tries_query_variant_when_path_fails(monkeypatch, openapi_account):
    api = PixverseAPI()
    endpoints = []

    async def fake_request(method, endpoint, account, **kwargs):
        endpoints.append(endpoint)
        if endpoint == "/openapi/v2/image/result/456":
            raise APIError("HTTP 404 error: not found", status_code=404)
        if endpoint == "/openapi/v2/image/result?image_id=456":
            return {
                "ErrCode": 0,
                "ErrMsg": "Success",
                "Resp": {"image_id": 456, "status": 5, "url": None},
            }
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("456", openapi_account)

    assert endpoints == [
        "/openapi/v2/image/result/456",
        "/openapi/v2/image/result?image_id=456",
    ]
    assert result["image_id"] == 456
    assert result["image_status"] == 5
    assert result["status"] == "processing"


@pytest.mark.asyncio
async def test_get_image_auto_falls_back_to_webapi_on_openapi_not_found(monkeypatch, hybrid_account):
    api = PixverseAPI()
    endpoints = []

    async def fake_request(method, endpoint, account, **kwargs):
        endpoints.append(endpoint)
        if endpoint.startswith("/openapi/v2/image/result"):
            raise APIError("HTTP 404 error: not found", status_code=404)
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("789", hybrid_account)

    assert result["image_id"] == "789"
    assert result["image_status"] == 5
    assert result["status"] == "processing"
    assert "/creative_platform/account/message" in endpoints
    # When not in message list, should still search the personal image list
    assert "/creative_platform/image/list/personal" in endpoints


@pytest.mark.asyncio
async def test_get_image_auto_falls_back_to_webapi_on_openapi_invalid_media(monkeypatch, hybrid_account):
    api = PixverseAPI()
    endpoints = []

    async def fake_request(method, endpoint, account, **kwargs):
        endpoints.append(endpoint)
        if endpoint == "/openapi/v2/image/result/789":
            raise APIError(
                "The provided media is invalid",
                status_code=400,
                err_code=500047,
                err_msg="The provided media is invalid",
            )
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("789", hybrid_account)

    assert result["image_id"] == "789"
    assert result["image_status"] == 5
    assert result["status"] == "processing"
    # Should not spam query-variant OpenAPI fallbacks on 400 invalid media.
    assert "/openapi/v2/image/result?image_id=789" not in endpoints
    assert "/openapi/v2/image/result?id=789" not in endpoints
    assert "/creative_platform/account/message" in endpoints
    assert "/creative_platform/image/list/personal" in endpoints


@pytest.mark.asyncio
async def test_get_image_web_finds_completed_image_in_personal_list(monkeypatch, hybrid_account):
    """When message list is empty but image is in personal list, return it."""
    api = PixverseAPI()

    async def fake_request(method, endpoint, account, **kwargs):
        if endpoint == "/openapi/v2/image/result/789":
            raise APIError(
                "The provided media is invalid",
                status_code=400,
                err_code=500047,
                err_msg="The provided media is invalid",
            )
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {
                "ErrCode": 0,
                "Resp": {
                    "image_list": [
                        {
                            "image_id": 789,
                            "image_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/result.jpg",
                            "width": 1024,
                            "height": 768,
                        }
                    ]
                },
            }
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("789", hybrid_account)

    assert result["image_id"] == 789
    assert result["image_status"] == 1
    assert result["image_url"] == "https://media.pixverse.ai/pixverse/i2i/result.jpg"


@pytest.mark.asyncio
async def test_get_image_web_finds_completed_image_via_library_fallback(monkeypatch, hybrid_account):
    """When personal list is empty, asset/library/list fallback finds the image."""
    api = PixverseAPI()

    async def fake_request(method, endpoint, account, **kwargs):
        if endpoint == "/openapi/v2/image/result/789":
            raise APIError(
                "The provided media is invalid",
                status_code=400,
                err_code=500047,
                err_msg="The provided media is invalid",
            )
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {
                "ErrCode": 0,
                "Resp": {
                    "data": [
                        {
                            "asset_id": 789,
                            "asset_source": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/result.jpg",
                            "width": 1024,
                            "height": 768,
                        }
                    ]
                },
            }
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("789", hybrid_account)

    # asset_id should be normalized to image_id
    assert result["image_id"] == 789
    assert result["image_url"] == "https://media.pixverse.ai/pixverse/i2i/result.jpg"


@pytest.mark.asyncio
async def test_get_image_web_concurrent_calls_share_single_message_fetch(monkeypatch, hybrid_account):
    """
    Concurrent get_image() calls for the same account should share one
    /account/message request to avoid notification-consumer races.
    """
    api = PixverseAPI()
    message_calls = 0

    async def fake_request(method, endpoint, account, **kwargs):
        nonlocal message_calls
        if endpoint == "/creative_platform/account/message":
            message_calls += 1
            await asyncio.sleep(0.05)  # Force overlap between concurrent callers
            return {"ErrCode": 0, "Resp": {"image_list": [111, 222], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {
                "ErrCode": 0,
                "Resp": {
                    "image_list": [
                        {
                            "image_id": 111,
                            "image_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/111.jpg",
                        },
                        {
                            "image_id": 222,
                            "image_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/222.jpg",
                        },
                    ]
                },
            }
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result_111, result_222 = await asyncio.gather(
        api._image_ops.get_image("111", hybrid_account),
        api._image_ops.get_image("222", hybrid_account),
    )

    assert message_calls == 1
    assert result_111["image_id"] == 111
    assert result_111["image_status"] == 1
    assert result_222["image_id"] == 222
    assert result_222["image_status"] == 1


@pytest.mark.asyncio
async def test_get_image_web_checks_library_when_personal_nonempty_but_missing_target(
    monkeypatch,
    hybrid_account,
):
    """
    Even when image/list/personal returns rows, get_image should still be able to
    find the target in asset/library/list for the same page.
    """
    api = PixverseAPI()

    async def fake_request(method, endpoint, account, **kwargs):
        if endpoint == "/creative_platform/account/message":
            # Include target in message to simulate completion notification.
            return {"ErrCode": 0, "Resp": {"image_list": [789], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            # Non-empty page, but target is missing.
            return {
                "ErrCode": 0,
                "Resp": {
                    "image_list": [
                        {
                            "image_id": 111,
                            "image_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/111.jpg",
                        }
                    ]
                },
            }
        if endpoint == "/creative_platform/asset/library/list":
            return {
                "ErrCode": 0,
                "Resp": {
                    "data": [
                        {
                            "asset_id": 789,
                            "asset_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/789.jpg",
                        }
                    ]
                },
            }
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    result = await api._image_ops.get_image("789", hybrid_account)

    assert result["image_id"] == 789
    assert result["image_status"] == 1
    assert result["image_url"] == "https://media.pixverse.ai/pixverse/i2i/789.jpg"


@pytest.mark.asyncio
async def test_get_image_web_progressive_search_expands_across_library_pages(
    monkeypatch,
    hybrid_account,
):
    """
    Progressive search should expand to additional pages when library pages are full,
    then resolve images that were not present on the first page.
    """
    api = PixverseAPI()

    def _library_page(offset: int, limit: int):
        if offset == 0:
            return [
                {
                    "asset_id": 1000 + i,
                    "asset_status": 1,
                    "image_url": f"https://media.pixverse.ai/pixverse/i2i/{1000 + i}.jpg",
                }
                for i in range(limit)
            ]
        if offset == limit:
            return [
                {
                    "asset_id": 9001,
                    "asset_status": 1,
                    "image_url": "https://media.pixverse.ai/pixverse/i2i/9001.jpg",
                }
            ]
        return []

    async def fake_request(method, endpoint, account, **kwargs):
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            # Personal endpoint returns empty; library is authoritative in this case.
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            body = kwargs.get("json", {}) or {}
            offset = int(body.get("offset", 0))
            limit = int(body.get("limit", 100))
            return {"ErrCode": 0, "Resp": {"data": _library_page(offset, limit)}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    # First poll cycle: only first page searched, target should not be found yet.
    first = await api._image_ops.get_image("9001", hybrid_account)
    assert first["image_status"] == 5
    assert first["status"] == "processing"

    # Second cycle: progressive search expands to page 2 and should resolve target.
    second = await api._image_ops.get_image("9001", hybrid_account)
    assert second["image_id"] == 9001
    assert second["image_status"] == 1
    assert second["image_url"] == "https://media.pixverse.ai/pixverse/i2i/9001.jpg"


@pytest.mark.asyncio
async def test_get_image_web_progressive_search_expands_on_short_personal_pages(
    monkeypatch,
    hybrid_account,
):
    """
    Some accounts return short pages (< requested limit) even when more data exists.
    Search should still expand across offsets between poll cycles.
    """
    api = PixverseAPI()

    def _personal_page(offset: int):
        if offset == 0:
            return [
                {
                    "image_id": 2000 + i,
                    "image_status": 1,
                    "image_url": f"https://media.pixverse.ai/pixverse/i2i/{2000 + i}.jpg",
                }
                for i in range(20)
            ]
        if offset == 100:
            return [
                {
                    "image_id": 9010,
                    "image_status": 1,
                    "image_url": "https://media.pixverse.ai/pixverse/i2i/9010.jpg",
                }
            ]
        return []

    async def fake_request(method, endpoint, account, **kwargs):
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            body = kwargs.get("json", {}) or {}
            offset = int(body.get("offset", 0))
            return {"ErrCode": 0, "Resp": {"image_list": _personal_page(offset)}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    # Cycle 1: first page only
    first = await api._image_ops.get_image("9010", hybrid_account)
    assert first["image_status"] == 5
    assert first["status"] == "processing"

    # Cycle 2: search expands to offset=100 and finds target
    second = await api._image_ops.get_image("9010", hybrid_account)
    assert second["image_id"] == 9010
    assert second["image_status"] == 1
    assert second["image_url"] == "https://media.pixverse.ai/pixverse/i2i/9010.jpg"


@pytest.mark.asyncio
async def test_get_image_web_concurrent_batch_one_success_not_missed_and_dedupes_page_fetch(
    monkeypatch,
    hybrid_account,
):
    """
    Concurrent polling of a mixed outcome batch should not miss the sole success.
    Personal page fetch should be deduped across concurrent callers.
    """
    api = PixverseAPI()
    message_calls = 0
    personal_calls = 0
    library_calls = 0
    success_id = 8008
    all_ids = [8001, 8002, 8003, 8004, 8005, 8006, 8007, success_id]

    personal_rows = [
        {
            "image_id": image_id,
            "image_status": (1 if image_id == success_id else 8),
            "image_url": (
                f"https://media.pixverse.ai/pixverse/i2i/{image_id}.jpg"
                if image_id == success_id
                else None
            ),
        }
        for image_id in all_ids
    ]

    async def fake_request(method, endpoint, account, **kwargs):
        nonlocal message_calls, personal_calls, library_calls
        if endpoint == "/creative_platform/account/message":
            message_calls += 1
            await asyncio.sleep(0.02)
            return {"ErrCode": 0, "Resp": {"image_list": [success_id], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            personal_calls += 1
            await asyncio.sleep(0.05)
            return {"ErrCode": 0, "Resp": {"image_list": personal_rows}}
        if endpoint == "/creative_platform/asset/library/list":
            library_calls += 1
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    results = await asyncio.gather(
        *(api._image_ops.get_image(str(image_id), hybrid_account) for image_id in all_ids)
    )
    result_by_id = {int(result["image_id"]): result for result in results}

    assert message_calls == 1
    assert personal_calls == 1
    assert library_calls == 0
    assert result_by_id[success_id]["image_status"] == 1
    assert result_by_id[success_id]["image_url"] == "https://media.pixverse.ai/pixverse/i2i/8008.jpg"
    for image_id in all_ids:
        if image_id == success_id:
            continue
        assert result_by_id[image_id]["image_status"] == 8


@pytest.mark.asyncio
async def test_get_image_web_does_not_cache_empty_page_between_poll_cycles(
    monkeypatch,
    hybrid_account,
):
    """
    Empty personal/library pages should not be cached across cycles because
    images can appear moments later on the same offset.
    """
    api = PixverseAPI()
    personal_calls = 0

    async def fake_request(method, endpoint, account, **kwargs):
        nonlocal personal_calls
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            personal_calls += 1
            if personal_calls == 1:
                return {"ErrCode": 0, "Resp": {"image_list": []}}
            return {
                "ErrCode": 0,
                "Resp": {
                    "image_list": [
                        {
                            "image_id": 9301,
                            "image_status": 1,
                            "image_url": "https://media.pixverse.ai/pixverse/i2i/9301.jpg",
                        }
                    ]
                },
            }
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    first = await api._image_ops.get_image("9301", hybrid_account)
    assert first["image_status"] == 5
    assert first["status"] == "processing"

    second = await api._image_ops.get_image("9301", hybrid_account)
    assert second["image_id"] == 9301
    assert second["image_status"] == 1
    assert second["image_url"] == "https://media.pixverse.ai/pixverse/i2i/9301.jpg"
    assert personal_calls == 2


@pytest.mark.asyncio
async def test_progressive_search_state_survives_across_client_instances(
    monkeypatch,
    hybrid_account,
):
    """
    Progressive search state is module-level, so creating a new PixverseAPI
    (new ImageOperations instance) should still remember how many pages were
    searched in a prior cycle — simulating the poller creating a fresh client
    per poll cycle.
    """
    def _library_page(offset: int, limit: int):
        if offset == 0:
            return [
                {
                    "asset_id": 5000 + i,
                    "asset_status": 1,
                    "image_url": f"https://media.pixverse.ai/pixverse/i2i/{5000 + i}.jpg",
                }
                for i in range(limit)
            ]
        if offset == limit:
            return [
                {
                    "asset_id": 7777,
                    "asset_status": 1,
                    "image_url": "https://media.pixverse.ai/pixverse/i2i/7777.jpg",
                }
            ]
        return []

    def _fake_request_factory():
        async def fake_request(method, endpoint, account, **kwargs):
            if endpoint == "/creative_platform/account/message":
                return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
            if endpoint == "/creative_platform/image/list/personal":
                return {"ErrCode": 0, "Resp": {"image_list": []}}
            if endpoint == "/creative_platform/asset/library/list":
                body = kwargs.get("json", {}) or {}
                offset = int(body.get("offset", 0))
                limit = int(body.get("limit", 100))
                return {"ErrCode": 0, "Resp": {"data": _library_page(offset, limit)}}
            raise AssertionError(f"Unexpected endpoint: {endpoint}")
        return fake_request

    # Cycle 1: fresh client, searches page 1 only — target not found
    api1 = PixverseAPI()
    monkeypatch.setattr(api1, "_request", _fake_request_factory())
    first = await api1._image_ops.get_image("7777", hybrid_account)
    assert first["image_status"] == 5
    assert first["status"] == "processing"

    # Cycle 2: NEW client instance, but module-level state should remember
    # that page 1 was already searched, so it expands to page 2.
    api2 = PixverseAPI()
    monkeypatch.setattr(api2, "_request", _fake_request_factory())
    second = await api2._image_ops.get_image("7777", hybrid_account)
    assert second["image_id"] == 7777
    assert second["image_status"] == 1
    assert second["image_url"] == "https://media.pixverse.ai/pixverse/i2i/7777.jpg"


@pytest.mark.asyncio
async def test_accumulated_message_ids_prevent_state_reset_after_cache_expiry(
    monkeypatch,
    hybrid_account,
):
    """
    When the message cache expires and a fresh /account/message returns []
    (previous IDs consumed), the module-level accumulated seen set still
    remembers the image was reported complete — preventing progressive
    search state from being cleared on empty personal/library pages.
    """
    api = PixverseAPI()
    message_call_count = 0

    async def fake_request(method, endpoint, account, **kwargs):
        nonlocal message_call_count
        if endpoint == "/creative_platform/account/message":
            message_call_count += 1
            if message_call_count == 1:
                # First fetch: target reported as completed
                return {"ErrCode": 0, "Resp": {"image_list": [5555], "video_list": []}}
            # Subsequent fetches: consumed, empty
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    # Cycle 1: message reports [5555], but personal/library empty.
    first = await api._image_ops.get_image("5555", hybrid_account)
    assert first["image_status"] == 5
    assert first["status"] == "processing"

    scope = api._image_ops._account_cache_scope(hybrid_account)
    cache_key = (scope, "5555")
    state1 = _image_mod._image_search_state.get(cache_key)
    assert state1 is not None, "Progressive state should be preserved (in_message_list=True)"

    # Force message cache expiry so cycle 2 re-fetches from endpoint.
    if scope in api._image_ops._message_cache:
        api._image_ops._message_cache[scope]["ts"] -= 20

    # Cycle 2: message now returns [] (consumed), personal/library still empty.
    # Without accumulation the state would be cleared; with it, state is preserved.
    second = await api._image_ops.get_image("5555", hybrid_account)
    assert second["image_status"] == 5

    state2 = _image_mod._image_search_state.get(cache_key)
    assert state2 is not None, "Progressive state must survive (accumulated seen IDs)"
    assert state2["pages"] >= state1["pages"]


@pytest.mark.asyncio
async def test_accumulated_message_ids_survive_across_client_instances(
    monkeypatch,
    hybrid_account,
):
    """
    Module-level _message_seen_ids persist across PixverseAPI instances.
    Instance 1 sees image in message; instance 2 doesn't (consumed).
    Instance 2 still preserves progressive search state because the
    accumulated seen set remembers the completion.
    """
    # Instance 1: message reports [6666], personal/library empty.
    api1 = PixverseAPI()

    async def fake_request_1(method, endpoint, account, **kwargs):
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [6666], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api1, "_request", fake_request_1)

    first = await api1._image_ops.get_image("6666", hybrid_account)
    assert first["image_status"] == 5

    scope = api1._image_ops._account_cache_scope(hybrid_account)
    cache_key = (scope, "6666")
    state1 = _image_mod._image_search_state.get(cache_key)
    assert state1 is not None

    # Instance 2 (fresh client): message returns [] (consumed).
    api2 = PixverseAPI()

    async def fake_request_2(method, endpoint, account, **kwargs):
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api2, "_request", fake_request_2)

    second = await api2._image_ops.get_image("6666", hybrid_account)
    assert second["image_status"] == 5

    state2 = _image_mod._image_search_state.get(cache_key)
    assert state2 is not None, "State must survive across instances (accumulated seen IDs)"
    assert state2["pages"] >= state1["pages"]

    # Verify the seen set has the ID from instance 1
    assert f"{scope}:6666" in _image_mod._message_seen_ids


@pytest.mark.asyncio
async def test_found_image_cache_prevents_rediscovery_failure(
    monkeypatch,
    hybrid_account,
):
    """
    Once an image is found with a terminal status (completed/failed), the
    result is cached at module level. If personal/library lists subsequently
    fail to return the image (pagination shift, propagation delay), the
    cached result is returned immediately.
    """
    api = PixverseAPI()
    personal_call_count = 0

    async def fake_request(method, endpoint, account, **kwargs):
        nonlocal personal_call_count
        if endpoint == "/creative_platform/account/message":
            return {"ErrCode": 0, "Resp": {"image_list": [], "video_list": []}}
        if endpoint == "/creative_platform/image/list/personal":
            personal_call_count += 1
            if personal_call_count == 1:
                # First call: image is present and completed
                return {
                    "ErrCode": 0,
                    "Resp": {
                        "image_list": [
                            {
                                "image_id": 4444,
                                "image_status": 1,
                                "image_url": "https://media.pixverse.ai/pixverse/i2i/4444.jpg",
                            }
                        ]
                    },
                }
            # Subsequent calls: image disappeared from the list
            return {"ErrCode": 0, "Resp": {"image_list": []}}
        if endpoint == "/creative_platform/asset/library/list":
            return {"ErrCode": 0, "Resp": {"data": []}}
        raise AssertionError(f"Unexpected endpoint: {endpoint}")

    monkeypatch.setattr(api, "_request", fake_request)

    # Cycle 1: image found and completed — gets cached.
    first = await api._image_ops.get_image("4444", hybrid_account)
    assert first["image_id"] == 4444
    assert first["image_status"] == 1
    assert first["image_url"] == "https://media.pixverse.ai/pixverse/i2i/4444.jpg"

    # Cycle 2: image vanished from personal/library, but found cache returns it.
    second = await api._image_ops.get_image("4444", hybrid_account)
    assert second["image_id"] == 4444
    assert second["image_status"] == 1
    assert second["image_url"] == "https://media.pixverse.ai/pixverse/i2i/4444.jpg"

    # Only 1 personal call — second poll was served from found cache.
    assert personal_call_count == 1
