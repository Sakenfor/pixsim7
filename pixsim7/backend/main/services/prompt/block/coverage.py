"""Block primitive ↔ ontology coverage matrix.

Walks every primitive pack on disk (same source the audit script uses)
and pivots their auto-derived ontology_ids into a 2D matrix:

    rows   = primitive grouping (pack or category)
    cols   = ontology namespace (prefix before `:` in each ontology_id)
    cells  = how many primitives in `row` carry at least one ontology_id
             whose namespace == col, plus the row total and a small
             sample of contributing block_ids.

Read-only and pure: loads YAML from `content_packs/primitives/`, no DB
writes, no plugin side effects beyond what `_collect_pack_primitives`
already does. Both `tools/audit_block_ontology_coverage.py` and the
`/api/v1/dev/semantic-surface/coverage-matrix` endpoint call into this.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from pixsim7.backend.main.services.prompt.block import primitive_loader

PRIMITIVES_ROOT = (
    Path(__file__).resolve().parents[3]
    / "content_packs"
    / "primitives"
)

RowAxis = Literal["pack", "category"]
ColAxis = Literal["namespace"]

_SAMPLES_PER_CELL = 3


@dataclass
class CoverageSample:
    block_id: str
    text_preview: str


@dataclass
class CoverageCell:
    row: str
    col: str
    matched_count: int
    total: int  # row total (denominator)
    ratio: float
    samples: List[CoverageSample] = field(default_factory=list)


@dataclass
class CoverageMatrix:
    row_axis: RowAxis
    col_axis: ColAxis
    rows: List[str]
    cols: List[str]
    cells: List[CoverageCell]
    row_totals: Dict[str, int]
    col_totals: Dict[str, int]
    grand_total: int
    skipped_packs: List[Tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "row_axis": self.row_axis,
            "col_axis": self.col_axis,
            "rows": self.rows,
            "cols": self.cols,
            "cells": [asdict(c) for c in self.cells],
            "row_totals": self.row_totals,
            "col_totals": self.col_totals,
            "grand_total": self.grand_total,
            "skipped_packs": [{"pack": p, "error": e} for p, e in self.skipped_packs],
        }


def _resolve_category(block: Dict[str, Any]) -> str:
    cat = block.get("category")
    if isinstance(cat, str) and cat.strip():
        return cat.strip()
    tags = block.get("tags") or {}
    if isinstance(tags, dict):
        legacy = tags.get("legacy_category")
        if isinstance(legacy, str) and legacy.strip():
            return legacy.strip()
    return "<no_category>"


def _ontology_ids(block: Dict[str, Any]) -> List[str]:
    tags = block.get("tags") or {}
    if not isinstance(tags, dict):
        return []
    ids = tags.get("ontology_ids")
    if not isinstance(ids, list):
        return []
    return [oid for oid in ids if isinstance(oid, str) and ":" in oid]


def _namespace(ontology_id: str) -> str:
    return ontology_id.split(":", 1)[0]


def _iter_primitives(
    primitives_root: Path,
) -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Yield (pack_name, block) for every primitive on disk.

    Skipped packs surface as a `_skipped` sentinel tuple — the caller
    pulls them off the stream and stores them on the matrix.
    """
    for pack_dir in sorted(p for p in primitives_root.iterdir() if p.is_dir()):
        try:
            blocks = primitive_loader._collect_pack_primitives(pack_dir)
        except Exception as exc:  # noqa: BLE001 — audit is best-effort
            yield ("_skipped", {"pack": pack_dir.name, "error": str(exc)})
            continue
        for block in blocks:
            yield (pack_dir.name, block)


def compute_coverage_matrix(
    *,
    row_axis: RowAxis = "category",
    col_axis: ColAxis = "namespace",
    primitives_root: Optional[Path] = None,
) -> CoverageMatrix:
    """Build a coverage matrix over every primitive on disk.

    `row_axis="pack"` groups by content pack name; `"category"` groups
    by primitive `category` (fallback to legacy_category, then
    `<no_category>`). `col_axis="namespace"` is the only column shape
    today — each col is the namespace prefix of an ontology_id.
    """
    root = primitives_root or PRIMITIVES_ROOT
    if not root.exists():
        return CoverageMatrix(
            row_axis=row_axis,
            col_axis=col_axis,
            rows=[],
            cols=[],
            cells=[],
            row_totals={},
            col_totals={},
            grand_total=0,
        )

    skipped: List[Tuple[str, str]] = []
    row_totals: Dict[str, int] = defaultdict(int)
    col_totals: Dict[str, int] = defaultdict(int)
    cell_counts: Dict[Tuple[str, str], int] = defaultdict(int)
    cell_samples: Dict[Tuple[str, str], List[CoverageSample]] = defaultdict(list)
    grand_total = 0

    for pack_name, block in _iter_primitives(root):
        if pack_name == "_skipped":
            skipped.append((block["pack"], block["error"]))
            continue

        row = pack_name if row_axis == "pack" else _resolve_category(block)
        row_totals[row] += 1
        grand_total += 1

        ids = _ontology_ids(block)
        if not ids:
            continue

        block_id = str(block.get("block_id") or "<unknown>")
        text_preview = (str(block.get("text") or "")[:120]).strip()

        # Each (row, namespace) pair counts the primitive once even if it
        # has multiple ontology_ids in that namespace.
        seen_namespaces_for_block: set[str] = set()
        for oid in ids:
            ns = _namespace(oid)
            if not ns or ns in seen_namespaces_for_block:
                continue
            seen_namespaces_for_block.add(ns)
            key = (row, ns)
            cell_counts[key] += 1
            col_totals[ns] += 1
            samples = cell_samples[key]
            if len(samples) < _SAMPLES_PER_CELL:
                samples.append(CoverageSample(block_id=block_id, text_preview=text_preview))

    rows_sorted = sorted(row_totals.keys(), key=lambda r: (-row_totals[r], r))
    cols_sorted = sorted(col_totals.keys(), key=lambda c: (-col_totals[c], c))

    cells: List[CoverageCell] = []
    for row in rows_sorted:
        total = row_totals[row]
        for col in cols_sorted:
            key = (row, col)
            matched = cell_counts.get(key, 0)
            ratio = (matched / total) if total else 0.0
            cells.append(
                CoverageCell(
                    row=row,
                    col=col,
                    matched_count=matched,
                    total=total,
                    ratio=ratio,
                    samples=cell_samples.get(key, []),
                )
            )

    return CoverageMatrix(
        row_axis=row_axis,
        col_axis=col_axis,
        rows=rows_sorted,
        cols=cols_sorted,
        cells=cells,
        row_totals=dict(row_totals),
        col_totals=dict(col_totals),
        grand_total=grand_total,
        skipped_packs=skipped,
    )


__all__ = [
    "CoverageMatrix",
    "CoverageCell",
    "CoverageSample",
    "compute_coverage_matrix",
    "PRIMITIVES_ROOT",
]
