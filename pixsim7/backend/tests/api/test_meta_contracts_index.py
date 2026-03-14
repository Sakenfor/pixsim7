"""Tests for global meta contract index endpoint."""
from __future__ import annotations

from datetime import datetime

import pytest

from pixsim7.backend.main.api.v1.meta_contracts import list_contract_endpoints


@pytest.mark.asyncio
async def test_contracts_index_lists_prompt_contracts() -> None:
    result = await list_contract_endpoints()

    assert result.version
    assert any(
        contract.id == "prompts.analysis"
        and contract.endpoint == "/api/v1/prompts/meta/analysis-contract"
        for contract in result.contracts
    )
    assert any(
        contract.id == "prompts.authoring"
        and contract.endpoint == "/api/v1/prompts/meta/authoring-contract"
        for contract in result.contracts
    )
    # Ensure generated_at is valid ISO datetime string.
    datetime.fromisoformat(result.generated_at.replace("Z", "+00:00"))


@pytest.mark.asyncio
async def test_contracts_index_includes_blocks_discovery() -> None:
    result = await list_contract_endpoints()

    blocks = next(
        (c for c in result.contracts if c.id == "blocks.discovery"), None
    )
    assert blocks is not None
    assert "tag_vocabulary" in blocks.provides
    assert "block_catalog" in blocks.provides
    assert len(blocks.sub_endpoints) >= 4
    # Has tag dictionary sub-endpoint
    assert any(ep.id == "blocks.tag_dictionary" for ep in blocks.sub_endpoints)


@pytest.mark.asyncio
async def test_contracts_index_has_bidirectional_relates_to() -> None:
    result = await list_contract_endpoints()

    contracts_by_id = {c.id: c for c in result.contracts}

    # prompts.authoring relates to blocks.discovery
    authoring = contracts_by_id["prompts.authoring"]
    assert "blocks.discovery" in authoring.relates_to

    # blocks.discovery relates back to prompts.authoring
    blocks = contracts_by_id["blocks.discovery"]
    assert "prompts.authoring" in blocks.relates_to

    # prompts.analysis and prompts.authoring relate to each other
    analysis = contracts_by_id["prompts.analysis"]
    assert "prompts.authoring" in analysis.relates_to
    assert "prompts.analysis" in authoring.relates_to


@pytest.mark.asyncio
async def test_contracts_index_provides_fields_are_populated() -> None:
    result = await list_contract_endpoints()

    for contract in result.contracts:
        assert len(contract.provides) > 0, f"{contract.id} has empty provides"
