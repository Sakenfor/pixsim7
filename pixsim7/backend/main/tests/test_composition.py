"""
Tests for Composition Role System.

Tests:
1. Vocab loading from VocabularyRegistry (roles vocab)
2. normalize_composition_role() with various inputs
3. map_tag_to_composition_role() for namespace/slug mapping
4. map_composition_role_to_pixverse_type() collapse logic
5. map_prompt_role_to_composition_role() for prompt segments
6. Hierarchical role structure (groups, parents, backward compat)
"""

import pytest


# =============================================================================
# TEST: Vocab Loading
# =============================================================================

class TestVocabLoading:
    """Tests for loading composition roles from vocab registry."""

    def test_vocab_loads_successfully(self):
        """Test that the vocab registry loads without error."""
        from pixsim7.backend.main.shared.composition import (
            COMPOSITION_ROLE_ALIASES,
            TAG_NAMESPACE_TO_COMPOSITION_ROLE,
            TAG_SLUG_TO_COMPOSITION_ROLE,
            COMPOSITION_ROLE_PRIORITY,
        )

        # Verify dicts are populated
        assert len(COMPOSITION_ROLE_ALIASES) > 0
        assert len(TAG_NAMESPACE_TO_COMPOSITION_ROLE) > 0
        assert len(TAG_SLUG_TO_COMPOSITION_ROLE) > 0
        assert len(COMPOSITION_ROLE_PRIORITY) > 0

    def test_yaml_has_canonical_roles(self):
        """Test that all leaf roles are in priority list."""
        from pixsim7.backend.main.shared.composition import (
            ImageCompositionRole,
            COMPOSITION_ROLE_PRIORITY,
            is_group_role,
        )

        for role in ImageCompositionRole:
            if not is_group_role(role.value):
                assert role.value in COMPOSITION_ROLE_PRIORITY, (
                    f"Leaf role {role.value} not in priority list"
                )

    def test_hierarchical_role_ids(self):
        """Test that hierarchical role IDs are present."""
        from pixsim7.backend.main.shared.composition import ImageCompositionRole

        role_values = {r.value for r in ImageCompositionRole}
        assert "entities:main_character" in role_values
        assert "entities:companion" in role_values
        assert "entities:prop" in role_values
        assert "world:environment" in role_values
        assert "world:setting" in role_values
        assert "camera:angle" in role_values
        assert "lighting:key" in role_values
        assert "materials:rendering" in role_values
        assert "materials:atmosphere" in role_values
        assert "materials:romance" in role_values
        assert "animation:action" in role_values
        assert "animation:pose" in role_values


# =============================================================================
# TEST: normalize_composition_role
# =============================================================================

class TestNormalizeCompositionRole:
    """Tests for normalize_composition_role function."""

    def test_normalizes_aliases(self):
        """Test that aliases normalize to canonical hierarchical roles."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        # Character aliases
        assert normalize_composition_role("char") == "entities:main_character"
        assert normalize_composition_role("hero") == "entities:main_character"
        assert normalize_composition_role("subject") == "entities:subject"

        # Environment aliases
        assert normalize_composition_role("bg") == "world:environment"
        assert normalize_composition_role("background") == "world:environment"
        assert normalize_composition_role("setting") == "world:environment"

        # Style aliases
        assert normalize_composition_role("style") == "materials:rendering"
        assert normalize_composition_role("reference") == "materials:rendering"
        assert normalize_composition_role("style_reference") == "materials:rendering"

    def test_backward_compat_old_flat_ids(self):
        """Test that old flat IDs normalize to hierarchical ones via aliases."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("main_character") == "entities:main_character"
        assert normalize_composition_role("companion") == "entities:companion"
        assert normalize_composition_role("environment") == "world:environment"
        assert normalize_composition_role("prop") == "entities:prop"
        assert normalize_composition_role("effect") == "animation:action"

    def test_handles_role_prefix(self):
        """Test that role: prefix is stripped."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("role:bg") == "world:environment"
        assert normalize_composition_role("role:char") == "entities:main_character"

    def test_handles_case_insensitivity(self):
        """Test that normalization is case-insensitive."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("BG") == "world:environment"
        assert normalize_composition_role("CHAR") == "entities:main_character"

    def test_returns_none_for_none(self):
        """Test that None input returns None."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role(None) is None
        assert normalize_composition_role("") is None

    def test_passthrough_for_unknown(self):
        """Test that unknown roles pass through unchanged."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("unknown_role") == "unknown_role"

    def test_hierarchical_ids_passthrough(self):
        """Test that already-hierarchical IDs pass through correctly."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("entities:main_character") == "entities:main_character"
        assert normalize_composition_role("world:environment") == "world:environment"
        assert normalize_composition_role("camera:angle") == "camera:angle"


# =============================================================================
# TEST: map_tag_to_composition_role
# =============================================================================

class TestMapTagToCompositionRole:
    """Tests for map_tag_to_composition_role function."""

    def test_maps_slug_directly(self):
        """Test direct slug mapping."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("char", slug="char:hero") == "entities:main_character"
        assert map_tag_to_composition_role("role", slug="role:bg") == "world:environment"
        assert map_tag_to_composition_role("char", slug="char:npc") == "entities:companion"

    def test_maps_namespace(self):
        """Test namespace-based mapping."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("npc") == "entities:main_character"
        assert map_tag_to_composition_role("location") == "world:environment"
        assert map_tag_to_composition_role("prop") == "entities:prop"
        assert map_tag_to_composition_role("camera") == "camera:angle"

    def test_role_namespace_with_name(self):
        """Test role:* namespace uses name for normalization."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("role", name="environment") == "world:environment"
        assert map_tag_to_composition_role("role", name="character") == "entities:main_character"

    def test_returns_none_for_none(self):
        """Test that None namespace returns None."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role(None) is None
        assert map_tag_to_composition_role("") is None


# =============================================================================
# TEST: map_composition_role_to_pixverse_type
# =============================================================================

class TestMapToPixverseType:
    """Tests for map_composition_role_to_pixverse_type function."""

    def test_world_roles_map_to_background(self):
        """Test that world group roles map to background."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type("world:environment") == "background"
        assert map_composition_role_to_pixverse_type("world:setting") == "background"
        assert map_composition_role_to_pixverse_type("bg") == "background"
        assert map_composition_role_to_pixverse_type("environment") == "background"

    def test_character_roles_map_to_subject(self):
        """Test that character roles map to subject."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type("entities:main_character") == "subject"
        assert map_composition_role_to_pixverse_type("entities:companion") == "subject"
        assert map_composition_role_to_pixverse_type("entities:prop") == "subject"
        assert map_composition_role_to_pixverse_type("main_character") == "subject"

    def test_layer_fallback(self):
        """Test layer-based fallback when role is None."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type(None, layer=0) == "background"
        assert map_composition_role_to_pixverse_type(None, layer=-1) == "background"
        assert map_composition_role_to_pixverse_type(None, layer=1) == "subject"
        assert map_composition_role_to_pixverse_type(None, layer=5) == "subject"

    def test_returns_none_without_role_or_layer(self):
        """Test that None is returned when no role or layer."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type(None) is None


# =============================================================================
# TEST: map_prompt_role_to_composition_role
# =============================================================================

class TestMapPromptRoleToCompositionRole:
    """Tests for map_prompt_role_to_composition_role function."""

    def test_maps_prompt_roles(self):
        """Test mapping from prompt segment roles."""
        from pixsim7.backend.main.shared.composition import map_prompt_role_to_composition_role

        assert map_prompt_role_to_composition_role("character") == "entities:main_character"
        assert map_prompt_role_to_composition_role("setting") == "world:environment"
        assert map_prompt_role_to_composition_role("mood") == "materials:atmosphere"
        assert map_prompt_role_to_composition_role("romance") == "materials:romance"
        assert map_prompt_role_to_composition_role("action") == "animation:action"
        assert map_prompt_role_to_composition_role("camera") == "camera:angle"

    def test_fallback_to_normalize(self):
        """Test that unknown prompt roles fall back to normalize."""
        from pixsim7.backend.main.shared.composition import map_prompt_role_to_composition_role

        # Unknown prompt role that is a valid alias
        assert map_prompt_role_to_composition_role("bg") == "world:environment"

    def test_returns_none_for_none(self):
        """Test that None input returns None."""
        from pixsim7.backend.main.shared.composition import map_prompt_role_to_composition_role

        assert map_prompt_role_to_composition_role(None) is None
        assert map_prompt_role_to_composition_role("") is None


# =============================================================================
# TEST: Hierarchical Structure
# =============================================================================

class TestHierarchicalStructure:
    """Tests for hierarchical role organization."""

    def test_group_detection(self):
        """Test that group roles are correctly detected."""
        from pixsim7.backend.main.shared.composition import is_group_role

        assert is_group_role("entities") is True
        assert is_group_role("world") is True
        assert is_group_role("camera") is True
        assert is_group_role("lighting") is True
        assert is_group_role("materials") is True
        assert is_group_role("animation") is True

        assert is_group_role("entities:main_character") is False
        assert is_group_role("world:environment") is False

    def test_get_role_group(self):
        """Test group extraction from hierarchical IDs."""
        from pixsim7.backend.main.shared.composition import get_role_group

        assert get_role_group("entities:main_character") == "entities"
        assert get_role_group("world:environment") == "world"
        assert get_role_group("camera:angle") == "camera"
        assert get_role_group("lighting:key") == "lighting"
        assert get_role_group("materials:rendering") == "materials"
        assert get_role_group("animation:action") == "animation"

    def test_groups_excluded_from_priority(self):
        """Test that group roles are NOT in the priority list."""
        from pixsim7.backend.main.shared.composition import COMPOSITION_ROLE_PRIORITY

        groups = {"entities", "world", "camera", "lighting", "materials", "animation"}
        for group in groups:
            assert group not in COMPOSITION_ROLE_PRIORITY, (
                f"Group '{group}' should not be in priority list"
            )

    def test_role_data_has_parent(self):
        """Test that role metadata includes parent field."""
        from pixsim7.backend.main.shared.composition import get_composition_role_metadata

        metadata = get_composition_role_metadata()
        mc = metadata.get("entities:main_character")
        assert mc is not None
        assert mc["parent"] == "entities"
        assert mc["isGroup"] is False

        entities = metadata.get("entities")
        assert entities is not None
        assert entities["parent"] is None
        assert entities["isGroup"] is True
