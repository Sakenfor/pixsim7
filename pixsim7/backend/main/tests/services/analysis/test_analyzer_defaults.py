from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    canonicalize_analyzer_preferences,
    resolve_asset_default_analyzer_id,
    resolve_asset_default_analyzer_ids,
    resolve_prompt_default_analyzer_ids,
)


def test_canonicalize_analyzer_preferences_strips_legacy_scalar_keys_without_merging():
    prefs = canonicalize_analyzer_preferences(
        {
            "prompt_default_ids": [" prompt:claude ", "prompt:claude"],
            "asset_default_image_ids": ["asset:object-detection", " asset:ocr "],
            "asset_intent_default_ids": {" Character_Ingest_Face ": [" asset:face-detection ", ""]},
            "analysis_point_default_ids": {" user:combat ": ["asset:caption"]},
            "prompt_default_id": "prompt:simple",
            "asset_default_image_id": "asset:object-detection",
            "asset_intent_defaults": {" Character_Ingest_Face ": "asset:face-detection"},
            "analysis_point_defaults": {" user:combat ": "asset:caption"},
        }
    )

    assert prefs["prompt_default_ids"] == ["prompt:claude"]
    assert prefs["asset_default_image_ids"] == ["asset:object-detection", "asset:ocr"]
    assert prefs["asset_intent_default_ids"] == {"character_ingest_face": ["asset:face-detection"]}
    assert prefs["analysis_point_default_ids"] == {"user:combat": ["asset:caption"]}
    assert "prompt_default_id" not in prefs
    assert "asset_default_image_id" not in prefs
    assert "asset_intent_defaults" not in prefs
    assert "analysis_point_defaults" not in prefs


def test_resolve_asset_default_prefers_intent_override_when_valid():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": ["asset:object-detection"],
            "asset_intent_default_ids": {
                "character_ingest_face": ["asset:face-detection"],
            },
        }
    }

    resolved = resolve_asset_default_analyzer_id(
        preferences,
        media_type="image",
        intent="character_ingest_face",
    )

    assert resolved == "asset:face-detection"


def test_resolve_asset_default_intent_override_falls_back_to_media_default_when_invalid():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": ["asset:object-detection"],
            "asset_intent_default_ids": {
                "character_ingest_face": ["prompt:simple"],
            },
        }
    }

    resolved = resolve_asset_default_analyzer_id(
        preferences,
        media_type="image",
        intent="character_ingest_face",
    )

    assert resolved == "asset:object-detection"


def test_resolve_asset_default_uses_intent_before_video_default():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": ["asset:object-detection"],
            "asset_default_video_ids": ["asset:ocr"],
            "asset_intent_default_ids": {
                "scene_prep_style": ["asset:caption"],
            },
        }
    }

    resolved = resolve_asset_default_analyzer_id(
        preferences,
        media_type="video",
        intent="scene_prep_style",
    )

    assert resolved == "asset:caption"


def test_resolve_asset_default_normalizes_intent_key():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": ["asset:object-detection"],
            "asset_intent_default_ids": {
                "character_ingest_sheet": ["asset:caption"],
            },
        }
    }

    resolved = resolve_asset_default_analyzer_id(
        preferences,
        media_type="image",
        intent="  CHARACTER_INGEST_SHEET  ",
    )

    assert resolved == "asset:caption"


def test_resolve_asset_defaults_prefers_ordered_intent_list_and_filters_invalid():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": ["asset:object-detection"],
            "asset_intent_default_ids": {
                "character_ingest_face": [
                    "prompt:simple",  # invalid target, should be ignored
                    "asset:face-detection",
                    "asset:scene-tagging",
                ]
            },
        }
    }

    resolved = resolve_asset_default_analyzer_ids(
        preferences,
        media_type="image",
        intent="character_ingest_face",
    )

    assert resolved[:3] == [
        "asset:face-detection",
        "asset:scene-tagging",
        "asset:object-detection",
    ]


def test_resolve_asset_defaults_include_media_list_fallbacks_in_order():
    preferences = {
        "analyzer": {
            "asset_default_image_ids": [
                "asset:scene-tagging",
                "asset:caption",
                "asset:object-detection",
            ]
        }
    }

    resolved = resolve_asset_default_analyzer_ids(preferences, media_type="image")

    assert resolved[:3] == [
        "asset:scene-tagging",
        "asset:caption",
        "asset:object-detection",
    ]


def test_resolve_asset_defaults_prefers_analysis_point_over_intent_and_media_defaults():
    preferences = {
        "analyzer": {
            "analysis_point_default_ids": {
                "user:combat-snapshot": [
                    "asset:scene-tagging",
                    "asset:caption",
                ],
            },
            "asset_intent_default_ids": {
                "character_ingest_face": ["asset:face-detection"],
            },
            "asset_default_image_ids": ["asset:object-detection"],
        }
    }

    resolved = resolve_asset_default_analyzer_ids(
        preferences,
        media_type="image",
        intent="character_ingest_face",
        analysis_point="user:combat-snapshot",
    )

    assert resolved[:4] == [
        "asset:scene-tagging",
        "asset:caption",
        "asset:face-detection",
        "asset:object-detection",
    ]


def test_resolve_asset_defaults_ignores_invalid_analysis_point_entries():
    preferences = {
        "analyzer": {
            "analysis_point_default_ids": {
                "user:invalid-point": [
                    "prompt:simple",
                    "asset:ocr",
                ],
            },
            "asset_default_image_ids": ["asset:object-detection"],
        }
    }

    resolved = resolve_asset_default_analyzer_ids(
        preferences,
        media_type="image",
        analysis_point="user:invalid-point",
    )

    assert resolved[:2] == [
        "asset:ocr",
        "asset:object-detection",
    ]


def test_resolve_prompt_defaults_use_ordered_fallbacks():
    preferences = {
        "analyzer": {
            "prompt_default_ids": [
                "prompt:claude",
                "prompt:openai",
            ]
        }
    }

    resolved = resolve_prompt_default_analyzer_ids(preferences)

    assert resolved[:2] == [
        "prompt:claude",
        "prompt:openai",
    ]


def test_resolve_prompt_defaults_ignores_legacy_scalar_only_input():
    preferences = {
        "analyzer": {
            "prompt_default_id": "prompt:claude",
        }
    }

    resolved = resolve_prompt_default_analyzer_ids(preferences)

    assert resolved[0] != "prompt:claude"
