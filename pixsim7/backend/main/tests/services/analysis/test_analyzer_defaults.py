from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    resolve_asset_default_analyzer_id,
)


def test_resolve_asset_default_prefers_intent_override_when_valid():
    preferences = {
        "analyzer": {
            "asset_default_image_id": "asset:object-detection",
            "asset_intent_defaults": {
                "character_ingest_face": "asset:face-detection",
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
            "asset_default_image_id": "asset:object-detection",
            "asset_intent_defaults": {
                "character_ingest_face": "prompt:simple",
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
            "asset_default_image_id": "asset:object-detection",
            "asset_default_video_id": "asset:ocr",
            "asset_intent_defaults": {
                "scene_prep_style": "asset:caption",
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
            "asset_default_image_id": "asset:object-detection",
            "asset_intent_defaults": {
                "character_ingest_sheet": "asset:caption",
            },
        }
    }

    resolved = resolve_asset_default_analyzer_id(
        preferences,
        media_type="image",
        intent="  CHARACTER_INGEST_SHEET  ",
    )

    assert resolved == "asset:caption"
