"""Dev Semantic Surface API.

Read-only views over the prompt/asset semantic surface — coverage of
primitive packs against ontology namespaces, used by the
Semantic Surface Inspector dev panel.

Phase v0: coverage-matrix only. Concept browser and asset tag tracer
are tracked as later checkpoints on the
`prompt-semantic-surface` plan.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.prompt.block.coverage import (
    compute_coverage_matrix,
)

router = APIRouter(prefix="/dev/semantic-surface", tags=["dev", "semantic-surface"])


class CoverageSampleResponse(BaseModel):
    block_id: str
    text_preview: str


class CoverageCellResponse(BaseModel):
    row: str
    col: str
    matched_count: int
    total: int
    ratio: float
    samples: List[CoverageSampleResponse] = Field(default_factory=list)


class SkippedPackResponse(BaseModel):
    pack: str
    error: str


class CoverageMatrixResponse(BaseModel):
    row_axis: Literal["pack", "category"]
    col_axis: Literal["namespace"]
    rows: List[str]
    cols: List[str]
    cells: List[CoverageCellResponse]
    row_totals: Dict[str, int]
    col_totals: Dict[str, int]
    grand_total: int
    skipped_packs: List[SkippedPackResponse] = Field(default_factory=list)


@router.get("/coverage-matrix", response_model=CoverageMatrixResponse)
def coverage_matrix(
    row_axis: Literal["pack", "category"] = Query("category"),
    col_axis: Literal["namespace"] = Query("namespace"),
) -> Dict[str, Any]:
    matrix = compute_coverage_matrix(row_axis=row_axis, col_axis=col_axis)
    return matrix.to_dict()


__all__ = ["router"]
