"""
Analyzer default resolution helpers.

Provides a canonical way to resolve prompt/asset analyzer defaults from
user preferences.
"""
from __future__ import annotations

from typing import Any

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.prompt.parser import AnalyzerTarget, analyzer_registry

DEFAULT_PROMPT_ANALYZER_ID = "prompt:simple"
DEFAULT_ASSET_ANALYZER_ID = "asset:object-detection"

PROMPT_DEFAULT_ID_KEY = "prompt_default_id"
ASSET_DEFAULT_IMAGE_ID_KEY = "asset_default_image_id"
ASSET_DEFAULT_VIDEO_ID_KEY = "asset_default_video_id"


def get_analyzer_preferences(preferences: Any) -> dict[str, Any]:
    """Return users.preferences.analyzer as a dict (or empty dict)."""
    if not isinstance(preferences, dict):
        return {}
    analyzer = preferences.get("analyzer")
    if not isinstance(analyzer, dict):
        return {}
    return analyzer


def normalize_analyzer_id_for_target(
    analyzer_id: Any,
    target: AnalyzerTarget,
    *,
    require_enabled: bool,
) -> str | None:
    """Return canonical analyzer ID for target, or None if invalid."""
    if not isinstance(analyzer_id, str):
        return None

    candidate = analyzer_registry.resolve_legacy(analyzer_id.strip())
    if not candidate:
        return None

    analyzer = analyzer_registry.get(candidate)
    if not analyzer or analyzer.target != target:
        return None
    if require_enabled and not analyzer.enabled:
        return None
    return candidate


def resolve_prompt_default_analyzer_id(preferences: Any) -> str:
    """Resolve prompt default analyzer ID from user preferences + registry."""
    analyzer_prefs = get_analyzer_preferences(preferences)

    preferred = normalize_analyzer_id_for_target(
        analyzer_prefs.get(PROMPT_DEFAULT_ID_KEY),
        AnalyzerTarget.PROMPT,
        require_enabled=True,
    )
    if preferred:
        return preferred

    default = analyzer_registry.get_default(AnalyzerTarget.PROMPT)
    if default and default.enabled:
        return default.id
    return DEFAULT_PROMPT_ANALYZER_ID


def resolve_asset_default_analyzer_id(
    preferences: Any,
    media_type: MediaType | str | None = None,
) -> str:
    """Resolve asset default analyzer ID from user preferences + registry."""
    analyzer_prefs = get_analyzer_preferences(preferences)
    normalized_media_type = _normalize_media_type(media_type)

    keys = (
        [ASSET_DEFAULT_VIDEO_ID_KEY, ASSET_DEFAULT_IMAGE_ID_KEY]
        if normalized_media_type == MediaType.VIDEO.value
        else [ASSET_DEFAULT_IMAGE_ID_KEY, ASSET_DEFAULT_VIDEO_ID_KEY]
    )

    for key in keys:
        preferred = normalize_analyzer_id_for_target(
            analyzer_prefs.get(key),
            AnalyzerTarget.ASSET,
            require_enabled=True,
        )
        if preferred:
            return preferred

    default = analyzer_registry.get_default(AnalyzerTarget.ASSET)
    if default and default.enabled:
        return default.id
    return DEFAULT_ASSET_ANALYZER_ID


def _normalize_media_type(media_type: MediaType | str | None) -> str:
    if isinstance(media_type, MediaType):
        return media_type.value
    if isinstance(media_type, str):
        normalized = media_type.strip().lower()
        if normalized in {MediaType.IMAGE.value, MediaType.VIDEO.value}:
            return normalized
    return MediaType.IMAGE.value
