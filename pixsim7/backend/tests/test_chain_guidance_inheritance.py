"""Tests for chain step guidance inheritance logic."""

import pytest

from pixsim7.backend.main.services.guidance.chain_inheritance import (
    compile_chain_step_guidance,
    INHERIT_DEFAULTS,
)


# ---------------------------------------------------------------------------
# Fixtures: example guidance plan dicts
# ---------------------------------------------------------------------------

STEP1_GUIDANCE = {
    "references": {
        "woman": {"asset_id": 42, "kind": "identity", "label": "Main character"},
        "bg": {"asset_id": 99, "kind": "style", "label": "Background style"},
    },
    "regions": {
        "woman": [{"box": [0.1, 0.1, 0.5, 0.9], "binding_key": "woman", "strength": 0.8}],
    },
    "masks": {
        "protect_face": {"format": "url", "data": "https://example.com/mask.png"},
    },
    "constraints": {
        "lock_camera": True,
        "identity_strength": 0.9,
    },
}

STEP2_GUIDANCE = {
    "references": {
        "woman": {"asset_id": 42, "kind": "identity", "label": "Main character updated"},
    },
    "constraints": {
        "lock_pose": True,
    },
}


class TestInheritDefaults:
    def test_defaults_references_inherit(self):
        assert INHERIT_DEFAULTS["references"] is True

    def test_defaults_regions_no_inherit(self):
        assert INHERIT_DEFAULTS["regions"] is False

    def test_defaults_masks_no_inherit(self):
        assert INHERIT_DEFAULTS["masks"] is False

    def test_defaults_constraints_inherit(self):
        assert INHERIT_DEFAULTS["constraints"] is True


class TestNoInput:
    def test_no_previous_no_step(self):
        plan, warnings = compile_chain_step_guidance(None, None)
        assert plan is None
        assert warnings == []

    def test_empty_dicts(self):
        plan, warnings = compile_chain_step_guidance({}, {})
        assert plan is None


class TestFirstStep:
    """First step has no previous — only step-local guidance."""

    def test_step_guidance_only(self):
        plan, warnings = compile_chain_step_guidance(None, STEP1_GUIDANCE)
        assert plan is not None
        assert "woman" in plan.references
        assert plan.references["woman"].asset_id == 42
        assert plan.constraints.lock_camera is True

    def test_step_guidance_with_regions(self):
        plan, _ = compile_chain_step_guidance(None, STEP1_GUIDANCE)
        assert plan.regions is not None
        assert "woman" in plan.regions
        assert len(plan.regions["woman"]) == 1


class TestDefaultInheritance:
    """Second step with default inheritance flags."""

    def test_references_inherited(self):
        """References should inherit by default."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
        )
        assert plan is not None
        assert "woman" in plan.references
        assert "bg" in plan.references

    def test_regions_not_inherited(self):
        """Regions should NOT inherit by default."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
        )
        assert plan.regions is None

    def test_masks_not_inherited(self):
        """Masks should NOT inherit by default."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
        )
        assert plan.masks is None

    def test_constraints_inherited(self):
        """Constraints should inherit by default."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
        )
        assert plan.constraints is not None
        assert plan.constraints.lock_camera is True
        assert plan.constraints.identity_strength == 0.9


class TestStepOverrides:
    """Step-local guidance overrides inherited values."""

    def test_reference_override(self):
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=STEP2_GUIDANCE,
        )
        # woman reference label updated by step 2
        assert plan.references["woman"].label == "Main character updated"
        # bg reference still inherited from step 1
        assert "bg" in plan.references

    def test_constraint_merge(self):
        """Step constraints shallow-merge with inherited constraints."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=STEP2_GUIDANCE,
        )
        # Inherited
        assert plan.constraints.lock_camera is True
        assert plan.constraints.identity_strength == 0.9
        # Added by step 2
        assert plan.constraints.lock_pose is True


class TestExplicitInheritFlags:
    """Explicit guidance_inherit overrides defaults."""

    def test_inherit_regions_explicitly(self):
        """Force regions to inherit."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
            guidance_inherit={"regions": True},
        )
        assert plan.regions is not None
        assert "woman" in plan.regions

    def test_block_references_explicitly(self):
        """Block references from inheriting."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
            guidance_inherit={"references": False},
        )
        # Only constraints should inherit (default=True)
        assert plan.references is None
        assert plan.constraints is not None

    def test_inherit_masks_explicitly(self):
        """Force masks to inherit."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
            guidance_inherit={"masks": True},
        )
        assert plan.masks is not None
        assert "protect_face" in plan.masks

    def test_block_everything(self):
        """Block all inheritance — result is empty if no step guidance."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=None,
            guidance_inherit={
                "references": False,
                "regions": False,
                "masks": False,
                "constraints": False,
            },
        )
        assert plan is None

    def test_step_guidance_still_applied_when_inheritance_blocked(self):
        """Even with all inheritance blocked, step's own guidance applies."""
        plan, _ = compile_chain_step_guidance(
            previous_compiled=STEP1_GUIDANCE,
            step_guidance=STEP2_GUIDANCE,
            guidance_inherit={
                "references": False,
                "regions": False,
                "masks": False,
                "constraints": False,
            },
        )
        assert plan is not None
        # Only step 2's data, not step 1's
        assert "woman" in plan.references
        assert "bg" not in plan.references
        assert plan.constraints.lock_pose is True
        # lock_camera was step 1 only, not inherited
        assert plan.constraints.lock_camera is None


class TestThreeStepChain:
    """Simulate a 3-step chain to verify cumulative inheritance."""

    def test_three_step_flow(self):
        # Step 1: initial guidance
        plan1, _ = compile_chain_step_guidance(None, STEP1_GUIDANCE)
        compiled1 = plan1.model_dump(exclude_none=True)

        # Step 2: inherits refs + constraints, adds lock_pose
        plan2, _ = compile_chain_step_guidance(compiled1, STEP2_GUIDANCE)
        compiled2 = plan2.model_dump(exclude_none=True)

        assert "woman" in plan2.references
        assert "bg" in plan2.references
        assert plan2.constraints.lock_camera is True
        assert plan2.constraints.lock_pose is True

        # Step 3: no step guidance, pure inheritance from step 2
        plan3, _ = compile_chain_step_guidance(compiled2, None)
        assert plan3 is not None
        assert "woman" in plan3.references
        assert "bg" in plan3.references
        assert plan3.constraints.lock_camera is True
        assert plan3.constraints.lock_pose is True
        # Regions/masks from step 1 should NOT have survived
        assert plan3.regions is None
        assert plan3.masks is None
