"""Embedding-input selection config for the ``asset:embedding`` analyzer.

Single source of truth for the config keys that drive media-type-aware
embedding input selection (plan ``embedding-input-selection-media-aware``):
images embed the original; videos embed N frames at model resolution, never the
raw ``.mp4``.

These defaults live on the analyzer's ``config`` and are surfaced as
``instance_options`` (storage="config"), so per-instance overrides flow through
``AssetAnalysis.effective_config_hash`` — changing a strategy re-embeds cleanly
instead of false-deduping against vectors built under the old strategy.

The worker (c3) resolves the effective config via
``resolve_embedding_input_config(analyzer_config, instance_config, analysis_params)``
so ``analysis.params`` beats per-instance config beats analyzer defaults.
"""
from __future__ import annotations

from typing import Any

# Allowed values for the ``select`` controls.
IMAGE_SOURCES: tuple[str, ...] = ("original", "preview", "thumbnail")
VIDEO_FRAME_STRATEGIES: tuple[str, ...] = ("timestamp", "fraction", "multi")
VIDEO_FRAME_AGGREGATIONS: tuple[str, ...] = ("mean",)

# Default config — mirrors the plan body. Default video path is multi-frame
# averaged (3 evenly-spaced frames, mean-pool) per user decision 2026-06-19.
EMBEDDING_INPUT_CONFIG_DEFAULTS: dict[str, Any] = {
    "image_source": "original",          # original | preview | thumbnail
    "video_frame_strategy": "multi",     # timestamp | fraction | multi
    "video_frame_timestamp": 1.0,        # seconds, for "timestamp"
    "video_frame_fraction": 0.5,         # 0..1 of duration, for "fraction"
    "video_frame_count": 3,              # N evenly-spaced, for "multi"
    "video_embed_resolution": 384,       # grab at model res, not the 320 thumb
    "video_frame_aggregation": "mean",   # combine multi-frame vectors
}


def resolve_embedding_input_config(*layers: dict[str, Any] | None) -> dict[str, Any]:
    """Merge override ``layers`` onto the defaults; later layers win.

    Only keys recognised by :data:`EMBEDDING_INPUT_CONFIG_DEFAULTS` are honoured,
    and ``None`` values are ignored (so a sparsely-populated params dict doesn't
    blow away a meaningful default). Unknown keys in a layer are left alone — the
    layer dict may carry other analyzer config besides these.
    """
    resolved = dict(EMBEDDING_INPUT_CONFIG_DEFAULTS)
    for layer in layers:
        if not layer:
            continue
        for key in EMBEDDING_INPUT_CONFIG_DEFAULTS:
            value = layer.get(key)
            if value is not None:
                resolved[key] = value
    return resolved
