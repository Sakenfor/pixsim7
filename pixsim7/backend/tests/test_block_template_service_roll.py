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


class _PreviewInMemoryTemplateService(BlockTemplateService):
    def __init__(self, blocks: List[Any]):
        super().__init__(SimpleNamespace())
        self._blocks = blocks
        self.seen_slots: List[Dict[str, Any]] = []

    async def count_candidates(self, slot: Dict[str, Any]) -> int:
        self.seen_slots.append(dict(slot))
        matches = await self.find_candidates(slot)
        return len(matches)

    async def find_candidates(self, slot: Dict[str, Any], *, limit=None):
        self.seen_slots.append(dict(slot))
        matches: List[Any] = []
        for block in self._blocks:
            if slot.get("category") and getattr(block, "category", None) != slot["category"]:
                continue
            tags = getattr(block, "tags", None)
            if not _matches_slot_tags(tags if isinstance(tags, dict) else {}, slot):
                continue
            if (
                slot.get("block_source") == "primitives"
                and slot.get("package_name")
                and (tags if isinstance(tags, dict) else {}).get("source_pack") != slot.get("package_name")
            ):
                continue
            matches.append(block)

        if limit is not None:
            matches = matches[:limit]
        return matches


class _CrudDb:
    def __init__(self):
        self.items: List[Any] = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock()

    def add(self, item: Any) -> None:
        self.items.append(item)


class _UpdateTemplateService(BlockTemplateService):
    def __init__(self, db: Any, template: BlockTemplate):
        super().__init__(db)
        self._template = template

    async def get_template(self, template_id):
        if template_id == self._template.id:
            return self._template
        return None


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
    assert len(selected_ids) == 2
    assert set(selected_ids) == {"cam_low", "cam_dutch"}
    assert selected_ids[1] != selected_ids[0]
    second_debug = result["slot_results"][1]["selector_debug"]
    scores = {row["block_id"]: row for row in second_debug["scores"]}
    second_selected = result["slot_results"][1]["selected_block_string_id"]
    other = "cam_low" if second_selected == "cam_dutch" else "cam_dutch"
    assert scores[second_selected]["total"] > scores[other]["total"]


@pytest.mark.asyncio
async def test_roll_template_propagates_bound_op_refs_into_selected_block_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: Dict[str, Any] = {}

    def _capture_analysis(blocks: List[Any], _assembled_prompt: str) -> Dict[str, Any]:
        captured["blocks"] = blocks
        return {"ok": True}

    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.derive_analysis_from_blocks",
        _capture_analysis,
    )

    template = BlockTemplate(
        name="Ref binding propagation",
        slug="ref-binding-propagation",
        composition_strategy="sequential",
        slots=[
            {
                "label": "Camera",
                "role": "camera",
                "category": "angle",
            }
        ],
        template_metadata={
            "slot_schema_version": 2,
            "available_refs": {"camera_target": ["asset:42"]},
            "ref_binding_mode": "required",
        },
    )
    block = PromptBlock(
        block_id="cam_pan",
        text="Camera pan",
        role="camera",
        category="angle",
        kind="single_state",
        package_name="shared",
        tags={"camera_angle": "pan"},
        is_public=True,
        avg_rating=4.0,
        block_metadata={
            "op": {
                "op_id": "camera.motion.pan",
                "refs": [
                    {"key": "target", "capability": "camera_target", "required": True},
                ],
            }
        },
    )
    service = _InMemoryBlockTemplateService(template, [block])

    result = await service.roll_template(template.id, seed=13)

    assert result["success"] is True
    assert result["metadata"]["ref_binding"]["mode"] == "required"
    assert result["metadata"]["ref_binding"]["resolved_ref_count"] >= 1

    analysis_blocks = captured["blocks"]
    op_meta = analysis_blocks[0]["block_metadata"]["op"]
    assert op_meta["op_id"] == "camera.motion.pan"
    assert op_meta["resolved_refs"]["target"]["value"] == "asset:42"


@pytest.mark.asyncio
async def test_preview_slot_matches_handles_primitives_without_role_attribute() -> None:
    primitive = SimpleNamespace(
        id="prim-1",
        block_id="camera.low_angle",
        category="camera",
        text="low-angle cinematic shot",
        tags={"source_pack": "scene_foundation"},
        avg_rating=4.5,
    )
    service = _PreviewInMemoryTemplateService([primitive])

    result = await service.preview_slot_matches(
        slot={
            "block_source": "primitives",
            "category": "camera",
        },
        limit=5,
    )

    assert result["count"] == 1
    assert len(result["samples"]) == 1
    sample = result["samples"][0]
    assert sample["block_id"] == "camera.low_angle"
    assert isinstance(sample["role"], str)
    assert sample["role"].startswith("camera")


@pytest.mark.asyncio
async def test_preview_slot_matches_normalizes_legacy_tag_constraints_before_querying() -> None:
    primitive = SimpleNamespace(
        id="prim-2",
        block_id="camera.low_angle",
        category="camera",
        text="low-angle cinematic shot",
        tags={"camera_angle": "low", "source_pack": "scene_foundation"},
        avg_rating=4.0,
    )
    service = _PreviewInMemoryTemplateService([primitive])

    result = await service.preview_slot_matches(
        slot={
            "block_source": "primitives",
            "category": "camera",
            "tag_constraints": {"camera_angle": "low"},
        },
        limit=5,
    )

    assert result["count"] == 1
    assert service.seen_slots, "Expected preview path to call count/find with normalized slot"
    seen_slot = service.seen_slots[0]
    assert seen_slot.get("tags") == {"all": {"camera_angle": "low"}}
    assert "tag_constraints" not in seen_slot


@pytest.mark.asyncio
async def test_count_candidates_by_package_routes_primitives_to_blocks_db(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeResult:
        def all(self):
            return [("scene_foundation", 3), (None, 1)]

    class _FakeBlocksDb:
        def __init__(self):
            self.query = None

        async def execute(self, query):
            self.query = query
            return _FakeResult()

    class _FakeCtx:
        def __init__(self, db):
            self._db = db

        async def __aenter__(self):
            return self._db

        async def __aexit__(self, _exc_type, _exc, _tb):
            return False

    fake_db = _FakeBlocksDb()
    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.get_async_blocks_session",
        lambda: _FakeCtx(fake_db),
    )

    service = BlockTemplateService(SimpleNamespace())
    rows = await service.count_candidates_by_package(
        {
            "block_source": "primitives",
            "category": "camera",
        }
    )

    assert rows == [("scene_foundation", 3), (None, 1)]
    assert fake_db.query is not None
    compiled = fake_db.query.compile()
    assert "jsonb_extract_path_text" in str(fake_db.query)
    assert "source_pack" in {str(v) for v in compiled.params.values()}


@pytest.mark.asyncio
async def test_create_template_stamps_canonical_owner_metadata() -> None:
    db = _CrudDb()
    service = BlockTemplateService(db)

    template = await service.create_template(
        data={
            "name": "Owner Canonical Template",
            "slug": "owner-canonical-template",
            "slots": [],
            "template_metadata": {},
        },
        created_by="alice",
        owner_user_id=42,
    )

    owner = template.template_metadata.get("owner") if isinstance(template.template_metadata, dict) else {}
    assert owner == {
        "user_id": 42,
        "entity_ref": "user:42",
        "username": "alice",
    }
    assert template.owner_user_id == 42
    assert template.created_by == "alice"


@pytest.mark.asyncio
async def test_update_template_normalizes_legacy_owner_keys() -> None:
    template = BlockTemplate(
        name="Legacy Owner Template",
        slug="legacy-owner-template",
        slots=[],
        template_metadata={
            "slot_schema_version": 2,
            "owner": {"ref": "user:9", "name": "legacy-name"},
        },
    )
    db = _CrudDb()
    service = _UpdateTemplateService(db, template)

    updated = await service.update_template(
        template.id,
        {
            "template_metadata": {
                "owner_user_id": 77,
                "owner": {"entity_ref": "user:11"},
            }
        },
    )

    assert updated is not None
    owner = updated.template_metadata.get("owner")
    assert owner["user_id"] == 11
    assert owner["entity_ref"] == "user:11"
    assert owner["username"] == "legacy-name"
    assert updated.owner_user_id == 11
    assert "owner_user_id" not in updated.template_metadata


def test_build_primitive_slot_query_applies_runtime_private_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: Dict[str, Any] = {}

    def _fake_query_builder(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace()

    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.block.template_service.build_block_primitive_query",
        _fake_query_builder,
    )

    service = BlockTemplateService(SimpleNamespace())
    with service._scoped_runtime_candidate_filter(
        owner_user_id=7,
        active_source_packs=["demo_pack"],
    ):
        _ = service._build_primitive_slot_query(
            {
                "block_source": "primitives",
                "category": "camera",
            }
        )

    assert captured["private_owner_user_id"] == 7
    assert captured["private_source_packs"] == ["demo_pack"]
