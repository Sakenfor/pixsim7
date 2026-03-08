from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.services.prompt.block.ref_binding_adapter import (
    LinkBackedRefBinder,
)
from pixsim7.backend.main.services.prompt.block.resolution_core.types import (
    CandidateBlock,
    ResolutionRequest,
)


class _FakeLinkResolver:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict | None]] = []

    async def resolve_template_to_runtime(
        self,
        template_kind: str,
        template_id: str,
        context: dict | None = None,
    ):
        self.calls.append((template_kind, template_id, context))
        if template_kind == "characterInstance" and template_id == "abc":
            return SimpleNamespace(kind="npc", entity_id=7, entity=object())
        return None


@pytest.mark.asyncio
async def test_ref_binder_prunes_candidate_when_required_ref_missing() -> None:
    request = ResolutionRequest(
        resolver_id="next_v1",
        candidates_by_target={
            "camera_slot": [
                CandidateBlock(
                    block_id="core.camera.motion.zoom",
                    text="camera zoom",
                    metadata={
                        "op": {
                            "op_id": "camera.motion.zoom",
                            "refs": [
                                {"key": "subject", "capability": "subject", "required": True},
                            ],
                        }
                    },
                )
            ]
        },
    )

    binder = LinkBackedRefBinder(
        db=SimpleNamespace(),
        link_resolver=_FakeLinkResolver(),
    )
    stats = await binder.bind_request(request, context={})

    assert request.candidates_by_target["camera_slot"] == []
    assert stats.candidates_checked == 1
    assert stats.candidates_pruned == 1
    assert stats.required_refs_missing == 1
    assert stats.resolved_ref_count == 0


@pytest.mark.asyncio
async def test_ref_binder_resolves_link_and_direct_entity_refs() -> None:
    candidate = CandidateBlock(
        block_id="core.camera.motion.pan",
        text="camera pan",
        metadata={
            "op": {
                "op_id": "camera.motion.pan",
                "refs": [
                    {"key": "subject", "capability": "subject", "required": True},
                    {"key": "target", "capability": "camera_target", "required": False},
                ],
                "ref_bindings": {
                    "subject": {
                        "template_kind": "characterInstance",
                        "template_id": "abc",
                    }
                },
            }
        },
    )
    request = ResolutionRequest(
        resolver_id="next_v1",
        candidates_by_target={"camera_slot": [candidate]},
    )
    fake_resolver = _FakeLinkResolver()
    binder = LinkBackedRefBinder(
        db=SimpleNamespace(),
        link_resolver=fake_resolver,
    )

    stats = await binder.bind_request(
        request,
        context={
            "available_refs": {"camera_target": ["asset:42"]},
            "link_context": {"scene_id": 99},
        },
    )

    resolved_refs = candidate.metadata["op"]["resolved_refs"]
    assert request.candidates_by_target["camera_slot"] == [candidate]
    assert resolved_refs["subject"] == {
        "kind": "entity",
        "value": "npc:7",
        "source": "link",
    }
    assert resolved_refs["target"] == {
        "kind": "entity",
        "value": "asset:42",
        "source": "direct",
    }
    assert fake_resolver.calls == [("characterInstance", "abc", {"scene_id": 99})]
    assert stats.candidates_checked == 1
    assert stats.candidates_pruned == 0
    assert stats.resolved_ref_count == 2


@pytest.mark.asyncio
async def test_ref_binder_supports_many_refs_and_ref_params() -> None:
    candidate = CandidateBlock(
        block_id="core.camera.motion.orbit",
        text="camera orbit",
        metadata={
            "op": {
                "op_id": "camera.motion.orbit",
                "refs": [
                    {"key": "subjects", "capability": "subject", "required": True, "many": True},
                ],
                "params": [
                    {
                        "key": "focus_target",
                        "type": "ref",
                        "ref_capability": "camera_target",
                        "required": True,
                    }
                ],
                "args": {"focus_target": "asset:99"},
            }
        },
    )
    request = ResolutionRequest(
        resolver_id="next_v1",
        candidates_by_target={"camera_slot": [candidate]},
    )
    binder = LinkBackedRefBinder(
        db=SimpleNamespace(),
        link_resolver=_FakeLinkResolver(),
    )

    stats = await binder.bind_request(
        request,
        context={"available_refs": {"subject": ["asset:1", "asset:2"]}},
    )

    resolved_refs = candidate.metadata["op"]["resolved_refs"]
    resolved_params = candidate.metadata["op"]["resolved_params"]
    assert request.candidates_by_target["camera_slot"] == [candidate]
    assert [entry["value"] for entry in resolved_refs["subjects"]] == ["asset:1", "asset:2"]
    assert resolved_params["focus_target"]["value"] == "asset:99"
    assert stats.candidates_pruned == 0
    assert stats.resolved_ref_count == 3


@pytest.mark.asyncio
async def test_ref_binder_advisory_mode_keeps_candidate_when_required_ref_missing() -> None:
    request = ResolutionRequest(
        resolver_id="next_v1",
        candidates_by_target={
            "camera_slot": [
                CandidateBlock(
                    block_id="core.camera.motion.zoom",
                    text="camera zoom",
                    metadata={
                        "op": {
                            "op_id": "camera.motion.zoom",
                            "refs": [
                                {"key": "subject", "capability": "subject", "required": True},
                            ],
                        }
                    },
                )
            ]
        },
    )
    binder = LinkBackedRefBinder(
        db=SimpleNamespace(),
        link_resolver=_FakeLinkResolver(),
    )

    stats = await binder.bind_request(request, context={}, mode="advisory")

    assert len(request.candidates_by_target["camera_slot"]) == 1
    assert stats.mode == "advisory"
    assert stats.required_refs_missing == 1
    assert stats.candidates_pruned == 0
    assert stats.warnings
