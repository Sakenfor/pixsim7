"""Tests for global meta contract index endpoint."""
from __future__ import annotations

from datetime import datetime

import pytest

from pixsim7.backend.main.api.v1.meta_contracts import (
    META_CONTRACTS_INDEX_VERSION,
    list_contract_endpoints,
)


@pytest.mark.asyncio
async def test_contracts_index_lists_prompt_analysis_contract() -> None:
    result = await list_contract_endpoints()

    assert result.version == META_CONTRACTS_INDEX_VERSION
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
