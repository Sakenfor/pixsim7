from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from pixsim7.backend.main.api.v1.block_templates.helpers_roles import _to_block_response


def test_to_block_response_includes_block_metadata() -> None:
    block = SimpleNamespace(
        id=uuid4(),
        block_id="user.camera.pan",
        category="camera",
        text="Pan camera left",
        tags={"source_pack": "user_pack"},
        block_metadata={"op": {"op_id": "camera.motion.pan"}},
        capabilities=["camera.motion"],
    )

    response = _to_block_response(block)
    assert response.block_metadata["op"]["op_id"] == "camera.motion.pan"


def test_to_block_response_normalizes_invalid_block_metadata() -> None:
    block = SimpleNamespace(
        id=uuid4(),
        block_id="user.camera.zoom",
        category="camera",
        text="Zoom in",
        tags={},
        block_metadata="not-a-dict",
        capabilities=[],
    )

    response = _to_block_response(block)
    assert response.block_metadata == {}
