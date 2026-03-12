"""
Global machine-readable contract discovery index.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

from pixsim7.backend.main.api.v1.prompts.meta import (
    PROMPT_ANALYSIS_CONTRACT_VERSION,
)

router = APIRouter(prefix="/meta", tags=["meta"])

META_CONTRACTS_INDEX_VERSION = "2026-03-12.1"


class ContractIndexEntry(BaseModel):
    id: str
    name: str
    endpoint: str
    version: str
    auth_required: bool
    owner: str
    summary: str


class ContractsIndexResponse(BaseModel):
    version: str
    generated_at: str
    contracts: List[ContractIndexEntry]


@router.get("/contracts", response_model=ContractsIndexResponse)
async def list_contract_endpoints() -> ContractsIndexResponse:
    """
    List machine-readable contract endpoints available under /api/v1.
    """
    contracts = [
        ContractIndexEntry(
            id="prompts.analysis",
            name="Prompt Analysis Contract",
            endpoint="/api/v1/prompts/meta/analysis-contract",
            version=PROMPT_ANALYSIS_CONTRACT_VERSION,
            auth_required=True,
            owner="prompt-analyzer lane",
            summary=(
                "Analyzer selection order, request/response schema, prompt analyzer catalog, "
                "deprecations, and examples."
            ),
        )
    ]

    return ContractsIndexResponse(
        version=META_CONTRACTS_INDEX_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        contracts=contracts,
    )
