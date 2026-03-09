"""Tests for the guidance plan system: schema, compiler, validator, and formatter."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from pixsim7.backend.main.shared.schemas.guidance_plan import (
    GuidanceConstraints,
    GuidanceMask,
    GuidancePlanV1,
    GuidanceReference,
    GuidanceRegion,
)
from pixsim7.backend.main.services.guidance.compiler import merge_guidance_plans
from pixsim7.backend.main.services.guidance.validator import (
    GuidanceValidationResult,
    validate_guidance_plan,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_guidance import (
    GuidanceFormatterResult,
    format_references_for_pixverse,
)


# =========================================================================
# Schema parsing
# =========================================================================

class TestSchemaParsing:
    """GuidancePlanV1 round-trip parsing."""

    def test_minimal_valid_plan(self):
        plan = GuidancePlanV1.model_validate({"version": 1})
        assert plan.version == 1
        assert plan.references is None

    def test_full_plan_roundtrip(self):
        data = {
            "version": 1,
            "references": {
                "woman": {
                    "asset_id": "asset:5",
                    "kind": "identity",
                    "priority": 1,
                    "label": "main woman",
                },
                "bg": {
                    "asset_id": 42,
                    "kind": "style",
                    "priority": 2,
                },
            },
            "regions": {
                "woman": [
                    {"box": [0.1, 0.2, 0.5, 0.8], "binding_key": "woman", "strength": 0.9},
                ],
            },
            "masks": {
                "fg_mask": {"format": "url", "data": "https://example.com/mask.png"},
            },
            "constraints": {
                "lock_camera": True,
                "style_strength": 0.7,
            },
            "provenance": {
                "source": "template_builder",
                "template_id": "tmpl-abc",
            },
        }
        plan = GuidancePlanV1.model_validate(data)
        assert len(plan.references) == 2
        assert plan.references["woman"].label == "main woman"
        assert plan.regions["woman"][0].strength == 0.9
        assert plan.masks["fg_mask"].format == "url"
        assert plan.constraints.lock_camera is True
        assert plan.constraints.style_strength == 0.7
        assert plan.provenance.source == "template_builder"

    def test_reference_numeric_asset_id(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {"char": {"asset_id": 123, "kind": "identity"}},
        })
        assert plan.references["char"].asset_id == 123

    def test_invalid_version(self):
        with pytest.raises(ValidationError):
            GuidancePlanV1.model_validate({"version": 2})

    def test_invalid_region_box_out_of_range(self):
        with pytest.raises(ValidationError, match="outside normalized range"):
            GuidanceRegion.model_validate({
                "box": [0.0, 0.0, 1.5, 1.0],
                "binding_key": "test",
            })

    def test_invalid_region_box_x1_gte_x2(self):
        with pytest.raises(ValidationError, match="must be < x2"):
            GuidanceRegion.model_validate({
                "box": [0.5, 0.0, 0.3, 1.0],
                "binding_key": "test",
            })

    def test_invalid_mask_format(self):
        with pytest.raises(ValidationError):
            GuidanceMask.model_validate({"format": "invalid", "data": "foo"})

    def test_strength_out_of_range(self):
        with pytest.raises(ValidationError):
            GuidanceConstraints.model_validate({"style_strength": 1.5})

    def test_extra_fields_allowed(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "future_section": {"hello": "world"},
        })
        assert plan.version == 1


# =========================================================================
# Compiler
# =========================================================================

class TestCompiler:
    """merge_guidance_plans scenarios."""

    def test_single_partial(self):
        partial = {
            "references": {"woman": {"asset_id": "asset:5", "kind": "identity"}},
        }
        plan, warnings = merge_guidance_plans(partial)
        assert plan.references is not None
        assert "woman" in plan.references
        assert len(warnings) == 0

    def test_references_last_writer_wins(self):
        p1 = {"references": {"woman": {"asset_id": "asset:5", "kind": "identity"}}}
        p2 = {"references": {"woman": {"asset_id": "asset:10", "kind": "identity"}}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert plan.references["woman"].asset_id == "asset:10"
        assert any("asset_id changed" in w for w in warnings)

    def test_references_no_warn_when_same_asset(self):
        p1 = {"references": {"woman": {"asset_id": "asset:5", "kind": "identity"}}}
        p2 = {"references": {"woman": {"asset_id": "asset:5", "kind": "pose"}}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert plan.references["woman"].kind == "pose"
        assert not any("asset_id changed" in w for w in warnings)

    def test_regions_append_and_dedupe(self):
        box_a = [0.1, 0.2, 0.5, 0.8]
        box_b = [0.2, 0.3, 0.6, 0.9]
        p1 = {"regions": {"woman": [
            {"box": box_a, "binding_key": "woman"},
        ]}}
        p2 = {"regions": {"woman": [
            {"box": box_a, "binding_key": "woman"},  # duplicate
            {"box": box_b, "binding_key": "woman"},
        ]}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert len(plan.regions["woman"]) == 2  # deduped

    def test_regions_cap(self):
        regions = [
            {"box": [0.0, 0.0, round(0.1 * (i + 1), 1), 1.0], "binding_key": "char"}
            for i in range(12)
        ]
        p1 = {"regions": {"char": regions}}
        plan, warnings = merge_guidance_plans(p1, max_regions_per_role=5)
        assert len(plan.regions["char"]) == 5
        assert any("capped" in w for w in warnings)

    def test_constraints_conflict_warning(self):
        p1 = {"constraints": {"lock_camera": True}}
        p2 = {"constraints": {"lock_camera": False}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert plan.constraints.lock_camera is False  # last writer wins
        assert any("Constraint 'lock_camera' conflict" in w for w in warnings)

    def test_masks_last_writer_wins(self):
        p1 = {"masks": {"fg": {"format": "url", "data": "a.png"}}}
        p2 = {"masks": {"fg": {"format": "url", "data": "b.png"}}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert plan.masks["fg"].data == "b.png"

    def test_provenance_merge(self):
        p1 = {"provenance": {"source": "template_builder"}}
        p2 = {"provenance": {"template_id": "tmpl-1"}}
        plan, warnings = merge_guidance_plans(p1, p2)
        assert plan.provenance.source == "template_builder"
        assert plan.provenance.template_id == "tmpl-1"

    def test_non_dict_partial_skipped(self):
        plan, warnings = merge_guidance_plans("not a dict", {"version": 1})
        assert plan.version == 1
        assert any("non-dict" in w for w in warnings)

    def test_empty_partials(self):
        plan, warnings = merge_guidance_plans()
        assert plan.version == 1
        assert plan.references is None


# =========================================================================
# Validator
# =========================================================================

class TestValidator:
    """validate_guidance_plan rules."""

    def test_valid_plan(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {"woman": {"asset_id": "asset:5", "kind": "identity"}},
        })
        result = validate_guidance_plan(plan)
        assert result.is_valid
        assert len(result.errors) == 0

    def test_empty_plan_warning(self):
        plan = GuidancePlanV1.model_validate({"version": 1})
        result = validate_guidance_plan(plan)
        assert result.is_valid  # warnings don't block
        assert any("no sections" in w for w in result.warnings)

    def test_empty_asset_id_error(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {"woman": {"asset_id": "", "kind": "identity"}},
        })
        result = validate_guidance_plan(plan)
        assert not result.is_valid
        assert any("empty asset_id" in e for e in result.errors)

    def test_unknown_binding_key_warning(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {"mystery": {"asset_id": "asset:5", "kind": "identity"}},
        })
        result = validate_guidance_plan(plan, known_binding_keys={"woman", "man"})
        assert result.is_valid
        assert any("mystery" in w and "not in known bindings" in w for w in result.warnings)

    def test_unknown_asset_id_warning(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {"woman": {"asset_id": "asset:999", "kind": "identity"}},
        })
        result = validate_guidance_plan(
            plan,
            known_asset_ids={"asset:1", "asset:2"},
        )
        assert result.is_valid
        assert any("asset:999" in w for w in result.warnings)

    def test_empty_mask_data_error(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "masks": {"fg": {"format": "url", "data": ""}},
        })
        result = validate_guidance_plan(plan)
        assert not result.is_valid
        assert any("empty data" in e for e in result.errors)

    def test_contradictory_constraints_warning(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "constraints": {"lock_pose": True, "lock_expression": True},
        })
        result = validate_guidance_plan(plan)
        assert result.is_valid
        assert any("lock_pose" in w and "lock_expression" in w for w in result.warnings)


# =========================================================================
# Pixverse formatter
# =========================================================================

class TestPixverseFormatter:
    """format_references_for_pixverse output shape."""

    def test_no_references(self):
        plan = GuidancePlanV1.model_validate({"version": 1})
        result = format_references_for_pixverse(plan)
        assert result.composition_assets == []
        assert result.image_index_map == {}
        assert result.legend_text is None

    def test_single_reference(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "woman": {
                    "asset_id": "asset:5",
                    "kind": "identity",
                    "priority": 1,
                    "label": "main woman",
                },
            },
        })
        result = format_references_for_pixverse(plan)
        assert len(result.composition_assets) == 1
        assert result.image_index_map == {"woman": 1}
        assert "image #1 is main woman" in result.legend_text

    def test_multiple_references_sorted_by_priority(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "bg": {"asset_id": "asset:10", "kind": "style", "priority": 2},
                "woman": {"asset_id": "asset:5", "kind": "identity", "priority": 1},
            },
        })
        result = format_references_for_pixverse(plan)
        assert len(result.composition_assets) == 2
        # woman has lower priority number → index 1
        assert result.image_index_map["woman"] == 1
        assert result.image_index_map["bg"] == 2

    def test_existing_composition_assets_offset(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "woman": {"asset_id": "asset:5", "kind": "identity", "priority": 1},
            },
        })
        existing = [{"asset": "asset:1", "role": "entities:environment"}]
        result = format_references_for_pixverse(plan, existing_composition_assets=existing)
        assert len(result.composition_assets) == 2
        # First entry is the existing one
        assert result.composition_assets[0] == existing[0]
        # Guidance ref starts at index 2 (1-based, after 1 existing)
        assert result.image_index_map["woman"] == 2
        assert "image #2 is woman" in result.legend_text

    def test_asset_entry_shape(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "char": {
                    "asset_id": "asset:7",
                    "kind": "identity",
                    "view": "front",
                    "pose": "standing",
                },
            },
        })
        result = format_references_for_pixverse(plan)
        entry = result.composition_assets[0]
        assert entry["asset"] == "asset:7"
        assert entry["role"] == "entities:main_character"
        assert entry["ref_name"] == "char"
        assert entry["influence_type"] == "reference"
        assert entry["camera_view_id"] == "front"
        assert entry["pose_id"] == "standing"
        assert entry["provider_params"]["guidance_binding_key"] == "char"
        assert entry["provider_params"]["guidance_kind"] == "identity"

    def test_legend_text_format(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "a": {"asset_id": 1, "kind": "identity", "priority": 1, "label": "Alice"},
                "b": {"asset_id": 2, "kind": "style", "priority": 2, "label": "Bob"},
            },
        })
        result = format_references_for_pixverse(plan)
        assert result.legend_text == "Reference guide: image #1 is Alice, image #2 is Bob."

    def test_debug_metadata(self):
        plan = GuidancePlanV1.model_validate({
            "version": 1,
            "references": {
                "woman": {"asset_id": "asset:5", "kind": "identity"},
            },
        })
        result = format_references_for_pixverse(plan)
        assert result.debug_metadata["guidance_count"] == 1
        assert result.debug_metadata["existing_count"] == 0


# =========================================================================
# Integration: build → validate → format round-trip
# =========================================================================

class TestIntegrationRoundTrip:
    """End-to-end: build plan dict → parse → validate → format."""

    def test_full_round_trip(self):
        # 1. Build a raw plan dict (simulates frontend helper output)
        raw = {
            "version": 1,
            "references": {
                "woman": {
                    "asset_id": "asset:5",
                    "kind": "identity",
                    "priority": 1,
                    "label": "mysterious woman",
                },
                "city": {
                    "asset_id": "asset:20",
                    "kind": "style",
                    "priority": 2,
                    "label": "neon city",
                },
            },
            "constraints": {
                "lock_camera": True,
            },
            "provenance": {
                "source": "test",
            },
        }

        # 2. Parse
        plan = GuidancePlanV1.model_validate(raw)
        assert plan.version == 1

        # 3. Validate
        vr = validate_guidance_plan(
            plan,
            known_binding_keys={"woman", "city"},
            known_asset_ids={"asset:5", "asset:20"},
        )
        assert vr.is_valid
        assert len(vr.errors) == 0

        # 4. Format for Pixverse
        result = format_references_for_pixverse(plan)
        assert len(result.composition_assets) == 2
        assert result.image_index_map["woman"] == 1
        assert result.image_index_map["city"] == 2
        assert "mysterious woman" in result.legend_text
        assert "neon city" in result.legend_text
