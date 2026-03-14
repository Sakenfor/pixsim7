"""
Global machine-readable contract discovery index.

Returns a navigable graph of all meta contract surfaces.  Each contract
declares what it ``provides`` and what other contracts it ``relates_to``,
so consumers can walk the graph from any entry point.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)

router = APIRouter(prefix="/meta", tags=["meta"])


class ContractEndpointEntry(BaseModel):
    id: str
    method: str
    path: str
    summary: str


class ContractIndexEntry(BaseModel):
    id: str
    name: str
    endpoint: Optional[str] = Field(
        None,
        description="Primary contract endpoint. Null if contract is an endpoint group.",
    )
    version: str
    auth_required: bool
    owner: str
    summary: str
    provides: List[str] = Field(
        default_factory=list,
        description="Capabilities this contract surface exposes.",
    )
    relates_to: List[str] = Field(
        default_factory=list,
        description="IDs of related contracts (bidirectional navigation).",
    )
    sub_endpoints: List[ContractEndpointEntry] = Field(
        default_factory=list,
        description="Individual endpoints when contract is an endpoint group.",
    )


class ContractsIndexResponse(BaseModel):
    version: str
    generated_at: str
    contracts: List[ContractIndexEntry]


@router.get("/contracts", response_model=ContractsIndexResponse)
async def list_contract_endpoints() -> ContractsIndexResponse:
    """
    List machine-readable contract endpoints available under /api/v1.

    Each contract declares `provides` (capabilities) and `relates_to`
    (other contract IDs), forming a navigable discovery graph.
    Plugins can register additional contracts.
    """
    # Lazily sync prompt contract versions from their canonical constants
    _sync_prompt_contract_versions()

    contracts = [
        ContractIndexEntry(
            id=c.id,
            name=c.name,
            endpoint=c.endpoint,
            version=c.version,
            auth_required=c.auth_required,
            owner=c.owner,
            summary=c.summary,
            provides=c.provides,
            relates_to=c.relates_to,
            sub_endpoints=[
                ContractEndpointEntry(
                    id=ep.id,
                    method=ep.method,
                    path=ep.path,
                    summary=ep.summary,
                )
                for ep in c.sub_endpoints
            ],
        )
        for c in meta_contract_registry.values()
    ]

    return ContractsIndexResponse(
        version="2026-03-14.1",
        generated_at=datetime.now(timezone.utc).isoformat(),
        contracts=contracts,
    )


def _sync_prompt_contract_versions() -> None:
    """Keep registry versions in sync with the canonical version constants."""
    from pixsim7.backend.main.api.v1.prompts.meta import (
        PROMPT_ANALYSIS_CONTRACT_VERSION,
        PROMPT_AUTHORING_CONTRACT_VERSION,
    )

    meta_contract_registry.update_version(
        "prompts.analysis", PROMPT_ANALYSIS_CONTRACT_VERSION
    )
    meta_contract_registry.update_version(
        "prompts.authoring", PROMPT_AUTHORING_CONTRACT_VERSION
    )
