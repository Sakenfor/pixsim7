from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.domain.prompt.models import BlockTemplate, PromptBlock
from pixsim7.backend.main.services.prompt.block.block_query import normalize_tag_query
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService


def _tag_value_matches(actual: Any, expected: Any) -> bool:
    if isinstance(expected, list):
        return actual in expected
    return actual == expected


def _matches_slot_tags(block_tags: Dict[str, Any], slot: Dict[str, Any]) -> bool:
    groups = normalize_tag_query(
        tag_constraints=slot.get("tag_constraints"),
        tag_query=slot.get("tags"),
    )

    for key, expected in groups["all"].items():
        if key not in block_tags or not _tag_value_matches(block_tags.get(key), expected):
            return False

    if groups["any"]:
        any_ok = False
        for key, expected in groups["any"].items():
            if key in block_tags and _tag_value_matches(block_tags.get(key), expected):
                any_ok = True
                break
        if not any_ok:
            return False

    for key, expected in groups["not"].items():
        if key in block_tags and _tag_value_matches(block_tags.get(key), expected):
            return False

    return True


class _InMemoryBlockTemplateService(BlockTemplateService):
    def __init__(self, template: BlockTemplate, blocks: List[PromptBlock]):
        super().__init__(SimpleNamespace(commit=AsyncMock()))
        self._template = template
        self._blocks = blocks
        self.seen_slots: List[Dict[str, Any]] = []

    async def get_template(self, template_id):
        if template_id == self._template.id:
            return self._template
        return None

    async def find_candidates(self, slot: Dict[str, Any], *, limit=None):
        self.seen_slots.append(slot)
        excluded = {str(v) for v in (slot.get("exclude_block_ids") or [])}

        matches: List[PromptBlock] = []
        for block in self._blocks:
            if slot.get("role") and block.role != slot["role"]:
                continue
            if slot.get("category") and block.category != slot["category"]:
                continue
            if slot.get("kind") and block.kind != slot["kind"]:
                continue
            if slot.get("package_name") and block.package_name != slot["package_name"]:
                continue
            if excluded and str(block.id) in excluded:
                continue
            if not _matches_slot_tags(block.tags or {}, slot):
                continue
            matches.append(block)

        if limit is not None:
            matches = matches[:limit]
        return matches


def _block(*, block_id: str, text: str, role: str, tags: Dict[str, Any]) -> PromptBlock:
    return PromptBlock(
        block_id=block_id,
        text=text,
        role=role,
        category="angle",
        kind="single_state",
        package_name="shared",
        tags=tags,
        is_public=True,
        avg_rating=4.0,
    )


def test_apply_control_effects_applies_select_option_slot_tag_boosts() -> None:
    slots = [
        {
            "label": "Uniform aesthetic",
            "key": "uniform_aesthetic",
            "preferences": {},
        }
    ]
    metadata = {
        "controls": [
            {
                "id": "uniform_variant",
                "type": "select",
                "label": "Uniform Variant",
                "defaultValue": "duty",
                "options": [
                    {
                        "id": "duty",
                        "label": "Duty",
                        "effects": [
                            {
                                "kind": "slot_tag_boost",
                                "slotKey": "uniform_aesthetic",
                                "slotLabel": "Uniform aesthetic",
                                "boostTags": {"variant": "duty"},
                                "avoidTags": {"variant": ["sleek", "tailored"]},
                            }
                        ],
                    },
                    {
                        "id": "sleek",
                        "label": "Sleek",
                        "effects": [
                            {
                                "kind": "slot_tag_boost",
                                "slotKey": "uniform_aesthetic",
                                "slotLabel": "Uniform aesthetic",
                                "boostTags": {"variant": "sleek"},
                                "avoidTags": {"variant": ["duty", "tailored"]},
                            }
                        ],
                    },
                ],
            }
        ]
    }

    result = BlockTemplateService._apply_control_effects(
        slots=[dict(slots[0])],
        template_metadata=metadata,
        control_values={"uniform_variant": "sleek"},
    )

    prefs = result[0]["preferences"]
    assert prefs["boost_tags"]["variant"] == "sleek"
    assert set(prefs["avoid_tags"]["variant"]) == {"duty", "tailored"}


@pytest.mark.asyncio
async def test_roll_template_respects_tags_any_and_not(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.derive_analysis_from_blocks",
        lambda *_args, **_kwargs: None,
    )

    template = BlockTemplate(
        name="Camera filter",
        slug="camera-filter",
        composition_strategy="sequential",
        slots=[
            {
                "label": "Camera",
                "role": "camera",
                "category": "angle",
                "tags": {
                    "any_of": {"camera_angle": ["low", "dutch"]},
                    "none_of": {"atmosphere": ["surveillance"]},
                },
            }
        ],
        template_metadata={"slot_schema_version": 2},
    )
    blocks = [
        _block(
            block_id="cam_low_ok",
            text="Low angle camera view",
            role="camera",
            tags={"camera_angle": "low", "atmosphere": "romantic"},
        ),
        _block(
            block_id="cam_dutch_bad",
            text="Dutch angle surveillance view",
            role="camera",
            tags={"camera_angle": "dutch", "atmosphere": "surveillance"},
        ),
        _block(
            block_id="cam_eye_no_any",
            text="Eye level camera view",
            role="camera",
            tags={"camera_angle": "eye_level", "atmosphere": "romantic"},
        ),
    ]

    service = _InMemoryBlockTemplateService(template, blocks)
    result = await service.roll_template(template.id, seed=123)

    assert result["success"] is True
    assert result["assembled_prompt"] == "Low angle camera view."
    assert result["slot_results"][0]["status"] == "selected"
    assert result["slot_results"][0]["match_count"] == 1
    assert result["slot_results"][0]["selected_block_string_id"] == "cam_low_ok"
    assert result["metadata"]["slots_filled"] == 1
    assert result["metadata"]["selected_block_string_ids"] == ["cam_low_ok"]
    assert len(result["metadata"]["selected_block_ids"]) == 1
    assert result["warnings"] == []
    service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_roll_template_migrates_legacy_v1_slot_tag_constraints_during_roll(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.derive_analysis_from_blocks",
        lambda *_args, **_kwargs: None,
    )

    template = BlockTemplate(
        name="Legacy slot template",
        slug="legacy-slot-template",
        composition_strategy="sequential",
        slots=[
            {
                "label": "Camera",
                "role": "camera",
                "category": "angle",
                "tag_constraints": {"camera_angle": ["low", "dutch"]},
            }
        ],
        template_metadata={"slot_schema_version": 1},
    )
    blocks = [
        _block(
            block_id="cam_low_ok",
            text="Low angle camera view",
            role="camera",
            tags={"camera_angle": "low"},
        ),
        _block(
            block_id="cam_eye_no_match",
            text="Eye level camera view",
            role="camera",
            tags={"camera_angle": "eye_level"},
        ),
    ]

    service = _InMemoryBlockTemplateService(template, blocks)
    result = await service.roll_template(template.id, seed=456)

    assert result["success"] is True
    assert result["assembled_prompt"] == "Low angle camera view."
    assert result["slot_results"][0]["selected_block_string_id"] == "cam_low_ok"

    assert service.seen_slots, "find_candidates should be called with normalized slots"
    rolled_slot = service.seen_slots[0]
    assert rolled_slot.get("tags") == {"all": {"camera_angle": ["low", "dutch"]}}
    assert "tag_constraints" not in rolled_slot


@pytest.mark.asyncio
async def test_roll_template_weighted_tags_uses_preferences_and_reports_selector_debug(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.derive_analysis_from_blocks",
        lambda *_args, **_kwargs: None,
    )

    template = BlockTemplate(
        name="Weighted tags",
        slug="weighted-tags",
        composition_strategy="sequential",
        slots=[
            {
                "label": "Camera",
                "role": "camera",
                "category": "angle",
                "selection_strategy": "weighted_tags",
                "preferences": {
                    "boost_tags": {"perspective": "upward"},
                    "avoid_tags": {"cliche": ["yes"]},
                },
                "selection_config": {
                    "temperature": 0,
                    "weights": {
                        "boost_tags": 1.0,
                        "avoid_tags": 1.0,
                        "rating": 0.0,
                        "diversity": 0.0,
                    },
                },
            }
        ],
        template_metadata={"slot_schema_version": 2},
    )
    blocks = [
        _block(
            block_id="cam_good",
            text="Good camera",
            role="camera",
            tags={"perspective": "upward", "cliche": "no"},
        ),
        _block(
            block_id="cam_bad",
            text="Bad camera",
            role="camera",
            tags={"perspective": "neutral", "cliche": "yes"},
        ),
    ]

    service = _InMemoryBlockTemplateService(template, blocks)
    result = await service.roll_template(template.id, seed=7)

    assert result["success"] is True
    sr = result["slot_results"][0]
    assert sr["selected_block_string_id"] == "cam_good"
    assert sr["selector_strategy"] == "weighted_tags"
    assert isinstance(sr.get("selector_debug"), dict)
    assert sr["selector_debug"]["strategy"] == "weighted_tags"
    assert sr["selector_debug"]["weights"]["boost_tags"] == 1.0
    scores = {row["block_id"]: row for row in sr["selector_debug"]["scores"]}
    assert scores["cam_good"]["total"] > scores["cam_bad"]["total"]


@pytest.mark.asyncio
async def test_roll_template_diverse_penalizes_repeated_values_across_slots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.derive_analysis_from_blocks",
        lambda *_args, **_kwargs: None,
    )

    template = BlockTemplate(
        name="Diverse camera",
        slug="diverse-camera",
        composition_strategy="sequential",
        slots=[
            {
                "label": "Camera 1",
                "role": "camera",
                "category": "angle",
                "selection_strategy": "diverse",
                "preferences": {"diversity_keys": ["camera_angle"]},
                "selection_config": {"temperature": 0},
            },
            {
                "label": "Camera 2",
                "role": "camera",
                "category": "angle",
                "selection_strategy": "diverse",
                "preferences": {"diversity_keys": ["camera_angle"]},
                "selection_config": {
                    "temperature": 0,
                    "weights": {"boost_tags": 0.0, "avoid_tags": 0.0, "rating": 0.0, "diversity": 1.0},
                },
            },
        ],
        template_metadata={"slot_schema_version": 2},
    )
    blocks = [
        _block(
            block_id="cam_low",
            text="Low angle",
            role="camera",
            tags={"camera_angle": "low"},
        ),
        _block(
            block_id="cam_dutch",
            text="Dutch angle",
            role="camera",
            tags={"camera_angle": "dutch"},
        ),
    ]

    service = _InMemoryBlockTemplateService(template, blocks)
    result = await service.roll_template(template.id, seed=11)

    assert result["success"] is True
    selected_ids = [sr["selected_block_string_id"] for sr in result["slot_results"] if sr["status"] == "selected"]
    assert selected_ids == ["cam_low", "cam_dutch"]
    second_debug = result["slot_results"][1]["selector_debug"]
    scores = {row["block_id"]: row for row in second_debug["scores"]}
    assert scores["cam_dutch"]["diversity"] > scores["cam_low"]["diversity"]
