from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.media.embedding_input_config import (
    resolve_embedding_input_config,
)
from pixsim7.backend.main.services.media import embedding_inputs


class _Storage:
    def __init__(self, paths: dict[str, str]) -> None:
        self._paths = paths

    def get_path(self, key: str) -> str:
        return self._paths[key]


def _video_asset(**overrides):
    base = dict(
        id=42,
        user_id=1,
        media_type=MediaType.VIDEO,
        stored_key="u/1/content/aa/video.mp4",
        thumbnail_key=None,
        preview_key=None,
        local_path=None,
        duration_sec=4.0,
        media_metadata={},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_video_embedding_extracts_jpeg_frames_instead_of_sending_mp4(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    video_path = tmp_path / "video.mp4"
    video_path.write_bytes(b"video")
    storage = _Storage({"u/1/content/aa/video.mp4": str(video_path)})
    calls: list[dict] = []

    monkeypatch.setattr(embedding_inputs, "_validate_video_for_thumbnail", lambda *_args: True)
    monkeypatch.setattr(embedding_inputs, "_validate_extracted_frame", lambda *_args: True)

    async def _fake_extract(local_path: str, output_path: str, **kwargs) -> bool:
        Path(output_path).write_bytes(b"jpeg")
        calls.append({"local_path": local_path, "output_path": output_path, **kwargs})
        return True

    monkeypatch.setattr(embedding_inputs, "extract_video_frame", _fake_extract)

    config = resolve_embedding_input_config({"video_frame_count": 3})
    paths, cleanup_paths, input_kind = await embedding_inputs.resolve_embedding_input_paths(
        asset=_video_asset(),
        storage=storage,
        config=config,
    )

    try:
        assert input_kind == "video_frames"
        assert len(paths) == 3
        assert paths == cleanup_paths
        assert all(Path(path).suffix == ".jpg" for path in paths)
        assert str(video_path) not in paths
        assert [call["local_path"] for call in calls] == [str(video_path)] * 3
        assert [call["timestamp"] for call in calls] == pytest.approx([1.0, 2.0, 3.0])
        assert all(call["target_size"] == (384, 384) for call in calls)
    finally:
        embedding_inputs.cleanup_embedding_input_paths(cleanup_paths)


@pytest.mark.asyncio
async def test_video_embedding_derivative_fallback_still_avoids_raw_mp4(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    video_path = tmp_path / "video.mp4"
    thumb_path = tmp_path / "thumb.jpg"
    video_path.write_bytes(b"video")
    thumb_path.write_bytes(b"jpeg")
    storage = _Storage(
        {
            "u/1/content/aa/video.mp4": str(video_path),
            "u/1/thumbnails/aa/thumb.jpg": str(thumb_path),
        }
    )

    monkeypatch.setattr(embedding_inputs, "_validate_video_for_thumbnail", lambda *_args: False)

    paths, cleanup_paths, input_kind = await embedding_inputs.resolve_embedding_input_paths(
        asset=_video_asset(thumbnail_key="u/1/thumbnails/aa/thumb.jpg"),
        storage=storage,
        config=resolve_embedding_input_config(),
    )

    assert input_kind == "video_derivative"
    assert paths == [str(thumb_path)]
    assert cleanup_paths == []


def test_video_embedding_mean_pool_is_l2_normalized() -> None:
    pooled = embedding_inputs.aggregate_embedding_vectors(
        [[1.0, 0.0], [0.0, 1.0]],
        input_kind="video_frames",
        config={"video_frame_aggregation": "mean"},
    )

    assert pooled == pytest.approx([0.70710678, 0.70710678])
