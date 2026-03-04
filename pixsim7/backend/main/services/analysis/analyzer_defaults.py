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

PROMPT_DEFAULT_IDS_KEY = "prompt_default_ids"
ASSET_DEFAULT_IMAGE_IDS_KEY = "asset_default_image_ids"
ASSET_DEFAULT_VIDEO_IDS_KEY = "asset_default_video_ids"
ASSET_INTENT_DEFAULT_IDS_KEY = "asset_intent_default_ids"
ANALYSIS_POINT_DEFAULT_IDS_KEY = "analysis_point_default_ids"

# Legacy scalar keys are removed and stripped during canonicalization.
PROMPT_DEFAULT_ID_KEY = "prompt_default_id"
ASSET_DEFAULT_IMAGE_ID_KEY = "asset_default_image_id"
ASSET_DEFAULT_VIDEO_ID_KEY = "asset_default_video_id"
ASSET_INTENT_DEFAULTS_KEY = "asset_intent_defaults"
ANALYSIS_POINT_DEFAULTS_KEY = "analysis_point_defaults"
LEGACY_ANALYZER_KEYS = (
    PROMPT_DEFAULT_ID_KEY,
    ASSET_DEFAULT_IMAGE_ID_KEY,
    ASSET_DEFAULT_VIDEO_ID_KEY,
    ASSET_INTENT_DEFAULTS_KEY,
    ANALYSIS_POINT_DEFAULTS_KEY,
)


def get_analyzer_preferences(preferences: Any) -> dict[str, Any]:
    """Return users.preferences.analyzer as a dict (or empty dict)."""
    if not isinstance(preferences, dict):
        return {}
    analyzer = preferences.get("analyzer")
    if not isinstance(analyzer, dict):
        return {}
    return canonicalize_analyzer_preferences(analyzer)


def canonicalize_analyzer_preferences(analyzer_prefs: Any) -> dict[str, Any]:
    """Normalize analyzer preferences into canonical *_ids keys only."""
    if not isinstance(analyzer_prefs, dict):
        return {}

    normalized = dict(analyzer_prefs)
    _set_canonical_id_list(
        normalized,
        analyzer_prefs,
        id_key=PROMPT_DEFAULT_IDS_KEY,
    )
    _set_canonical_id_list(
        normalized,
        analyzer_prefs,
        id_key=ASSET_DEFAULT_IMAGE_IDS_KEY,
    )
    _set_canonical_id_list(
        normalized,
        analyzer_prefs,
        id_key=ASSET_DEFAULT_VIDEO_IDS_KEY,
    )
    _set_canonical_id_map(
        normalized,
        analyzer_prefs,
        id_key=ASSET_INTENT_DEFAULT_IDS_KEY,
        normalize_keys=True,
    )
    _set_canonical_id_map(
        normalized,
        analyzer_prefs,
        id_key=ANALYSIS_POINT_DEFAULT_IDS_KEY,
        normalize_keys=False,
    )

    for key in LEGACY_ANALYZER_KEYS:
        normalized.pop(key, None)
    return normalized


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


def normalize_analyzer_ids_for_target(
    analyzer_ids: Any,
    target: AnalyzerTarget,
    *,
    require_enabled: bool,
) -> list[str]:
    """Normalize scalar/list analyzer preferences into canonical analyzer IDs."""
    if analyzer_ids is None:
        return []

    raw_items: list[Any]
    if isinstance(analyzer_ids, list):
        raw_items = analyzer_ids
    else:
        raw_items = [analyzer_ids]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        candidate = normalize_analyzer_id_for_target(
            item,
            target,
            require_enabled=require_enabled,
        )
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)

    return normalized


def _append_unique(target: list[str], values: list[str]) -> None:
    seen = set(target)
    for value in values:
        if value in seen:
            continue
        target.append(value)
        seen.add(value)


def _normalize_str_list(value: Any) -> list[str]:
    raw_items = value if isinstance(value, list) else [value]
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, str):
            continue
        candidate = item.strip()
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized


def _normalize_str_list_map(value: Any, *, normalize_keys: bool) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, list[str]] = {}
    for key, raw_list in value.items():
        if not isinstance(key, str):
            continue
        normalized_key = key.strip().lower() if normalize_keys else key.strip()
        if not normalized_key:
            continue
        normalized_values = _normalize_str_list(raw_list)
        if normalized_values:
            normalized[normalized_key] = normalized_values
    return normalized


def _set_canonical_id_list(
    normalized: dict[str, Any],
    source: dict[str, Any],
    *,
    id_key: str,
) -> None:
    if id_key not in source:
        normalized.pop(id_key, None)
        return
    normalized[id_key] = _normalize_str_list(source.get(id_key))


def _set_canonical_id_map(
    normalized: dict[str, Any],
    source: dict[str, Any],
    *,
    id_key: str,
    normalize_keys: bool,
) -> None:
    if id_key not in source:
        normalized.pop(id_key, None)
        return
    normalized[id_key] = _normalize_str_list_map(
        source.get(id_key),
        normalize_keys=normalize_keys,
    )


def resolve_prompt_default_analyzer_ids(preferences: Any) -> list[str]:
    """Resolve ordered prompt analyzer defaults from user preferences + registry."""
    analyzer_prefs = get_analyzer_preferences(preferences)
    resolved: list[str] = []

    _append_unique(
        resolved,
        normalize_analyzer_ids_for_target(
            analyzer_prefs.get(PROMPT_DEFAULT_IDS_KEY),
            AnalyzerTarget.PROMPT,
            require_enabled=True,
        ),
    )

    default = analyzer_registry.get_default(AnalyzerTarget.PROMPT)
    if default and default.enabled:
        _append_unique(resolved, [default.id])

    _append_unique(resolved, [DEFAULT_PROMPT_ANALYZER_ID])
    return resolved


def resolve_prompt_default_analyzer_id(preferences: Any) -> str:
    """Resolve first prompt default analyzer ID from user preferences + registry."""
    return resolve_prompt_default_analyzer_ids(preferences)[0]


def resolve_asset_default_analyzer_ids(
    preferences: Any,
    media_type: MediaType | str | None = None,
    *,
    intent: str | None = None,
    analysis_point: str | None = None,
) -> list[str]:
    """Resolve ordered asset analyzer defaults from user preferences + registry."""
    analyzer_prefs = get_analyzer_preferences(preferences)
    normalized_media_type = _normalize_media_type(media_type)
    normalized_intent = _normalize_intent(intent)
    normalized_analysis_point = _normalize_intent(analysis_point)
    resolved: list[str] = []

    if normalized_analysis_point:
        point_default_ids = analyzer_prefs.get(ANALYSIS_POINT_DEFAULT_IDS_KEY)
        if isinstance(point_default_ids, dict):
            _append_unique(
                resolved,
                normalize_analyzer_ids_for_target(
                    point_default_ids.get(normalized_analysis_point),
                    AnalyzerTarget.ASSET,
                    require_enabled=True,
                ),
            )

    if normalized_intent:
        intent_default_ids = analyzer_prefs.get(ASSET_INTENT_DEFAULT_IDS_KEY)
        if isinstance(intent_default_ids, dict):
            _append_unique(
                resolved,
                normalize_analyzer_ids_for_target(
                    intent_default_ids.get(normalized_intent),
                    AnalyzerTarget.ASSET,
                    require_enabled=True,
                ),
            )

    id_keys = (
        [ASSET_DEFAULT_VIDEO_IDS_KEY, ASSET_DEFAULT_IMAGE_IDS_KEY]
        if normalized_media_type == MediaType.VIDEO.value
        else [ASSET_DEFAULT_IMAGE_IDS_KEY, ASSET_DEFAULT_VIDEO_IDS_KEY]
    )

    for key in id_keys:
        _append_unique(
            resolved,
            normalize_analyzer_ids_for_target(
                analyzer_prefs.get(key),
                AnalyzerTarget.ASSET,
                require_enabled=True,
            ),
        )

    default = analyzer_registry.get_default(AnalyzerTarget.ASSET)
    if default and default.enabled:
        _append_unique(resolved, [default.id])

    _append_unique(resolved, [DEFAULT_ASSET_ANALYZER_ID])
    return resolved


def resolve_asset_default_analyzer_id(
    preferences: Any,
    media_type: MediaType | str | None = None,
    *,
    intent: str | None = None,
    analysis_point: str | None = None,
) -> str:
    """Resolve first asset default analyzer ID from user preferences + registry."""
    return resolve_asset_default_analyzer_ids(
        preferences,
        media_type=media_type,
        intent=intent,
        analysis_point=analysis_point,
    )[0]


def _normalize_media_type(media_type: MediaType | str | None) -> str:
    if isinstance(media_type, MediaType):
        return media_type.value
    if isinstance(media_type, str):
        normalized = media_type.strip().lower()
        if normalized in {MediaType.IMAGE.value, MediaType.VIDEO.value}:
            return normalized
    return MediaType.IMAGE.value


def _normalize_intent(intent: Any) -> str | None:
    if not isinstance(intent, str):
        return None
    normalized = intent.strip().lower()
    return normalized or None
