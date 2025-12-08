"""
Analyzer API endpoints

Provides discovery of available analyzers (prompt and asset) for frontend configuration.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from pixsim7.backend.main.services.prompt_parser import analyzer_registry, AnalyzerTarget

router = APIRouter()


class AnalyzerResponse(BaseModel):
    """Response schema for analyzer info."""
    id: str
    name: str
    description: str
    kind: str
    target: str
    enabled: bool
    is_default: bool


class AnalyzersListResponse(BaseModel):
    """Response for list of analyzers."""
    analyzers: List[AnalyzerResponse]
    default_id: str


@router.get("/analyzers", response_model=AnalyzersListResponse)
async def list_analyzers(
    target: Optional[str] = Query(
        None,
        description="Filter by target: 'prompt' or 'asset'. If not specified, returns all."
    ),
    include_legacy: bool = Query(
        False,
        description="Include legacy analyzer IDs (parser:*, llm:*)"
    ),
):
    """
    List available analyzers.

    Returns registered analyzers filtered by target.
    Frontend uses this to populate analyzer selection dropdowns.

    Query params:
    - target: 'prompt' for text analysis, 'asset' for media analysis
    - include_legacy: include backward-compatible aliases
    """
    # Filter by target if specified
    if target:
        try:
            target_enum = AnalyzerTarget(target)
            analyzers = analyzer_registry.list_by_target(target_enum, include_legacy)
            default = analyzer_registry.get_default(target_enum)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target '{target}'. Must be 'prompt' or 'asset'."
            )
    else:
        analyzers = analyzer_registry.list_enabled(include_legacy)
        default = analyzer_registry.get_default()

    return AnalyzersListResponse(
        analyzers=[
            AnalyzerResponse(
                id=a.id,
                name=a.name,
                description=a.description,
                kind=a.kind.value,
                target=a.target.value,
                enabled=a.enabled,
                is_default=a.is_default,
            )
            for a in analyzers
        ],
        default_id=default.id if default else "prompt:simple",
    )


@router.get("/analyzers/{analyzer_id}", response_model=AnalyzerResponse)
async def get_analyzer(analyzer_id: str):
    """
    Get info about a specific analyzer.
    """
    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=404, detail=f"Analyzer '{analyzer_id}' not found")

    return AnalyzerResponse(
        id=analyzer.id,
        name=analyzer.name,
        description=analyzer.description,
        kind=analyzer.kind.value,
        target=analyzer.target.value,
        enabled=analyzer.enabled,
        is_default=analyzer.is_default,
    )
