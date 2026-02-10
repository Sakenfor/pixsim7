import types

import pytest

from pixsim7.backend.main.domain import Generation, OperationType, ProviderAccount, ProviderStatus
from pixsim7.backend.main.services.provider.adapters import pixverse as pixverse_module
from pixsim7.backend.main.services.provider.adapters import pixverse_operations as ops
from pixsim7.backend.main.services.provider.adapters.pixverse_params import map_parameters
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider


class _DummyOptions:
    def model_dump(self) -> dict:
        return {}


class _InvalidMediaError(Exception):
    def __init__(self) -> None:
        super().__init__("ErrCode 500047: The provided media is invalid")
        self.err_code = 500047


class _QuotaError(Exception):
    def __init__(self) -> None:
        super().__init__("ErrCode 500090: insufficient credits")
        self.err_code = 500090


def _build_account() -> ProviderAccount:
    return ProviderAccount(
        id=1,
        user_id=None,
        provider_id="pixverse",
        email="user@example.com",
    )


@pytest.mark.asyncio
async def test_extend_uses_original_video_id_only_when_available(monkeypatch):
    provider = PixverseProvider()
    monkeypatch.setattr(ops, "_build_generation_options", lambda params: _DummyOptions())

    calls: list[dict] = []

    class FakeClient:
        async def extend(self, *, video_url, prompt, **kwargs):
            calls.append({"video_url": video_url, "prompt": prompt, "kwargs": kwargs})
            return types.SimpleNamespace(id="new_video_id")

    result = await provider._extend_video(
        FakeClient(),
        {
            "prompt": "extend",
            "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/example.mp4",
            "original_video_id": "385991605850788",
        },
    )

    assert result.id == "new_video_id"
    assert len(calls) == 1
    assert calls[0]["video_url"] == "video_id:385991605850788"


@pytest.mark.asyncio
async def test_extend_does_not_fallback_to_url_when_id_is_present(monkeypatch):
    provider = PixverseProvider()
    monkeypatch.setattr(ops, "_build_generation_options", lambda params: _DummyOptions())

    calls: list[dict] = []

    class FakeClient:
        async def extend(self, *, video_url, prompt, **kwargs):
            calls.append({"video_url": video_url, "prompt": prompt, "kwargs": kwargs})
            raise _InvalidMediaError()

    with pytest.raises(_InvalidMediaError):
        await provider._extend_video(
            FakeClient(),
            {
                "prompt": "extend",
                "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/example.mp4",
                "original_video_id": "385991605850788",
            },
        )

    assert len(calls) == 1
    assert calls[0]["video_url"] == "video_id:385991605850788"


@pytest.mark.asyncio
async def test_extend_does_not_retry_on_non_media_error(monkeypatch):
    provider = PixverseProvider()
    monkeypatch.setattr(ops, "_build_generation_options", lambda params: _DummyOptions())

    calls = 0

    class FakeClient:
        async def extend(self, *, video_url, prompt, **kwargs):
            nonlocal calls
            calls += 1
            raise _QuotaError()

    with pytest.raises(_QuotaError):
        await provider._extend_video(
            FakeClient(),
            {
                "prompt": "extend",
                "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/example.mp4",
                "original_video_id": "385991605850788",
            },
        )

    assert calls == 1


@pytest.mark.asyncio
async def test_extend_status_prefers_video_list_when_present(monkeypatch):
    provider = PixverseProvider()
    account = _build_account()

    calls = {"list": 0, "get": 0}

    class FakeClient:
        async def list_videos(self, *, limit, offset):
            calls["list"] += 1
            return [
                {
                    "video_id": "386175391758037",
                    "video_status": 1,
                    "url": "https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4",
                    "first_frame": "https://media.pixverse.ai/pixverse/jpg/media/web/ori/example.jpg",
                    "output_width": 640,
                    "output_height": 360,
                    "video_duration": 5,
                }
            ]

        async def get_video(self, *, video_id):
            calls["get"] += 1
            raise AssertionError("get_video should not be called when list_videos already has the extend job")

    fake_client = FakeClient()
    monkeypatch.setattr(provider, "_create_client", lambda account_obj: fake_client)

    async def _run_with_session(*, account, op_name, operation, retry_on_session_error=True):
        return await operation({})

    monkeypatch.setattr(provider.session_manager, "run_with_session", _run_with_session)

    result = await provider.check_status(
        account=account,
        provider_job_id="386175391758037",
        operation_type=OperationType.VIDEO_EXTEND,
    )

    assert result.status == ProviderStatus.COMPLETED
    assert result.video_url == "https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4"
    assert result.metadata.get("source") == "list_fallback"
    assert result.metadata.get("matched") is True
    assert calls["list"] == 1
    assert calls["get"] == 0


@pytest.mark.asyncio
async def test_video_status_invalid_media_uses_list_fallback(monkeypatch):
    provider = PixverseProvider()
    account = _build_account()

    calls = {"list": 0, "get": 0}

    class FakeClient:
        async def get_video(self, *, video_id):
            calls["get"] += 1
            raise _InvalidMediaError()

        async def list_videos(self, *, limit, offset):
            calls["list"] += 1
            return [
                {
                    "video_id": "386175391758037",
                    "video_status": 2,
                    "url": "https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4",
                    "first_frame": "https://media.pixverse.ai/pixverse/jpg/media/web/ori/example.jpg",
                }
            ]

    fake_client = FakeClient()
    monkeypatch.setattr(provider, "_create_client", lambda account_obj: fake_client)

    async def _run_with_session(*, account, op_name, operation, retry_on_session_error=True):
        return await operation({})

    monkeypatch.setattr(provider.session_manager, "run_with_session", _run_with_session)

    result = await provider.check_status(
        account=account,
        provider_job_id="386175391758037",
        operation_type=OperationType.TEXT_TO_VIDEO,
    )

    assert result.status == ProviderStatus.FAILED
    assert result.metadata.get("source") == "list_fallback"
    assert result.metadata.get("matched") is True
    assert result.metadata.get("invalid_media_fallback") is True
    assert calls["get"] == 1
    assert calls["list"] == 1


@pytest.mark.asyncio
async def test_prepare_extend_uses_original_video_id_without_url_resolution(monkeypatch):
    provider = PixverseProvider()
    account = _build_account()
    generation = Generation(
        user_id=1,
        operation_type=OperationType.VIDEO_EXTEND,
        provider_id="pixverse",
    )

    calls = {"resolver": 0}

    async def _should_not_resolve(*args, **kwargs):
        calls["resolver"] += 1
        raise AssertionError("composition asset URL resolution should be skipped")

    monkeypatch.setattr(
        pixverse_module,
        "resolve_composition_assets_for_pixverse",
        _should_not_resolve,
    )

    result = await provider.prepare_execution_params(
        generation=generation,
        mapped_params={
            "original_video_id": "386174927570009",
            "composition_assets": [{"asset": "asset:123", "media_type": "video"}],
            "prompt": "extend this",
        },
        resolve_source_fn=lambda *_args, **_kwargs: None,
        account=account,
    )

    assert result.get("original_video_id") == "386174927570009"
    assert "composition_assets" not in result
    assert not result.get("video_url")
    assert calls["resolver"] == 0


@pytest.mark.asyncio
async def test_prepare_extend_preserves_provided_video_url_and_skips_resolution(monkeypatch):
    provider = PixverseProvider()
    account = _build_account()
    generation = Generation(
        user_id=1,
        operation_type=OperationType.VIDEO_EXTEND,
        provider_id="pixverse",
    )

    calls = {"resolver": 0}

    async def _should_not_resolve(*args, **kwargs):
        calls["resolver"] += 1
        raise AssertionError("composition asset URL resolution should be skipped")

    monkeypatch.setattr(
        pixverse_module,
        "resolve_composition_assets_for_pixverse",
        _should_not_resolve,
    )

    existing_video_url = "https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4"
    result = await provider.prepare_execution_params(
        generation=generation,
        mapped_params={
            "original_video_id": "386174927570009",
            "video_url": existing_video_url,
            "composition_assets": [{"asset": "asset:123", "media_type": "video"}],
            "prompt": "extend this",
        },
        resolve_source_fn=lambda *_args, **_kwargs: None,
        account=account,
    )

    assert result.get("original_video_id") == "386174927570009"
    assert result.get("video_url") == existing_video_url
    assert not result.get("customer_video_url")
    assert not result.get("customer_video_path")
    assert "composition_assets" not in result
    assert calls["resolver"] == 0


def test_map_parameters_extend_normalizes_customer_video_url_into_video_url():
    mapped = map_parameters(
        OperationType.VIDEO_EXTEND,
        {
            "prompt": "extend",
            "original_video_id": "373097155985571",
            "customer_video_path": "pixverse/mp4/media/web/ori/7ec5c07c-44b3-46d6-8bc5-9d0d1f02de56_seed2090189931.mp4",
            "customer_video_url": "https://media.pixverse.ai/pixverse%2Fmp4%2Fmedia%2Fweb%2Fori%2F7ec5c07c-44b3-46d6-8bc5-9d0d1f02de56_seed2090189931.mp4",
        },
    )

    assert mapped.get("original_video_id") == "373097155985571"
    assert mapped.get("video_url") == "https://media.pixverse.ai/pixverse/mp4/media/web/ori/7ec5c07c-44b3-46d6-8bc5-9d0d1f02de56_seed2090189931.mp4"
    assert "customer_video_url" not in mapped
    assert "customer_video_path" not in mapped
