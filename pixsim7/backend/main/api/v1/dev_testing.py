"""
Dev Testing API

Live test suite discovery and catalog validation.
Test execution is handled by the codegen API (``/devtools/codegen/tests/run``).
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.testing.catalog import (
    build_catalog,
    validate_catalog,
)

router = APIRouter(prefix="/dev/testing", tags=["dev", "testing"])


# ── Response models ──────────────────────────────────────────────


class SuiteResponse(BaseModel):
    id: str
    label: str
    path: str
    layer: str
    kind: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    covers: List[str] = Field(default_factory=list)
    order: Optional[float] = None


class CatalogResponse(BaseModel):
    suite_count: int
    suites: List[SuiteResponse]


class ValidationResponse(BaseModel):
    ok: bool
    suite_count: int
    errors: List[str] = Field(default_factory=list)


# ── Endpoints ────────────────────────────────────────────────────


@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    layer: Optional[str] = Query(None, description="Filter by layer (backend, frontend, scripts)"),
    category: Optional[str] = Query(None, description="Filter by category prefix"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
) -> CatalogResponse:
    """Live suite catalog — discovers TEST_SUITE dicts at request time."""
    suites = build_catalog()

    if layer:
        suites = [s for s in suites if s.get("layer") == layer]
    if category:
        suites = [s for s in suites if (s.get("category") or "").startswith(category)]
    if kind:
        suites = [s for s in suites if s.get("kind") == kind]

    return CatalogResponse(
        suite_count=len(suites),
        suites=[SuiteResponse(**s) for s in suites],
    )


@router.get("/catalog/validate", response_model=ValidationResponse)
async def validate_catalog_endpoint() -> ValidationResponse:
    """Validate all suite metadata (paths exist, required fields present)."""
    suites = build_catalog()
    errors = validate_catalog(suites)
    return ValidationResponse(
        ok=not errors,
        suite_count=len(suites),
        errors=errors,
    )
