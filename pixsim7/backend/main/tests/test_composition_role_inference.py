"""Tests for composition_role_inference.infer_composition_role."""

from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    CompositionRoleInference,
    infer_composition_role,
)


class TestTagBasedExact:
    """Priority 1 — tag key/value exact matches → confidence 'exact'."""

    def test_lock_tag_key(self):
        result = infer_composition_role(role="subject", category="pose_lock", tags={"lock": "pose"})
        assert result.role_id == "entities:subject"
        assert result.confidence == "exact"

    def test_pose_tag_key(self):
        result = infer_composition_role(role=None, category=None, tags={"pose": "standing"})
        assert result.role_id == "entities:subject"
        assert result.confidence == "exact"

    def test_camera_tag_value(self):
        result = infer_composition_role(role="camera", category="drift", tags={"camera": "drift_behind"})
        assert result.role_id == "camera:angle"
        assert result.confidence == "exact"

    def test_camera_composition_tag(self):
        result = infer_composition_role(role=None, category=None, tags={"camera": "camera_lock"})
        assert result.role_id == "camera:composition"
        assert result.confidence == "exact"


class TestRoleCategoryPair:
    """Priority 2 — (role, category) pair → confidence 'heuristic'."""

    def test_character_human(self):
        result = infer_composition_role(role="character", category="human")
        assert result.role_id == "entities:main_character"
        assert result.confidence == "heuristic"

    def test_character_creature(self):
        result = infer_composition_role(role="character", category="creature")
        assert result.role_id == "entities:companion"
        assert result.confidence == "heuristic"

    def test_action_entrance(self):
        result = infer_composition_role(role="action", category="entrance")
        assert result.role_id == "animation:action"
        assert result.confidence == "heuristic"

    def test_action_hold_attitude(self):
        result = infer_composition_role(role="action", category="hold_attitude")
        assert result.role_id == "animation:pose"
        assert result.confidence == "heuristic"

    def test_camera_fov(self):
        result = infer_composition_role(role="camera", category="fov")
        assert result.role_id == "camera:fov"
        assert result.confidence == "heuristic"

    def test_lighting_key(self):
        result = infer_composition_role(role="lighting", category="key")
        assert result.role_id == "lighting:key"
        assert result.confidence == "heuristic"

    def test_lighting_fill(self):
        result = infer_composition_role(role="lighting", category="fill")
        assert result.role_id == "lighting:fill"
        assert result.confidence == "heuristic"

    def test_style_rendering(self):
        result = infer_composition_role(role="style", category="rendering")
        assert result.role_id == "materials:rendering"
        assert result.confidence == "heuristic"

    def test_style_wardrobe(self):
        result = infer_composition_role(role="style", category="wardrobe")
        assert result.role_id == "materials:wardrobe"
        assert result.confidence == "heuristic"

    def test_composition_layer_order(self):
        result = infer_composition_role(role="composition", category="layer_order")
        assert result.role_id == "camera:composition"
        assert result.confidence == "heuristic"


class TestWildcardRole:
    """Priority 2b — wildcard role (any category) → confidence 'heuristic'."""

    def test_placement_any_category(self):
        result = infer_composition_role(role="placement", category="arbitrary_thing")
        assert result.role_id == "entities:placed"
        assert result.confidence == "heuristic"

    def test_environment_any_category(self):
        result = infer_composition_role(role="environment", category="forest")
        assert result.role_id == "world:environment"
        assert result.confidence == "heuristic"

    def test_setting_any_category(self):
        result = infer_composition_role(role="setting", category="medieval")
        assert result.role_id == "world:environment"
        assert result.confidence == "heuristic"

    def test_mood_any_category(self):
        result = infer_composition_role(role="mood", category="melancholy")
        assert result.role_id == "materials:atmosphere"
        assert result.confidence == "heuristic"

    def test_romance_any_category(self):
        result = infer_composition_role(role="romance", category="tender")
        assert result.role_id == "materials:romance"
        assert result.confidence == "heuristic"


class TestRoleOnlyFallback:
    """Priority 3 — role-only fallback → confidence 'heuristic'."""

    def test_character_no_category(self):
        result = infer_composition_role(role="character", category=None)
        assert result.role_id == "entities:main_character"
        assert result.confidence == "heuristic"
        assert "role-only" in result.reason

    def test_action_no_category(self):
        result = infer_composition_role(role="action", category=None)
        assert result.role_id == "animation:action"
        assert result.confidence == "heuristic"

    def test_camera_unknown_category(self):
        result = infer_composition_role(role="camera", category="unknown_cat_xyz")
        assert result.role_id == "camera:angle"
        assert result.confidence == "heuristic"
        assert "role-only" in result.reason

    def test_subject_no_category(self):
        result = infer_composition_role(role="subject", category=None)
        assert result.role_id == "entities:subject"
        assert result.confidence == "heuristic"


class TestUnknown:
    """Priority 4 — no mapping found → confidence 'unknown'."""

    def test_no_inputs(self):
        result = infer_composition_role(role=None, category=None)
        assert result.role_id is None
        assert result.confidence == "unknown"

    def test_unknown_role(self):
        result = infer_composition_role(role="zzz_nonexistent", category=None)
        assert result.role_id is None
        assert result.confidence == "unknown"

    def test_unknown_role_and_category(self):
        result = infer_composition_role(role="zzz_nonexistent", category="also_unknown")
        assert result.role_id is None
        assert result.confidence == "unknown"


class TestAmbiguous:
    """Tag-based inference finds multiple candidates → confidence 'ambiguous'."""

    def test_conflicting_tag_keys(self):
        # 'lock' → entities:subject, plus camera tag value → camera:angle
        result = infer_composition_role(
            role=None,
            category=None,
            tags={"lock": "something", "camera": "drift_behind"},
        )
        assert result.confidence == "ambiguous"
        assert result.role_id is None
        assert "camera:angle" in result.candidates
        assert "entities:subject" in result.candidates


class TestCaseInsensitivity:
    """Inputs are normalized to lowercase."""

    def test_uppercase_role(self):
        result = infer_composition_role(role="CHARACTER", category="human")
        assert result.role_id == "entities:main_character"

    def test_mixed_case_category(self):
        result = infer_composition_role(role="action", category="Hold_Attitude")
        assert result.role_id == "animation:pose"

    def test_whitespace_stripping(self):
        result = infer_composition_role(role="  camera  ", category="  fov  ")
        assert result.role_id == "camera:fov"


class TestTagPrecedenceOverRoleCategory:
    """Tags take priority over (role, category) when they match."""

    def test_tag_overrides_role_category(self):
        # Tag says entities:subject, role+category would say animation:action
        result = infer_composition_role(
            role="action",
            category="entrance",
            tags={"lock": "pose"},
        )
        assert result.role_id == "entities:subject"
        assert result.confidence == "exact"
