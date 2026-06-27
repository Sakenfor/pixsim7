"""Prepare media assets for image-embedding models.

The SigLIP daemon embeds image paths only. This module owns the media-aware
translation from an Asset to image inputs:

- images choose original/preview/thumbnail based on embedding config;
- videos extract model-resolution JPEG frames and return those frame paths;
- fallback to existing video derivatives only when the source video cannot be
  decoded locally.

Keeping this here prevents the image daemon from learning about video formats
and keeps worker code focused on orchestration.
"""
from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path
from typing import Any

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.media.derivatives import (
    DEFAULT_FRAME_SIZE,
    _get_video_rotation_filters,
    _validate_extracted_frame,
    _validate_video_for_thumbnail,
    evenly_spaced_timestamps,
    extract_video_frame,
)


def _media_type_value(media_type: Any) -> str:
    value = media_type.value if hasattr(media_type, "value") else media_type
    return str(value or "").lower()


def _coerce_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def _coerce_float(
    value: Any,
    *,
    default: float,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _existing_storage_path(storage, key: str | None) -> str | None:
    if not key:
        return None
    candidate = storage.get_path(key)
    return candidate if Path(candidate).exists() else None


def _existing_local_path(path: str | None) -> str | None:
    if not path:
        return None
    return path if Path(path).exists() else None


def _image_embedding_candidate_keys(asset, source: str) -> list[str | None]:
    if source == "thumbnail":
        return [asset.thumbnail_key, asset.preview_key, asset.stored_key]
    if source == "preview":
        return [asset.preview_key, asset.thumbnail_key, asset.stored_key]
    return [asset.stored_key, asset.preview_key, asset.thumbnail_key]


def _video_embedding_timestamps(asset, config: dict[str, Any]) -> list[float]:
    strategy = str(config.get("video_frame_strategy") or "multi")
    duration = _coerce_float(getattr(asset, "duration_sec", None), default=0.0, minimum=0.0)

    if strategy == "timestamp":
        return [
            _coerce_float(
                config.get("video_frame_timestamp"),
                default=1.0,
                minimum=0.0,
            )
        ]

    if strategy == "fraction":
        fraction = _coerce_float(
            config.get("video_frame_fraction"),
            default=0.5,
            minimum=0.0,
            maximum=1.0,
        )
        return [duration * fraction if duration > 0 else 0.0]

    count = _coerce_int(
        config.get("video_frame_count"),
        default=3,
        minimum=1,
        maximum=16,
    )
    return evenly_spaced_timestamps(duration, count)


def _video_source_path(asset, storage) -> str | None:
    # Prefer the canonical storage path; local_path is a legacy/cache fallback.
    return _existing_storage_path(storage, asset.stored_key) or _existing_local_path(
        getattr(asset, "local_path", None)
    )


def _video_derivative_fallback_paths(asset, storage) -> list[str]:
    paths: list[str] = []
    for key in (asset.preview_key, asset.thumbnail_key):
        path = _existing_storage_path(storage, key)
        if path:
            paths.append(path)
    return paths


async def _extract_video_embedding_frames(
    *,
    asset,
    video_path: str,
    config: dict[str, Any],
    log=None,
) -> tuple[list[str], list[str]]:
    """Extract model-resolution JPEG frames for a video embedding request.

    Returns ``(paths, cleanup_paths)``. The caller owns cleanup after the daemon
    reads the temp frames.
    """
    if not _validate_video_for_thumbnail(asset, video_path):
        if log is not None:
            log.warning(
                "embedding_video_probe_failed",
                asset_id=asset.id,
                video_path=video_path,
            )
        return [], []

    resolution = _coerce_int(
        config.get("video_embed_resolution"),
        default=DEFAULT_FRAME_SIZE[0],
        minimum=64,
        maximum=1024,
    )
    target_size = (resolution, resolution)
    timestamps = _video_embedding_timestamps(asset, config)
    rotation_filters = _get_video_rotation_filters(asset)

    paths: list[str] = []
    cleanup_paths: list[str] = []
    for index, timestamp in enumerate(timestamps):
        fd, frame_path = tempfile.mkstemp(
            prefix=f"pixsim_embed_{asset.id}_{index}_",
            suffix=".jpg",
        )
        os.close(fd)
        try:
            Path(frame_path).unlink(missing_ok=True)
            ok = await extract_video_frame(
                video_path,
                frame_path,
                timestamp=timestamp,
                target_size=target_size,
                rotation_filters=rotation_filters,
                qscale=3,
                asset_id=asset.id,
                op="embedding",
            )
            if ok and _validate_extracted_frame(frame_path, asset.id):
                paths.append(frame_path)
                cleanup_paths.append(frame_path)
                continue
        except Exception as exc:
            if log is not None:
                log.warning(
                    "embedding_frame_extract_error",
                    asset_id=asset.id,
                    timestamp=timestamp,
                    error=str(exc),
                )

        try:
            Path(frame_path).unlink(missing_ok=True)
        except OSError:
            pass

    if log is not None:
        log.info(
            "embedding_video_frames_selected",
            asset_id=asset.id,
            frame_count=len(paths),
            requested_count=len(timestamps),
            strategy=config.get("video_frame_strategy"),
            resolution=resolution,
        )

    return paths, cleanup_paths


async def resolve_embedding_input_paths(
    *,
    asset,
    storage,
    config: dict[str, Any],
    log=None,
) -> tuple[list[str], list[str], str]:
    """Resolve image paths safe to send to the image embedding daemon.

    The daemon embeds images only. Video assets are converted to temporary JPEG
    frame grabs first, with thumbnail/preview image fallback when the source
    video is not locally readable.
    """
    media_type = _media_type_value(getattr(asset, "media_type", None))

    if media_type == MediaType.VIDEO.value:
        video_path = _video_source_path(asset, storage)
        if video_path:
            paths, cleanup_paths = await _extract_video_embedding_frames(
                asset=asset,
                video_path=video_path,
                config=config,
                log=log,
            )
            if paths:
                return paths, cleanup_paths, "video_frames"

        fallback_paths = _video_derivative_fallback_paths(asset, storage)
        if fallback_paths:
            if log is not None:
                log.warning(
                    "embedding_video_using_derivative_fallback",
                    asset_id=asset.id,
                    paths=fallback_paths[:3],
                )
            return [fallback_paths[0]], [], "video_derivative"

        return [], [], "video_missing_frames"

    image_source = str(config.get("image_source") or "original")
    for key in _image_embedding_candidate_keys(asset, image_source):
        path = _existing_storage_path(storage, key)
        if path:
            return [path], [], f"image_{image_source}"

    return [], [], "image_missing_path"


def aggregate_embedding_vectors(
    vectors: list[list[float]],
    *,
    input_kind: str,
    config: dict[str, Any],
) -> list[float]:
    if not vectors:
        return []
    if len(vectors) == 1 or not input_kind.startswith("video_"):
        return vectors[0]

    aggregation = str(config.get("video_frame_aggregation") or "mean")
    if aggregation != "mean":
        raise ValueError(f"Unsupported video frame aggregation: {aggregation}")

    dim = len(vectors[0])
    if any(len(vector) != dim for vector in vectors):
        raise ValueError("embedding service returned vectors with mixed dims")

    pooled = [
        sum(vector[i] for vector in vectors) / len(vectors)
        for i in range(dim)
    ]
    norm = math.sqrt(sum(value * value for value in pooled))
    if norm > 0:
        pooled = [value / norm for value in pooled]
    return pooled


def cleanup_embedding_input_paths(paths: list[str], *, log=None) -> None:
    for path in paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            if log is not None:
                log.warning("embedding_temp_cleanup_failed", path=path)
