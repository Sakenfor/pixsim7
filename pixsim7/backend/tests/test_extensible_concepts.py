"""
Tests for the Extensible Action Block Concepts System.

Tests:
1. ConceptRef parsing and validation
2. VocabularyRegistry loading and plugin pack discovery
3. ActionBlockTags with extensions
4. Plugin filter/scorer registration
5. Selection with plugin extensions
"""

import pytest
from pathlib import Path
from typing import Dict, Any

from pydantic import BaseModel, ValidationError


# =============================================================================
# TEST: ConceptRef Schema
# =============================================================================

class TestConceptRef:
    """Tests for ConceptRef and typed aliases."""

    def test_concept_ref_from_dict(self):
        """Test parsing ConceptRef from dict format."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        ref = ConceptRef.parse_flexible({"kind": "pose", "id": "standing_neutral"})
        assert ref is not None
        assert ref.kind == "pose"
        assert ref.id == "standing_neutral"
        assert ref.to_canonical() == "pose:standing_neutral"

    def test_concept_ref_from_canonical_string(self):
        """Test parsing from canonical 'kind:id' format."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        ref = ConceptRef.parse_flexible("mood:playful")
        assert ref is not None
        assert ref.kind == "mood"
        assert ref.id == "playful"

    def test_concept_ref_from_raw_string_with_default(self):
        """Test parsing raw string when default_kind provided."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        ref = ConceptRef.parse_flexible("standing_neutral", default_kind="pose")
        assert ref is not None
        assert ref.kind == "pose"
        assert ref.id == "standing_neutral"

    def test_concept_ref_from_raw_string_without_default_fails(self):
        """Test that raw string without default_kind raises error."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        with pytest.raises(ValueError, match="default_kind"):
            ConceptRef.parse_flexible("standing_neutral")

    def test_concept_ref_none_returns_none(self):
        """Test that None input returns None."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        assert ConceptRef.parse_flexible(None) is None

    def test_concept_ref_with_meta(self):
        """Test ConceptRef with metadata."""
        from pixsim7.backend.main.domain.ontology import ConceptRef

        ref = ConceptRef.parse_flexible({
            "kind": "pose",
            "id": "standing_mysterious",
            "meta": {"source": "plugin", "priority": 0.8}
        })
        assert ref is not None
        assert ref.meta == {"source": "plugin", "priority": 0.8}

    def test_pose_concept_ref_type_alias(self):
        """Test PoseConceptRef type alias in Pydantic model."""
        from pixsim7.backend.main.domain.ontology import PoseConceptRef

        class TestModel(BaseModel):
            pose: PoseConceptRef = None

        # Test with canonical string
        model = TestModel(pose="pose:standing_neutral")
        assert model.pose is not None
        assert model.pose.id == "standing_neutral"

        # Test with raw string (should add pose: prefix)
        model2 = TestModel(pose="sitting_close")
        assert model2.pose is not None
        assert model2.pose.kind == "pose"
        assert model2.pose.id == "sitting_close"

    def test_mood_concept_ref_type_alias(self):
        """Test MoodConceptRef type alias."""
        from pixsim7.backend.main.domain.ontology import MoodConceptRef

        class TestModel(BaseModel):
            mood: MoodConceptRef = None

        model = TestModel(mood="mysterious")
        assert model.mood is not None
        assert model.mood.kind == "mood"
        assert model.mood.id == "mysterious"

    def test_canonicalize_concept_id(self):
        """Test ID canonicalization utility."""
        from pixsim7.backend.main.domain.ontology import canonicalize_concept_id

        assert canonicalize_concept_id("standing_neutral", "pose") == "pose:standing_neutral"
        assert canonicalize_concept_id("pose:standing_neutral", "pose") == "pose:standing_neutral"
        assert canonicalize_concept_id(None, "pose") is None
        assert canonicalize_concept_id("", "pose") is None


# =============================================================================
# TEST: VocabularyRegistry
# =============================================================================

class TestVocabularyRegistry:
    """Tests for VocabularyRegistry with plugin pack support."""

    @pytest.fixture
    def registry(self):
        """Create a fresh registry for each test."""
        from pixsim7.backend.main.shared.ontology.vocabularies import (
            get_registry,
            reset_registry,
        )
        reset_registry()
        return get_registry(strict_mode=False)

    def test_registry_loads_core_vocabulary(self, registry):
        """Test that core vocabulary is loaded."""
        # Core poses should exist
        assert registry.is_known_concept("pose", "standing_neutral")
        assert registry.is_known_concept("pose", "sitting_close")

        # Core moods should exist
        assert registry.is_known_concept("mood", "playful")
        assert registry.is_known_concept("mood", "tender")

        # Core locations should exist
        assert registry.is_known_concept("location", "bench_park")
        assert registry.is_known_concept("location", "bedroom")

        # Core camera concepts should exist
        assert registry.is_known_concept("camera", "angle_pov")
        assert registry.is_known_concept("camera", "framing_closeup")

    def test_registry_loads_plugin_packs(self, registry):
        """Test that plugin vocabulary packs are discovered and loaded."""
        # Plugin concepts from example_concepts should exist
        assert registry.is_known_concept("pose", "standing_mysterious")
        assert registry.is_known_concept("mood", "mysterious")
        assert registry.is_known_concept("location", "secret_garden")

    def test_registry_pose_lookup(self, registry):
        """Test pose lookup with full details."""
        pose = registry.get_pose("pose:standing_neutral")
        assert pose is not None
        assert pose.label == "Standing Neutral"
        assert pose.category == "standing"

        # Plugin pose (uses canonical ID with prefix)
        pose2 = registry.get_pose("pose:standing_mysterious")
        assert pose2 is not None
        assert pose2.category == "standing"
        assert pose2.source == "plugin:example_concepts"

    def test_registry_pose_similarity(self, registry):
        """Test pose similarity scoring."""
        # Same pose
        score = registry.pose_similarity_score(
            "pose:standing_neutral",
            "pose:standing_neutral"
        )
        assert score == 1.0

        # Parent-child relationship
        score = registry.pose_similarity_score(
            "pose:standing_neutral",
            "pose:standing_near"
        )
        assert score > 0.5  # parent_pose partial credit

        # Same category
        score = registry.pose_similarity_score(
            "pose:standing_neutral",
            "pose:standing_embrace"
        )
        assert score > 0.0  # same_category partial credit

    def test_registry_intimacy_ordering(self, registry):
        """Test intimacy level ordering."""
        assert registry.get_intimacy_order("intimacy:none") == 0
        assert registry.get_intimacy_order("intimacy:acquaintance") == 1
        assert registry.get_intimacy_order("intimacy:light_flirt") == 2
        assert registry.get_intimacy_order("intimacy:very_intimate") == 5

        # Distance
        assert registry.intimacy_distance("intimacy:none", "intimacy:acquaintance") == 1
        assert registry.intimacy_distance("intimacy:none", "intimacy:very_intimate") == 5

    def test_registry_rating_levels(self, registry):
        """Test content rating levels."""
        assert registry.get_rating_level("rating:sfw") == 0
        assert registry.get_rating_level("rating:restricted") == 3
        assert registry.is_rating_allowed("rating:romantic", "rating:mature_implied")
        assert not registry.is_rating_allowed("rating:restricted", "rating:mature_implied")

    def test_registry_strict_mode_validation(self):
        """Test strict mode concept validation."""
        from pixsim7.backend.main.shared.ontology.vocabularies import (
            get_registry,
            reset_registry,
        )
        reset_registry()

        registry = get_registry(strict_mode=True)

        # Known concept should pass
        registry.validate_concept("pose", "standing_neutral")

        # Unknown concept should fail
        with pytest.raises(ValueError, match="Unknown pose concept"):
            registry.validate_concept("pose", "nonexistent_pose")

    def test_registry_non_strict_mode(self):
        """Test non-strict mode allows unknown concepts."""
        from pixsim7.backend.main.shared.ontology.vocabularies import (
            get_registry,
            reset_registry,
        )
        reset_registry()

        registry = get_registry(strict_mode=False)

        # Should not raise for unknown concept
        registry.validate_concept("pose", "nonexistent_pose")

    def test_registry_plugin_packs_listed(self, registry):
        """Test that loaded plugin packs are listed via registry.packs."""
        packs = registry.packs
        plugin_pack = next(
            (p for p in packs if p.plugin_id == "example_concepts"),
            None
        )
        assert plugin_pack is not None
        assert plugin_pack.id == "plugin_example_concepts"

    def test_registry_keyword_index_includes_camera_keywords(self, registry):
        """Camera vocabulary keywords should be indexed for ontology lookup."""
        keyword_to_ids = registry.get_keyword_to_ids()
        assert "point_of_view" in keyword_to_ids
        assert "camera:angle_pov" in keyword_to_ids["point_of_view"]


# =============================================================================
# TEST: ActionBlockTags Extensions
# =============================================================================

class TestActionBlockTagsExtensions:
    """Tests for ActionBlockTags with extensions field."""

    def test_tags_with_valid_extensions(self):
        """Test creating tags with properly namespaced extensions."""
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlockTags,
        )

        tags = ActionBlockTags(
            pose="pose:standing_neutral",
            mood="mood:playful",
            extensions={
                "my_plugin.custom_data": {"value": 42},
                "my_plugin.enabled": True,
            },
        )

        assert tags.extensions["my_plugin.custom_data"] == {"value": 42}
        assert tags.get_extension("my_plugin", "enabled") is True

    def test_tags_with_invalid_extension_key_fails(self):
        """Test that non-namespaced extension keys fail validation."""
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlockTags,
        )

        with pytest.raises(ValidationError):
            ActionBlockTags(
                pose="pose:standing_neutral",
                extensions={
                    "not_namespaced": True,  # Missing plugin_id.key format
                },
            )

    def test_tags_extension_getter(self):
        """Test get_extension helper method."""
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlockTags,
        )

        tags = ActionBlockTags(
            extensions={
                "plugin_a.setting": "value_a",
                "plugin_b.setting": "value_b",
            },
        )

        assert tags.get_extension("plugin_a", "setting") == "value_a"
        assert tags.get_extension("plugin_b", "setting") == "value_b"
        assert tags.get_extension("plugin_c", "missing", "default") == "default"


# =============================================================================
# TEST: ActionBlock Extensions
# =============================================================================

class TestActionBlockExtensions:
    """Tests for ActionBlock with extensions field."""

    def test_block_with_extensions(self):
        """Test creating ActionBlock with extensions."""
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionBlockTags,
            ReferenceImage,
        )

        block = ActionBlock(
            id="test_block",
            kind="single_state",
            tags=ActionBlockTags(
                mood="mood:mysterious",
                extensions={"example_concepts.boost": 0.2},
            ),
            referenceImage=ReferenceImage(tags=["test"]),
            prompt="Test prompt",
            extensions={
                "example_concepts.priority": 0.8,
                "example_concepts.featured": True,
            },
        )

        assert block.get_extension("example_concepts", "priority") == 0.8
        assert block.get_extension("example_concepts", "featured") is True
        assert block.get_tag_extension("example_concepts", "boost") == 0.2

    def test_block_extension_getter_default(self):
        """Test extension getter with default value."""
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionBlockTags,
            ReferenceImage,
        )

        block = ActionBlock(
            id="test_block",
            kind="single_state",
            tags=ActionBlockTags(),
            referenceImage=ReferenceImage(tags=["test"]),
            prompt="Test prompt",
        )

        assert block.get_extension("missing_plugin", "key", "default") == "default"


# =============================================================================
# TEST: Plugin Extension Registry
# =============================================================================

class TestPluginExtensionRegistry:
    """Tests for plugin filter/scorer registration."""

    @pytest.fixture
    def extension_registry(self):
        """Create fresh extension registry."""
        from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
            reset_plugin_extensions,
            get_plugin_extensions,
        )
        reset_plugin_extensions()
        return get_plugin_extensions()

    def test_register_scorer(self, extension_registry):
        """Test registering a custom scorer."""
        from pixsim7.backend.main.domain.narrative.action_blocks.scorers import BlockScorer
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        class TestScorer(BlockScorer):
            def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
                return 0.75

        scorer_id = extension_registry.register_scorer(
            TestScorer(weight=0.1),
            plugin_id="test_plugin",
            priority=5,
        )

        assert scorer_id == "test_plugin.TestScorer"
        scorers = extension_registry.get_plugin_scorers()
        assert len(scorers) == 1
        assert scorers[0].weight == 0.1

    def test_register_filter(self, extension_registry):
        """Test registering a custom filter."""
        from pixsim7.backend.main.domain.narrative.action_blocks.filters import BlockFilter
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        class TestFilter(BlockFilter):
            def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
                return True

        filter_id = extension_registry.register_filter(
            TestFilter(),
            plugin_id="test_plugin",
            priority=10,
        )

        assert filter_id == "test_plugin.TestFilter"
        filters = extension_registry.get_plugin_filters()
        assert len(filters) == 1

    def test_clear_plugin_extensions(self, extension_registry):
        """Test clearing all extensions for a plugin."""
        from pixsim7.backend.main.domain.narrative.action_blocks.scorers import BlockScorer
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        class TestScorer(BlockScorer):
            def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
                return 0.5

        extension_registry.register_scorer(
            TestScorer(weight=0.1),
            plugin_id="test_plugin",
        )

        assert len(extension_registry.get_plugin_scorers()) == 1

        extension_registry.clear_plugin("test_plugin")

        assert len(extension_registry.get_plugin_scorers()) == 0

    def test_scorer_priority_ordering(self, extension_registry):
        """Test that scorers are returned in priority order."""
        from pixsim7.backend.main.domain.narrative.action_blocks.scorers import BlockScorer
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        class LowPriorityScorer(BlockScorer):
            def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
                return 0.1

        class HighPriorityScorer(BlockScorer):
            def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
                return 0.9

        extension_registry.register_scorer(
            LowPriorityScorer(weight=0.1),
            plugin_id="test",
            priority=1,
        )
        extension_registry.register_scorer(
            HighPriorityScorer(weight=0.1),
            plugin_id="test",
            priority=10,
        )

        scorers = extension_registry.get_plugin_scorers()
        assert len(scorers) == 2
        # Higher priority should come first
        assert isinstance(scorers[0], HighPriorityScorer)


# =============================================================================
# TEST: Integration - Selection with Plugin Extensions
# =============================================================================

class TestSelectionWithPluginExtensions:
    """Integration tests for selection with plugin filters/scorers."""

    def test_create_scorers_with_plugins(self):
        """Test creating composite scorer with plugin scorers included."""
        from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
            reset_plugin_extensions,
            get_plugin_extensions,
            create_scorers_with_plugins,
        )
        from pixsim7.backend.main.domain.narrative.action_blocks.scorers import BlockScorer
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        reset_plugin_extensions()
        registry = get_plugin_extensions()

        class PluginScorer(BlockScorer):
            def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
                return 1.0 if block.tags.mood == "mood:mysterious" else 0.5

        registry.register_scorer(
            PluginScorer(weight=0.2),
            plugin_id="test",
        )

        composite = create_scorers_with_plugins()

        # Should have core scorers + 1 plugin scorer
        assert len(composite.scorers) > 1
        assert any(isinstance(s, PluginScorer) for s in composite.scorers)

    def test_create_filters_with_plugins(self):
        """Test creating composite filter with plugin filters included."""
        from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
            reset_plugin_extensions,
            get_plugin_extensions,
            create_filters_with_plugins,
        )
        from pixsim7.backend.main.domain.narrative.action_blocks.filters import BlockFilter
        from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
            ActionBlock,
            ActionSelectionContext,
        )

        reset_plugin_extensions()
        registry = get_plugin_extensions()

        class PluginFilter(BlockFilter):
            def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
                return block.get_extension("test", "enabled", True)

        registry.register_filter(
            PluginFilter(),
            plugin_id="test",
        )

        composite = create_filters_with_plugins()

        # Should have core filters + 1 plugin filter
        assert len(composite.filters) > 1
        assert any(isinstance(f, PluginFilter) for f in composite.filters)


# =============================================================================
# TEST: Demo Plugin Concepts
# =============================================================================

class TestDemoPluginConcepts:
    """Test that the demo plugin concepts are properly loaded."""

    @pytest.fixture
    def registry(self):
        """Create a fresh registry."""
        from pixsim7.backend.main.shared.ontology.vocabularies import (
            reset_registry,
            get_registry,
        )
        reset_registry()
        return get_registry(strict_mode=False)

    def test_mysterious_pose_loaded(self, registry):
        """Test that mysterious pose from demo plugin is loaded."""
        pose = registry.get_pose("pose:standing_mysterious")
        assert pose is not None
        assert pose.category == "standing"
        assert "mysterious" in pose.detector_labels

    def test_mysterious_mood_loaded(self, registry):
        """Test that mysterious mood from demo plugin is loaded."""
        mood = registry.get_mood("mood:mysterious")
        assert mood is not None
        assert "enigmatic" in mood.keywords

    def test_secret_garden_location_loaded(self, registry):
        """Test that secret garden location from demo plugin is loaded."""
        location = registry.get_location("location:secret_garden")
        assert location is not None
        assert location.romantic is True
        assert location.private is True


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
