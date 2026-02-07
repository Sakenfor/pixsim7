"""
Tests for Composition Role System.

Tests:
1. Vocab loading from VocabularyRegistry (roles vocab)
2. normalize_composition_role() with various inputs
3. map_tag_to_composition_role() for namespace/slug mapping
4. map_composition_role_to_pixverse_type() collapse logic
5. map_prompt_role_to_composition_role() for prompt segments
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
        """Test that all canonical roles are in priority list."""
        from pixsim7.backend.main.shared.composition import (
            ImageCompositionRole,
            COMPOSITION_ROLE_PRIORITY,
        )

        for role in ImageCompositionRole:
            assert role.value in COMPOSITION_ROLE_PRIORITY, f"Role {role.value} not in priority list"


# =============================================================================
# TEST: normalize_composition_role
# =============================================================================

class TestNormalizeCompositionRole:
    """Tests for normalize_composition_role function."""

    def test_normalizes_aliases(self):
        """Test that aliases normalize to canonical roles."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        # Character aliases
        assert normalize_composition_role("char") == "main_character"
        assert normalize_composition_role("hero") == "main_character"
        assert normalize_composition_role("subject") == "main_character"

        # Environment aliases
        assert normalize_composition_role("bg") == "environment"
        assert normalize_composition_role("background") == "environment"
        assert normalize_composition_role("setting") == "environment"

    def test_handles_role_prefix(self):
        """Test that role: prefix is stripped."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("role:bg") == "environment"
        assert normalize_composition_role("role:char") == "main_character"

    def test_handles_case_insensitivity(self):
        """Test that normalization is case-insensitive."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("BG") == "environment"
        assert normalize_composition_role("CHAR") == "main_character"
        assert normalize_composition_role("Main_Character") == "main_character"

    def test_returns_none_for_none(self):
        """Test that None input returns None."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role(None) is None
        assert normalize_composition_role("") is None

    def test_passthrough_for_unknown(self):
        """Test that unknown roles pass through unchanged."""
        from pixsim7.backend.main.shared.composition import normalize_composition_role

        assert normalize_composition_role("unknown_role") == "unknown_role"


# =============================================================================
# TEST: map_tag_to_composition_role
# =============================================================================

class TestMapTagToCompositionRole:
    """Tests for map_tag_to_composition_role function."""

    def test_maps_slug_directly(self):
        """Test direct slug mapping."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("char", slug="char:hero") == "main_character"
        assert map_tag_to_composition_role("role", slug="role:bg") == "environment"
        assert map_tag_to_composition_role("char", slug="char:npc") == "companion"

    def test_maps_namespace(self):
        """Test namespace-based mapping."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("npc") == "main_character"
        assert map_tag_to_composition_role("location") == "environment"
        assert map_tag_to_composition_role("prop") == "prop"
        assert map_tag_to_composition_role("camera") == "effect"

    def test_role_namespace_with_name(self):
        """Test role:* namespace uses name for normalization."""
        from pixsim7.backend.main.shared.composition import map_tag_to_composition_role

        assert map_tag_to_composition_role("role", name="environment") == "environment"
        assert map_tag_to_composition_role("role", name="character") == "main_character"

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

    def test_environment_maps_to_background(self):
        """Test that environment role maps to background."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type("environment") == "background"
        assert map_composition_role_to_pixverse_type("bg") == "background"

    def test_character_roles_map_to_subject(self):
        """Test that character roles map to subject."""
        from pixsim7.backend.main.shared.composition import map_composition_role_to_pixverse_type

        assert map_composition_role_to_pixverse_type("main_character") == "subject"
        assert map_composition_role_to_pixverse_type("companion") == "subject"
        assert map_composition_role_to_pixverse_type("prop") == "subject"

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

        assert map_prompt_role_to_composition_role("character") == "main_character"
        assert map_prompt_role_to_composition_role("setting") == "environment"
        assert map_prompt_role_to_composition_role("mood") == "style_reference"
        assert map_prompt_role_to_composition_role("action") == "effect"
        assert map_prompt_role_to_composition_role("camera") == "effect"

    def test_fallback_to_normalize(self):
        """Test that unknown prompt roles fall back to normalize."""
        from pixsim7.backend.main.shared.composition import map_prompt_role_to_composition_role

        # Unknown prompt role that is a valid alias
        assert map_prompt_role_to_composition_role("bg") == "environment"

    def test_returns_none_for_none(self):
        """Test that None input returns None."""
        from pixsim7.backend.main.shared.composition import map_prompt_role_to_composition_role

        assert map_prompt_role_to_composition_role(None) is None
        assert map_prompt_role_to_composition_role("") is None
