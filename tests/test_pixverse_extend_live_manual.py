import inspect
import os
from typing import Any, Dict, List

import pytest

from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider

try:
    from pixverse import PixverseClient  # type: ignore
except Exception:  # pragma: no cover - optional dependency in some envs
    PixverseClient = None  # type: ignore


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        pytest.skip(f"{name} is required for live manual extend test")
    return value


def _build_live_params(video_id: str, video_url: str | None, prompt: str) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "prompt": prompt,
        "original_video_id": video_id,
    }
    if video_url:
        params["video_url"] = video_url

    quality = os.getenv("PIXVERSE_LIVE_QUALITY", "").strip()
    if quality:
        params["quality"] = quality

    duration_raw = os.getenv("PIXVERSE_LIVE_DURATION", "").strip()
    if duration_raw:
        try:
            params["duration"] = int(float(duration_raw))
        except ValueError:
            pass

    model = os.getenv("PIXVERSE_LIVE_MODEL", "").strip()
    if model:
        params["model"] = model

    return params


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.getenv("RUN_PIXVERSE_LIVE_EXTEND_TEST", "0") != "1",
    reason=(
        "Manual live test disabled. Set RUN_PIXVERSE_LIVE_EXTEND_TEST=1 and "
        "PIXVERSE_LIVE_EMAIL/PIXVERSE_LIVE_PASSWORD/PIXVERSE_LIVE_VIDEO_ID."
    ),
)
async def test_live_extend_attempt_sequence():
    """
    Manual live probe to verify payload order for Pixverse extend:
    1) video_id:<original_video_id> token only

    Required env vars:
      - PIXVERSE_LIVE_EMAIL
      - PIXVERSE_LIVE_PASSWORD
      - PIXVERSE_LIVE_VIDEO_ID

    Optional env vars:
      - PIXVERSE_LIVE_VIDEO_URL
      - PIXVERSE_LIVE_PROMPT
      - PIXVERSE_LIVE_QUALITY
      - PIXVERSE_LIVE_DURATION
      - PIXVERSE_LIVE_MODEL
      - PIXVERSE_LIVE_METHOD (default: web-api)
    """
    if PixverseClient is None:
        pytest.skip("pixverse-py is not installed in this environment")

    email = _required_env("PIXVERSE_LIVE_EMAIL")
    password = _required_env("PIXVERSE_LIVE_PASSWORD")
    video_id = _required_env("PIXVERSE_LIVE_VIDEO_ID")
    video_url = os.getenv("PIXVERSE_LIVE_VIDEO_URL", "").strip() or None
    prompt = os.getenv("PIXVERSE_LIVE_PROMPT", "continue naturally").strip()
    method = os.getenv("PIXVERSE_LIVE_METHOD", "web-api").strip() or "web-api"

    provider = PixverseProvider()

    # Build a real client from credentials for live execution.
    real_client = PixverseClient(email=email, password=password)

    # Best-effort method override for SDKs that honor account.session["use_method"].
    try:
        account_obj = real_client.pool.get_next()
        if getattr(account_obj, "session", None) is not None:
            account_obj.session["use_method"] = method
    except Exception:
        pass

    class _ProbeClient:
        def __init__(self, inner: Any):
            self.inner = inner
            self.calls: List[Dict[str, Any]] = []

        async def extend(self, *, video_url: Any, prompt: str, **kwargs: Any) -> Any:
            self.calls.append(
                {
                    "video_url": video_url,
                    "prompt": prompt,
                    "kwargs": dict(kwargs),
                }
            )
            result = self.inner.extend(video_url=video_url, prompt=prompt, **kwargs)
            if inspect.isawaitable(result):
                result = await result
            return result

    probe_client = _ProbeClient(real_client)
    params = _build_live_params(video_id=video_id, video_url=video_url, prompt=prompt)

    try:
        result = await provider._extend_video(probe_client, params)
    except Exception as exc:
        print("\n[live_extend_probe] extend failed")
        print(f"[live_extend_probe] error={exc}")
        print(f"[live_extend_probe] attempts={len(probe_client.calls)}")
        for idx, call in enumerate(probe_client.calls, start=1):
            print(f"[live_extend_probe] attempt={idx} video_ref={call['video_url']}")
        raise

    print("\n[live_extend_probe] extend submitted")
    print(f"[live_extend_probe] attempts={len(probe_client.calls)}")
    for idx, call in enumerate(probe_client.calls, start=1):
        print(f"[live_extend_probe] attempt={idx} video_ref={call['video_url']}")
    print(f"[live_extend_probe] result_type={type(result).__name__}")

    assert len(probe_client.calls) >= 1
    first_ref = probe_client.calls[0]["video_url"]
    assert first_ref == f"video_id:{video_id}", f"first attempt should be video_id token, got: {first_ref}"
