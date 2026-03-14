from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.services.prompt.block.dynamic_slot_planner import (
    ComposerContextInput,
    ComposerPlanRequest,
    DynamicSlotPlanner,
)


def test_composer_context_from_narrative_context_maps_core_fields() -> None:
    context = SimpleNamespace(
        npc=SimpleNamespace(id=7),
        session=SimpleNamespace(flags={"mood": "serene"}),
        relationship=SimpleNamespace(intimacy_level="romantic", flags={}),
        location=SimpleNamespace(name="Urban Alley", meta={}),
        scene=SimpleNamespace(node_meta={"pose": "seated"}),
    )

    mapped = ComposerContextInput.from_narrative_context(context)

    assert mapped.location_tag == "location:urban_alley"
    assert mapped.mood == "mood:serene"
    assert mapped.intimacy_level == "intimacy:romantic"
    assert mapped.pose == "pose:seated"
    assert mapped.lead_npc_id == 7


def test_dynamic_slot_planner_builds_runtime_plan_from_action_context() -> None:
    action_context = SimpleNamespace(
        locationTag="location:urban",
        mood="mood:serene",
        intimacy_level="intimacy:romantic",
        pose="pose:standing",
        requiredTags=["style:cinematic"],
        excludeTags=["style:cartoon"],
        leadNpcId=7,
        partnerNpcId=None,
    )
    request = ComposerPlanRequest.from_action_selection_context(
        action_context,
        block_source="primitives",
        package_name="scene_foundation",
    )

    plan = DynamicSlotPlanner().plan(request)

    assert plan.planner_id == "dynamic_slot_planner_v1"
    categories = [slot["category"] for slot in plan.slots]
    assert categories[:7] == [
        "environment",
        "light",
        "camera",
        "rendering_technique",
        "form_language",
        "character_pose",
        "location",
    ]
    assert "mood" in categories
    assert "wardrobe" in categories

    env_slot = next(slot for slot in plan.slots if slot["category"] == "environment")
    assert env_slot["block_source"] == "primitives"
    assert env_slot["package_name"] == "scene_foundation"
    assert env_slot["tags"]["all"]["setting"] == "urban"
    assert env_slot["tags"]["all"]["mood"] == "serene"
    assert env_slot["selection_strategy"] == "weighted_tags"
    assert env_slot["preferences"]["boost_tags"]["style"] == "cinematic"
    assert env_slot["preferences"]["avoid_tags"]["style"] == "cartoon"


def test_dynamic_slot_planner_respects_prefer_granular_and_category_filters() -> None:
    request = ComposerPlanRequest(
        context=ComposerContextInput(),
        prefer_granular=False,
        include_categories=["rendering"],
        exclude_categories=["camera", "location"],
    )
    plan = DynamicSlotPlanner().plan(request)

    categories = [slot["category"] for slot in plan.slots]
    assert "character_desc" in categories
    assert "character_pose" not in categories
    assert "location" not in categories
    assert "camera" not in categories
    assert "rendering" in categories

    # Slots are normalized and should not carry legacy tag_constraints.
    assert all("tag_constraints" not in slot for slot in plan.slots)


def test_dynamic_slot_planner_supports_explicit_aesthetic_preset_category() -> None:
    request = ComposerPlanRequest(
        context=ComposerContextInput(),
        include_categories=["aesthetic_preset"],
        exclude_categories=["camera"],
    )
    plan = DynamicSlotPlanner().plan(request)

    aesthetic_slot = next(slot for slot in plan.slots if slot["category"] == "aesthetic_preset")
    assert aesthetic_slot["role"] == "style"
    assert aesthetic_slot["label"] == "Aesthetic preset"
