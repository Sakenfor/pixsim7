"""Tests for the /block-templates/meta/op-signatures endpoint."""
from __future__ import annotations

import pytest

from pixsim7.backend.main.api.v1.block_templates.routes_matrix import (
    list_op_signatures_endpoint,
)


@pytest.mark.asyncio
async def test_meta_op_signatures_returns_all_entries() -> None:
    result = await list_op_signatures_endpoint()
    assert isinstance(result, list)
    assert len(result) > 0

    ids = {entry["id"] for entry in result}
    assert "camera.motion.v1" in ids
    assert "subject.motion.v1" in ids
    assert "scene.relation.v1" in ids


@pytest.mark.asyncio
async def test_meta_op_signatures_entry_shape() -> None:
    result = await list_op_signatures_endpoint()
    entry = next(e for e in result if e["id"] == "camera.motion.v1")

    assert entry["op_id_prefix"] == "camera.motion."
    assert entry["requires_variant_template"] is True
    assert isinstance(entry["required_params"], list)
    assert "speed" in entry["required_params"]
    assert isinstance(entry["required_refs"], list)
    assert isinstance(entry["allowed_modalities"], list)


@pytest.mark.asyncio
async def test_meta_op_signatures_deterministic_order() -> None:
    result = await list_op_signatures_endpoint()
    ids = [entry["id"] for entry in result]
    assert ids == sorted(ids)
