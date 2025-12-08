"""
Prompt Analyzer API endpoints

Provides discovery of available prompt analyzers for frontend configuration.
"""

from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

from pixsim7.backend.main.services.prompt_parser import analyzer_registry, AnalyzerKind

router = APIRouter()


class AnalyzerResponse(BaseModel):
    """Response schema for analyzer info."""
    id: str
    name: str
    description: str
    kind: str
    enabled: bool
    is_default: bool


class AnalyzersListResponse(BaseModel):
    """Response for list of analyzers."""
    analyzers: List[AnalyzerResponse]
    default_id: str


@router.get("/analyzers", response_model=AnalyzersListResponse)
async def list_analyzers():
    """
    List available prompt analyzers.

    Returns all registered analyzers with their metadata.
    Frontend uses this to populate analyzer selection dropdowns.
    """
    analyzers = analyzer_registry.list_enabled()
    default = analyzer_registry.get_default()

    return AnalyzersListResponse(
        analyzers=[
            AnalyzerResponse(
                id=a.id,
                name=a.name,
                description=a.description,
                kind=a.kind.value,
                enabled=a.enabled,
                is_default=a.is_default,
            )
            for a in analyzers
        ],
        default_id=default.id if default else "parser:simple",
    )


@router.get("/analyzers/{analyzer_id}", response_model=AnalyzerResponse)
async def get_analyzer(analyzer_id: str):
    """
    Get info about a specific analyzer.
    """
    from fastapi import HTTPException

    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=404, detail=f"Analyzer '{analyzer_id}' not found")

    return AnalyzerResponse(
        id=analyzer.id,
        name=analyzer.name,
        description=analyzer.description,
        kind=analyzer.kind.value,
        enabled=analyzer.enabled,
        is_default=analyzer.is_default,
    )
