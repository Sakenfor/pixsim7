"""
UI catalog meta contract endpoints.

Queryable API for UI component metadata, composition patterns, and agent
guidance.  Backed by :mod:`services.meta.ui_catalog_registry` (hand-authored
Python data, not the generated JSON file).

All endpoints are unauthenticated — audience is ``["dev", "agent"]``.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.meta.ui_catalog_registry import ui_catalog_registry

router = APIRouter(prefix="/meta/ui", tags=["meta", "ui-catalog"])

UI_CATALOG_CONTRACT_VERSION = "2026-03-17.1"


# ═══════════════════════════════════════════════════════════════════════════
# Response models
# ═══════════════════════════════════════════════════════════════════════════


class UIExportResponse(BaseModel):
    name: str
    kind: str = "component"
    signature: Optional[str] = None


class UIComponentResponse(BaseModel):
    id: str
    name: str
    category: str
    source_file: str
    when_to_use: str
    use_instead_of: Optional[str] = None
    anti_patterns: List[str] = Field(default_factory=list)
    examples: List[str] = Field(default_factory=list)
    exports: List[UIExportResponse] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class UIComponentListResponse(BaseModel):
    count: int
    components: List[UIComponentResponse]


class UIPatternStepResponse(BaseModel):
    step: int
    description: str
    code: str = ""


class UIPatternResponse(BaseModel):
    id: str
    name: str
    description: str
    components: List[str]
    guidance: str
    recipe: List[UIPatternStepResponse] = Field(default_factory=list)
    example_code: str = ""
    source_files: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class UIPatternListResponse(BaseModel):
    count: int
    patterns: List[UIPatternResponse]


class UIGuidanceResponse(BaseModel):
    rules: List[str]
    checklist_before_coding: List[str]


class UIContractEndpoint(BaseModel):
    method: str
    path: str
    summary: str


class UICatalogContractResponse(BaseModel):
    version: str
    component_count: int
    pattern_count: int
    categories: List[str]
    guidance_rule_count: int
    endpoints: List[UIContractEndpoint]


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _component_to_response(c) -> UIComponentResponse:  # noqa: ANN001
    d = asdict(c)
    d["exports"] = [UIExportResponse(**e) for e in d.get("exports", [])]
    return UIComponentResponse(**d)


def _pattern_to_response(p) -> UIPatternResponse:  # noqa: ANN001
    d = asdict(p)
    d["recipe"] = [UIPatternStepResponse(**s) for s in d.get("recipe", [])]
    return UIPatternResponse(**d)


# ═══════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/contract", response_model=UICatalogContractResponse)
async def get_ui_catalog_contract():
    """Catalog summary: counts, categories, version, available endpoints."""
    summary = ui_catalog_registry.summary()
    return UICatalogContractResponse(
        version=UI_CATALOG_CONTRACT_VERSION,
        component_count=summary["component_count"],
        pattern_count=summary["pattern_count"],
        categories=summary["categories"],
        guidance_rule_count=summary["guidance_rule_count"],
        endpoints=[
            UIContractEndpoint(
                method="GET",
                path="/api/v1/meta/ui/components",
                summary="List/search components. Query: ?q=badge&category=display",
            ),
            UIContractEndpoint(
                method="GET",
                path="/api/v1/meta/ui/components/{component_id}",
                summary="Single component detail with exports, examples, and use_instead_of.",
            ),
            UIContractEndpoint(
                method="GET",
                path="/api/v1/meta/ui/patterns",
                summary="Composition patterns. Query: ?topic=overlay",
            ),
            UIContractEndpoint(
                method="GET",
                path="/api/v1/meta/ui/patterns/{pattern_id}",
                summary="Single pattern with step-by-step recipe.",
            ),
            UIContractEndpoint(
                method="GET",
                path="/api/v1/meta/ui/guidance",
                summary="Agent coding rules and pre-coding checklist.",
            ),
        ],
    )


@router.get("/components", response_model=UIComponentListResponse)
async def list_ui_components(
    q: Optional[str] = None,
    category: Optional[str] = None,
):
    """List/search UI components.

    - ``?q=badge`` — substring search across name, tags, use_instead_of
    - ``?category=overlay`` — filter by category
    - Both can be combined.
    """
    results = ui_catalog_registry.search(q=q, category=category)
    return UIComponentListResponse(
        count=len(results),
        components=[_component_to_response(c) for c in results],
    )


@router.get("/components/{component_id}", response_model=UIComponentResponse)
async def get_ui_component(component_id: str):
    """Single component detail."""
    component = ui_catalog_registry.get(component_id)
    if component is None:
        raise HTTPException(status_code=404, detail=f"Component '{component_id}' not found")
    return _component_to_response(component)


@router.get("/patterns", response_model=UIPatternListResponse)
async def list_ui_patterns(topic: Optional[str] = None):
    """List composition patterns.

    - ``?topic=overlay`` — filter by topic keyword.
    """
    results = ui_catalog_registry.list_patterns(topic=topic)
    return UIPatternListResponse(
        count=len(results),
        patterns=[_pattern_to_response(p) for p in results],
    )


@router.get("/patterns/{pattern_id}", response_model=UIPatternResponse)
async def get_ui_pattern(pattern_id: str):
    """Single pattern with full recipe."""
    pattern = ui_catalog_registry.get_pattern(pattern_id)
    if pattern is None:
        raise HTTPException(status_code=404, detail=f"Pattern '{pattern_id}' not found")
    return _pattern_to_response(pattern)


@router.get("/guidance", response_model=UIGuidanceResponse)
async def get_ui_guidance():
    """Agent coding rules and pre-coding checklist."""
    g = ui_catalog_registry.get_guidance()
    return UIGuidanceResponse(
        rules=g.rules,
        checklist_before_coding=g.checklist_before_coding,
    )
