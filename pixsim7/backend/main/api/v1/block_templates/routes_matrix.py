"""Block matrix and meta endpoints."""
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, Query

from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from .schemas import (
    BlockMatrixResponse,
    BlockMatrixCellResponse,
    BlockMatrixCellSampleResponse,
)
from .helpers_roles import (
    _parse_tag_csv,
    _infer_block_composition_role,
)
from .helpers_matrix import (
    _resolve_block_matrix_value,
    _extend_axis_values_from_canonical_dictionary,
    _family_expected_values_for_matrix_axis,
    _get_prompt_block_family_schema,
    _build_block_matrix_drift_report,
)
from .router import router


@router.get("/meta/blocks/matrix", response_model=BlockMatrixResponse)
async def get_block_matrix(
    row_key: str = Query(
        ...,
        description=(
            "Matrix row axis key (tag key or top-level field; use tag:<key> for tags). "
            "Supported op axes: op_id, signature_id, op_namespace, op_modalities."
        ),
    ),
    col_key: str = Query(
        ...,
        description=(
            "Matrix column axis key (tag key or top-level field; use tag:<key> for tags). "
            "Supported op axes: op_id, signature_id, op_namespace, op_modalities."
        ),
    ),
    source: str = Query("primitives", description='Block source: "primitives"'),
    composition_role: Optional[str] = Query(None, description="Filter by inferred composition role id"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Ignored for primitives matrix"),
    package_name: Optional[str] = Query(None, description="Filter by package via tags.source_pack"),
    q: Optional[str] = Query(None, description="Text search in block_id and text"),
    tags: Optional[str] = Query(None, description="Tag filters as comma-separated key:value pairs"),
    limit: int = Query(5000, ge=1, le=20000, description="Max blocks scanned for matrix"),
    sample_per_cell: int = Query(3, ge=0, le=20, description="Sample blocks returned per matrix cell"),
    missing_label: str = Query("__missing__", min_length=1, max_length=64),
    include_empty: bool = Query(False, description="Include zero-count cells in response"),
    expected_row_values: Optional[str] = Query(None, description="Optional comma-separated row values to include even when empty"),
    expected_col_values: Optional[str] = Query(None, description="Optional comma-separated column values to include even when empty"),
    include_drift_report: bool = Query(False, description="Include drift report under filters.drift_report"),
    use_canonical_expected_values: bool = Query(False, description="When drift report enabled, treat canonical tag allowed_values as expected when expected_* is not provided"),
    expected_tag_keys: Optional[str] = Query(None, description="Comma-separated tag keys expected in scoped blocks (drift report)"),
    required_tag_keys: Optional[str] = Query(None, description="Comma-separated tag keys required in scoped blocks (drift report)"),
    drift_max_entries: int = Query(50, ge=1, le=500, description="Max distinct drift items returned per section (drift report)"),
    drift_examples_per_entry: int = Query(5, ge=0, le=50, description="Max example block_ids returned per drift item (drift report)"),
):
    """Build a block coverage matrix from DB-loaded blocks (AI + UI friendly)."""
    if source != "primitives":
        raise HTTPException(
            status_code=400,
            detail="Legacy source is no longer supported. Use source='primitives'.",
        )

    tag_constraints = _parse_tag_csv(tags) or None
    if package_name:
        merged = dict(tag_constraints or {})
        merged.setdefault("source_pack", package_name)
        tag_constraints = merged

    # --- Fetch blocks from primitives source ---
    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    query = build_block_primitive_query(
        category=category,
        tag_query=tag_constraints,
        text_query=q,
    )
    query = query.order_by(BlockPrimitive.block_id).limit(limit)
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    effective_composition_role = None
    if isinstance(composition_role, str) and composition_role.strip():
        effective_composition_role = composition_role.strip()
    if effective_composition_role:
        blocks = [b for b in blocks if _infer_block_composition_role(b) == effective_composition_role]

    # --- Auto-expected values from family schema (legacy only) ---
    family_schema = _get_prompt_block_family_schema((tag_constraints or {}).get("sequence_family"))
    auto_expected_row_values = _family_expected_values_for_matrix_axis(
        family_schema,
        axis_key=row_key,
        tag_constraints=tag_constraints,
    )
    auto_expected_col_values = _family_expected_values_for_matrix_axis(
        family_schema,
        axis_key=col_key,
        tag_constraints=tag_constraints,
    )
    effective_expected_row_values = expected_row_values or (
        ",".join(auto_expected_row_values) if auto_expected_row_values else None
    )
    effective_expected_col_values = expected_col_values or (
        ",".join(auto_expected_col_values) if auto_expected_col_values else None
    )

    matrix_counts: Dict[tuple[str, str], int] = {}
    matrix_samples: Dict[tuple[str, str], List[Any]] = {}
    row_values: set[str] = set()
    col_values: set[str] = set()

    for b in blocks:
        row_value = _resolve_block_matrix_value(b, row_key, missing_label=missing_label)
        col_value = _resolve_block_matrix_value(b, col_key, missing_label=missing_label)
        row_values.add(row_value)
        col_values.add(col_value)
        key = (row_value, col_value)
        matrix_counts[key] = matrix_counts.get(key, 0) + 1
        if sample_per_cell > 0:
            bucket = matrix_samples.setdefault(key, [])
            if len(bucket) < sample_per_cell:
                bucket.append(b)

    _extend_axis_values_from_canonical_dictionary(
        row_values,
        row_key,
        include_empty=include_empty,
        expected_values_csv=effective_expected_row_values,
    )
    _extend_axis_values_from_canonical_dictionary(
        col_values,
        col_key,
        include_empty=include_empty,
        expected_values_csv=effective_expected_col_values,
    )

    sorted_rows = sorted(row_values)
    sorted_cols = sorted(col_values)

    cells: List[BlockMatrixCellResponse] = []
    if include_empty:
        keys_to_emit = [(r, c) for r in sorted_rows for c in sorted_cols]
    else:
        keys_to_emit = sorted(matrix_counts.keys())

    for r, c in keys_to_emit:
        count = matrix_counts.get((r, c), 0)
        if not include_empty and count <= 0:
            continue
        samples: List[BlockMatrixCellSampleResponse] = []
        for b in matrix_samples.get((r, c), []):
            tags_map = b.tags if isinstance(getattr(b, "tags", None), dict) else {}
            inferred = infer_composition_role(
                role=None,
                category=getattr(b, "category", None),
                tags=tags_map,
            )
            source_pack = tags_map.get("source_pack") if isinstance(tags_map, dict) else None
            package = str(source_pack).strip() if isinstance(source_pack, str) and source_pack.strip() else None
            samples.append(
                BlockMatrixCellSampleResponse(
                    id=b.id,
                    block_id=b.block_id,
                    package_name=package,
                    composition_role=inferred.role_id,
                    category=b.category,
                )
            )
        cells.append(
            BlockMatrixCellResponse(
                row_value=r,
                col_value=c,
                count=count,
                samples=samples,
            )
        )

    return BlockMatrixResponse(
        row_key=row_key,
        col_key=col_key,
        row_values=sorted_rows,
        col_values=sorted_cols,
        total_blocks=len(blocks),
        filters={
            "source": source,
            "composition_role": effective_composition_role,
            "category": category,
            "kind": kind,
            "package_name": package_name,
            "q": q,
            "tags": tag_constraints,
            "limit": limit,
            "sample_per_cell": sample_per_cell,
            "missing_label": missing_label,
            "drift_report": _build_block_matrix_drift_report(
                blocks=blocks,
                row_key=row_key,
                col_key=col_key,
                missing_label=missing_label,
                expected_row_values_csv=effective_expected_row_values,
                expected_col_values_csv=effective_expected_col_values,
                use_canonical_expected_values=use_canonical_expected_values,
                expected_tag_keys_csv=expected_tag_keys,
                required_tag_keys_csv=required_tag_keys,
                max_entries=drift_max_entries,
                max_examples_per_entry=drift_examples_per_entry,
                tag_constraints=tag_constraints,
            )
            if include_drift_report
            else None,
        },
        cells=cells,
    )


# ---------------------------------------------------------------------------
# Meta: op-signature registry
# ---------------------------------------------------------------------------


@router.get("/meta/op-signatures")
async def list_op_signatures_endpoint() -> List[Dict[str, Any]]:
    """Return the full op-signature registry for tooling / UI discovery."""
    from pixsim7.backend.main.services.prompt.block.op_signatures import list_op_signatures

    return [
        {
            "id": sig.id,
            "op_id_prefix": sig.op_id_prefix,
            "requires_variant_template": sig.requires_variant_template,
            "required_params": list(sig.required_params),
            "required_refs": list(sig.required_refs),
            "allowed_modalities": list(sig.allowed_modalities),
        }
        for sig in list_op_signatures()
    ]
