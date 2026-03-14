from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy.exc import OperationalError

from scripts.seeds.game.bananza.flows import direct_flow

TEST_SUITE = {
    "id": "bananza-direct-mode-hardening",
    "label": "Bananza Direct Mode Hardening Tests",
    "kind": "integration",
    "category": "scripts/bananza",
    "subcategory": "direct-mode-hardening",
    "covers": ["scripts/seeds/game/bananza/cli.py"],
    "order": 53,
}


class _BrokenBlocksSession:
    async def execute(self, *_args: Any, **_kwargs: Any) -> Any:
        raise OperationalError("select", {}, Exception("no such column: block_primitives.capabilities"))


class _BrokenBlocksSessionContext:
    async def __aenter__(self) -> _BrokenBlocksSession:
        return _BrokenBlocksSession()

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False


@pytest.mark.asyncio
async def test_direct_verify_required_blocks_reports_schema_incompatibility(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        direct_flow,
        "get_async_blocks_session",
        lambda: _BrokenBlocksSessionContext(),
    )

    with pytest.raises(RuntimeError, match="direct_mode_blocks_schema_incompatible"):
        await direct_flow._verify_required_blocks()
