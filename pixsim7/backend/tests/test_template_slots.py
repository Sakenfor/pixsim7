import pytest

import pytest

from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    migrate_template_slots,
    normalize_template_slot,
    normalize_template_slots,
)


def test_normalize_template_slots_uses_fallback_index_for_missing_slot_index() -> None:
    slots = [
        {"label": "A"},
        {"label": "B", "slot_index": 1},
        {"label": "C"},
    ]

    normalized = normalize_template_slots(slots)

    assert [slot["label"] for slot in normalized] == ["A", "B", "C"]
    assert [slot["slot_index"] for slot in normalized] == [0, 1, 2]


def test_normalize_template_slot_migrates_legacy_tag_constraints_to_tags_namespace() -> None:
    slot = normalize_template_slot(
        {
            "label": "Camera",
            "role": "camera",
            "tag_constraints": {
                "camera_angle": ["low", "dutch"],
                "perspective": "upward",
            },
        }
    )

    assert "tag_constraints" not in slot
    assert slot["tags"] == {
        "all": {
            "camera_angle": ["low", "dutch"],
            "perspective": "upward",
        }
    }


def test_migrate_template_slots_explicit_v1_to_v2_preserves_slots() -> None:
    raw = [
        {
            "label": "Mood",
            "tag_constraints": {"atmosphere": "romantic"},
        }
    ]

    migrated = migrate_template_slots(raw, schema_version=1)

    assert migrated[0]["tags"] == {"all": {"atmosphere": "romantic"}}
    assert "tag_constraints" not in migrated[0]


def test_migrate_template_slots_rejects_future_version() -> None:
    with pytest.raises(ValueError, match="unsupported slot schema version"):
        migrate_template_slots([], schema_version=TEMPLATE_SLOT_SCHEMA_VERSION + 1)


def test_normalize_template_slot_accepts_authoring_alias_tag_groups() -> None:
    slot = normalize_template_slot(
        {
            "label": "Camera",
            "role": "camera",
            "tags": {
                "all_of": {"perspective": "upward"},
                "any_of": {"camera_angle": ["low", "dutch"]},
                "none_of": {"atmosphere": ["surveillance"]},
            },
        }
    )

    assert slot["tags"] == {
        "all": {"perspective": "upward"},
        "any": {"camera_angle": ["low", "dutch"]},
        "not": {"atmosphere": ["surveillance"]},
    }


def test_normalize_template_slot_accepts_typed_preferences_and_selection_config() -> None:
    slot = normalize_template_slot(
        {
            "label": "Camera",
            "role": "camera",
            "preferences": {
                "boost_tags": {"perspective": ["upward", None], "mood": "tense"},
                "avoid_tags": {"cliche": ["yes", None]},
                "diversity_keys": ["camera_angle", "perspective", "camera_angle", "  "],
                "novelty_weight": 0.6,
                "coherence_weight": 0.4,
            },
            "selection_strategy": "llm_rerank",
            "selection_config": {
                "top_k": 12,
                "temperature": 0.7,
                "fallback_strategy": "weighted_tags",
                "timeout_ms": 1200,
                "model": "gpt-5-mini",
                "weights": {
                    "rating": 0.2,
                    "diversity": 0.5,
                    "coherence": None,
                },
            },
        }
    )

    assert slot["selection_strategy"] == "llm_rerank"
    assert slot["preferences"] == {
        "boost_tags": {"perspective": ["upward"], "mood": "tense"},
        "avoid_tags": {"cliche": ["yes"]},
        "diversity_keys": ["camera_angle", "perspective"],
        "novelty_weight": 0.6,
        "coherence_weight": 0.4,
    }
    assert slot["selection_config"] == {
        "top_k": 12,
        "temperature": 0.7,
        "fallback_strategy": "weighted_tags",
        "timeout_ms": 1200,
        "model": "gpt-5-mini",
        "weights": {"rating": 0.2, "diversity": 0.5},
    }


def test_normalize_template_slot_allows_zero_intensity() -> None:
    slot = normalize_template_slot(
        {
            "label": "Pose lock",
            "role": "subject",
            "category": "pose_lock",
            "intensity": 0,
        }
    )

    assert slot["intensity"] == 0
