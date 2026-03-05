from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.services.prompt.block.compiler_core.compiler_v1 import CompilerV1


class _FakeService:
    def _get_slot_schema_version(self, template: object) -> int:
        del template
        return 2

    async def resolve_template_controls(self, *, slots, template_metadata):
        del slots, template_metadata
        return []

    def _apply_control_effects(self, slots, metadata, control_values):
        del metadata, control_values
        return slots

    async def find_candidates(self, slot, *, limit):
        del slot, limit
        return [
            SimpleNamespace(
                id="db-1",
                block_id="core.camera.medium_two_shot",
                category="camera",
                text="medium two shot from deck",
                tags={"role": "camera", "source_pack": "core_scene_primitives"},
                capabilities=["camera.pan", "camera.zoom"],
                avg_rating=4.0,
                block_metadata={
                    "op": {
                        "op_id": "camera.motion.pan",
                        "refs": [
                            {"key": "target", "capability": "camera_target", "required": False},
                        ],
                    }
                },
            )
        ]


@pytest.mark.asyncio
async def test_compiler_v1_derives_candidate_capabilities_from_primitive_fields() -> None:
    compiler = CompilerV1()
    service = _FakeService()
    template = SimpleNamespace(
        id="tmpl-1",
        slug="camera-slot",
        name="Camera Slot",
        slots=[
            {
                "slot_index": 0,
                "key": "camera_slot",
                "label": "Camera",
                "category": "camera",
                "selection_strategy": "uniform",
                "optional": False,
            }
        ],
        template_metadata={},
    )

    request = await compiler.compile(
        service=service,
        template=template,
        candidate_limit=10,
        control_values=None,
        exclude_block_ids=None,
        resolver_id="next_v1",
    )

    candidate = request.candidates_by_target["camera_slot"][0]
    assert candidate.package_name == "core_scene_primitives"
    assert "camera" in candidate.capabilities
    assert "role:camera" in candidate.capabilities
    assert "camera.pan" in candidate.capabilities
    assert "camera.zoom" in candidate.capabilities
    assert request.intent.required_capabilities_by_target["camera_slot"] == ["camera"]
    assert candidate.metadata["op"]["op_id"] == "camera.motion.pan"


@pytest.mark.asyncio
async def test_compiler_v1_prefers_explicit_slot_required_capabilities() -> None:
    compiler = CompilerV1()
    service = _FakeService()
    template = SimpleNamespace(
        id="tmpl-2",
        slug="explicit-cap-slot",
        name="Explicit Cap Slot",
        slots=[
            {
                "slot_index": 0,
                "key": "camera_slot",
                "label": "Camera",
                "category": "camera",
                "required_capabilities": ["camera.motion", "camera.framing"],
                "selection_strategy": "uniform",
                "optional": False,
            }
        ],
        template_metadata={},
    )

    request = await compiler.compile(
        service=service,
        template=template,
        candidate_limit=10,
        control_values=None,
        exclude_block_ids=None,
        resolver_id="next_v1",
    )

    assert request.intent.required_capabilities_by_target["camera_slot"] == [
        "camera.motion",
        "camera.framing",
    ]
