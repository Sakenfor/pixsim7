"""Block Templates API endpoints

REST API for managing block templates and rolling prompts:
- CRUD operations for templates
- Roll: randomly compose a prompt from template slot constraints
- Preview: count/sample matching blocks for a slot definition
"""
from datetime import datetime
from collections import Counter
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.services.prompt.block.block_query import (
    build_prompt_block_query,
)
from pixsim7.backend.main.services.prompt.block.template_slots import TemplateSlotSpec
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
    get_canonical_block_tag_dictionary,
    get_block_tag_alias_key_map,
)

router = APIRouter(prefix="/block-templates", tags=["block-templates"])


# ===== Request/Response Models =====

class TemplateSlotInput(TemplateSlotSpec):
    """Canonical template slot input shape (strict)."""


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    slots: List[TemplateSlotInput] = Field(default_factory=list)
    composition_strategy: str = Field("sequential")
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    template_metadata: Dict[str, Any] = Field(default_factory=dict)
    character_bindings: Dict[str, Any] = Field(default_factory=dict)


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    slots: Optional[List[TemplateSlotInput]] = None
    composition_strategy: Optional[str] = None
    package_name: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    template_metadata: Optional[Dict[str, Any]] = None
    character_bindings: Optional[Dict[str, Any]] = None


class RollTemplateRequest(BaseModel):
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    exclude_block_ids: Optional[List[UUID]] = Field(None, description="Block IDs to exclude globally")
    character_bindings: Optional[Dict[str, Any]] = Field(None, description="Override character bindings for this roll")
    control_values: Optional[Dict[str, float]] = Field(None, description="Slider control overrides (control_id -> value); defaults to each control's defaultValue")


class PreviewSlotRequest(BaseModel):
    slot: TemplateSlotInput
    limit: int = Field(5, ge=1, le=20)


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slots: List[Dict[str, Any]] = Field(default_factory=list)
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    created_by: Optional[str] = None
    roll_count: int = 0
    template_metadata: Dict[str, Any] = Field(default_factory=dict)
    character_bindings: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateSummaryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slot_count: int = 0
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    roll_count: int = 0
    composition_role_gap_count: int = 0
    composition_role_ids: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateSlotPackageCountResponse(BaseModel):
    package_name: Optional[str] = None
    count: int = 0


class TemplateSlotDiagnosticsResponse(BaseModel):
    slot_index: int
    label: str
    kind: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None
    selection_strategy: str
    optional: bool = False
    slot_package_name: Optional[str] = None
    template_package_name: Optional[str] = None
    status_hint: str = "queryable"
    total_matches: int = 0
    package_match_counts: List[TemplateSlotPackageCountResponse] = Field(default_factory=list)
    template_package_match_count: int = 0
    other_package_match_count: int = 0
    has_matches_outside_template_package: bool = False
    would_need_fallback_if_template_package_restricted: bool = False
    composition_role_hint: Optional[str] = None
    composition_role_confidence: Optional[str] = None
    composition_role_reason: Optional[str] = None


class TemplateDiagnosticsTemplateSummaryResponse(BaseModel):
    id: str
    name: str
    slug: str
    package_name: Optional[str] = None
    composition_strategy: str
    slot_count: int
    slot_schema_version: Optional[int] = None
    source: Dict[str, Any] = Field(default_factory=dict)
    dependencies: Dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[str] = None


class TemplateDiagnosticsResponse(BaseModel):
    success: bool = True
    template: TemplateDiagnosticsTemplateSummaryResponse
    slots: List[TemplateSlotDiagnosticsResponse] = Field(default_factory=list)


# ===== CRUD Endpoints =====

@router.post("", response_model=TemplateResponse)
async def create_template(
    request: CreateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new block template."""
    service = BlockTemplateService(db)

    existing = await service.get_template_by_slug(request.slug)
    if existing:
        raise HTTPException(400, f"Template with slug '{request.slug}' already exists")

    data = request.model_dump()
    # Convert slot models to dicts
    data["slots"] = [s.model_dump() for s in request.slots]

    template = await service.create_template(
        data=data,
        created_by=current_user.username if current_user else None,
    )
    return template


def _compute_slot_composition_summary(slots: Any) -> tuple[int, List[str]]:
    """Return (gap_count, unique_role_ids) from composition role inference."""
    if not isinstance(slots, list):
        return 0, []
    gaps = 0
    role_ids: set[str] = set()
    for slot in slots:
        if not isinstance(slot, dict):
            continue
        result = infer_composition_role(
            role=slot.get("role"),
            category=slot.get("category"),
            tags=slot.get("tags") or slot.get("tag_constraints"),
        )
        if result.confidence in ("unknown", "ambiguous"):
            gaps += 1
        if result.role_id:
            role_ids.add(result.role_id)
    return gaps, sorted(role_ids)


def _enrich_slots_with_composition_hints(slots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add composition_role_hint to each slot dict (non-mutating)."""
    enriched = []
    for slot in slots:
        result = infer_composition_role(
            role=slot.get("role"),
            category=slot.get("category"),
            tags=slot.get("tags") or slot.get("tag_constraints"),
        )
        enriched.append({
            **slot,
            "composition_role_hint": result.role_id,
        })
    return enriched


@router.get("", response_model=List[TemplateSummaryResponse])
async def list_templates(
    package_name: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List/search block templates."""
    service = BlockTemplateService(db)
    templates = await service.search_templates(
        package_name=package_name,
        is_public=is_public,
        tag=tag,
        limit=limit,
        offset=offset,
    )
    result = []
    for t in templates:
        gap_count, role_ids = _compute_slot_composition_summary(t.slots)
        result.append(TemplateSummaryResponse(
            id=t.id,
            name=t.name,
            slug=t.slug,
            description=t.description,
            slot_count=len(t.slots) if t.slots else 0,
            composition_strategy=t.composition_strategy,
            package_name=t.package_name,
            tags=t.tags or [],
            is_public=t.is_public,
            roll_count=t.roll_count,
            composition_role_gap_count=gap_count,
            composition_role_ids=role_ids,
            created_at=t.created_at,
            updated_at=t.updated_at,
        ))
    return result


def _template_response_with_hints(template: Any) -> TemplateResponse:
    """Build TemplateResponse with composition_role_hint enriched on each slot."""
    slots = template.slots if isinstance(template.slots, list) else []
    return TemplateResponse(
        id=template.id,
        name=template.name,
        slug=template.slug,
        description=template.description,
        slots=_enrich_slots_with_composition_hints(slots),
        composition_strategy=template.composition_strategy,
        package_name=template.package_name,
        tags=template.tags or [],
        is_public=template.is_public,
        created_by=template.created_by,
        roll_count=template.roll_count,
        template_metadata=template.template_metadata or {},
        character_bindings=template.character_bindings or {},
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get template by ID."""
    service = BlockTemplateService(db)
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return _template_response_with_hints(template)


@router.get("/by-slug/{slug}", response_model=TemplateResponse)
async def get_template_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get template by slug."""
    service = BlockTemplateService(db)
    template = await service.get_template_by_slug(slug)
    if not template:
        raise HTTPException(404, "Template not found")
    return _template_response_with_hints(template)


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    request: UpdateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a template."""
    service = BlockTemplateService(db)

    if request.slug is not None:
        existing = await service.get_template_by_slug(request.slug)
        if existing and existing.id != template_id:
            raise HTTPException(400, f"Template with slug '{request.slug}' already exists")

    updates = {}
    for key, value in request.model_dump(exclude_unset=True).items():
        if value is not None:
            if key == "slots":
                updates[key] = [s.model_dump() if hasattr(s, "model_dump") else s for s in value]
            else:
                updates[key] = value

    template = await service.update_template(template_id, updates)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a template."""
    service = BlockTemplateService(db)
    success = await service.delete_template(template_id)
    if not success:
        raise HTTPException(404, "Template not found")
    return {"success": True, "message": "Template deleted"}


# ===== Roll & Preview Endpoints =====

@router.post("/{template_id}/roll", response_model=Dict[str, Any])
async def roll_template(
    template_id: UUID,
    request: RollTemplateRequest = RollTemplateRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Roll a template: randomly select blocks per slot and compose a prompt."""
    service = BlockTemplateService(db)
    result = await service.roll_template(
        template_id,
        seed=request.seed,
        exclude_block_ids=request.exclude_block_ids,
        character_bindings=request.character_bindings,
        control_values=request.control_values,
    )
    if not result.get("success"):
        raise HTTPException(404, result.get("error", "Roll failed"))
    return result


@router.get("/{template_id}/diagnostics", response_model=TemplateDiagnosticsResponse)
async def get_template_diagnostics(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Inspect slot candidate counts by package for a template."""
    service = BlockTemplateService(db)
    result = await service.diagnose_template(template_id)
    if not result.get("success"):
        error = str(result.get("error") or "Diagnostics failed")
        if "not found" in error.lower():
            raise HTTPException(404, error)
        raise HTTPException(400, error)
    return result


@router.post("/preview-slot", response_model=Dict[str, Any])
async def preview_slot(
    request: PreviewSlotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Preview matching block count and samples for a slot definition."""
    service = BlockTemplateService(db)
    return await service.preview_slot_matches(
        slot=request.slot.model_dump(),
        limit=request.limit,
    )


@router.get("/meta/packages", response_model=List[str])
async def list_block_packages(
    db: AsyncSession = Depends(get_db),
):
    """List distinct package names from prompt blocks."""
    service = BlockTemplateService(db)
    return await service.list_package_names()


# ===== Block Search =====

class BlockResponse(BaseModel):
    id: UUID
    block_id: str
    role: Optional[str] = None
    category: Optional[str] = None
    kind: str = "single_state"
    default_intent: Optional[str] = None
    text: str = ""
    tags: Dict[str, Any] = Field(default_factory=dict)
    complexity_level: Optional[str] = None
    package_name: Optional[str] = None
    description: Optional[str] = None
    word_count: int = 0

    class Config:
        from_attributes = True


class BlockCatalogRowResponse(BaseModel):
    id: UUID
    block_id: str
    role: Optional[str] = None
    category: Optional[str] = None
    package_name: Optional[str] = None
    kind: str = "single_state"
    default_intent: Optional[str] = None
    tags: Dict[str, Any] = Field(default_factory=dict)
    word_count: int = 0
    text_preview: str = ""


class BlockMatrixCellSampleResponse(BaseModel):
    id: UUID
    block_id: str
    package_name: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None


class BlockMatrixCellResponse(BaseModel):
    row_value: str
    col_value: str
    count: int
    samples: List[BlockMatrixCellSampleResponse] = Field(default_factory=list)


class BlockMatrixResponse(BaseModel):
    row_key: str
    col_key: str
    row_values: List[str] = Field(default_factory=list)
    col_values: List[str] = Field(default_factory=list)
    total_blocks: int = 0
    filters: Dict[str, Any] = Field(default_factory=dict)
    cells: List[BlockMatrixCellResponse] = Field(default_factory=list)


class ContentPackMatrixPresetResponse(BaseModel):
    label: str
    query: Dict[str, Any] = Field(default_factory=dict)


class ContentPackMatrixManifestResponse(BaseModel):
    pack_name: str
    source: str
    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    matrix_presets: List[ContentPackMatrixPresetResponse] = Field(default_factory=list)


class BlockTagDictionaryValueSummaryResponse(BaseModel):
    value: str
    count: int
    status: str = "observed"


class BlockTagDictionaryAliasesResponse(BaseModel):
    keys: List[str] = Field(default_factory=list)
    values: Dict[str, str] = Field(default_factory=dict)


class BlockTagDictionaryExampleResponse(BaseModel):
    id: UUID
    block_id: str
    package_name: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None


class BlockTagDictionaryKeyResponse(BaseModel):
    key: str
    status: str = "canonical"
    description: Optional[str] = None
    data_type: str = "string"
    observed_count: int = 0
    common_values: List[BlockTagDictionaryValueSummaryResponse] = Field(default_factory=list)
    aliases: Optional[BlockTagDictionaryAliasesResponse] = None
    examples: List[BlockTagDictionaryExampleResponse] = Field(default_factory=list)


class BlockTagDictionaryWarningResponse(BaseModel):
    kind: str
    message: str
    keys: List[str] = Field(default_factory=list)


class BlockTagDictionaryResponse(BaseModel):
    version: int = 1
    generated_at: str
    scope: Dict[str, Any] = Field(default_factory=dict)
    keys: List[BlockTagDictionaryKeyResponse] = Field(default_factory=list)
    warnings: List[BlockTagDictionaryWarningResponse] = Field(default_factory=list)


def _parse_tag_csv(tags: Optional[str]) -> Dict[str, str]:
    tag_constraints: Dict[str, str] = {}
    if not tags:
        return tag_constraints
    for pair in tags.split(","):
        pair = pair.strip()
        if ":" not in pair:
            continue
        tag_key, tag_value = pair.split(":", 1)
        tag_constraints[tag_key.strip()] = tag_value.strip()
    return tag_constraints


def _resolve_block_matrix_value(
    block: Any,
    key: str,
    *,
    missing_label: str = "__missing__",
) -> str:
    """Resolve a matrix axis key from top-level block fields or tags.

    Rules:
    - `tag:<key>` explicitly targets tags
    - known top-level keys use block attrs
    - unknown keys fall back to tags[key]
    """
    key = (key or "").strip()
    if not key:
        return missing_label

    top_level_keys = {"role", "category", "package_name", "kind", "default_intent", "complexity_level"}
    tags = getattr(block, "tags", None)
    tags_dict: Dict[str, Any] = tags if isinstance(tags, dict) else {}

    if key.startswith("tag:"):
        tag_key = key[4:]
        value = tags_dict.get(tag_key)
    elif key in top_level_keys:
        value = getattr(block, key, None)
        if key == "default_intent" and value is not None:
            value = getattr(value, "value", value)
    else:
        value = tags_dict.get(key)

    if value is None or value == "":
        return missing_label
    if isinstance(value, list):
        return "|".join(str(v) for v in value)
    if isinstance(value, dict):
        # Keep matrix cells readable; nested dicts are not ideal matrix axes.
        return "{...}"
    return str(value)


def _extend_axis_values_from_canonical_dictionary(
    axis_values: set[str],
    axis_key: str,
    *,
    include_empty: bool,
    expected_values_csv: Optional[str],
) -> None:
    """Augment observed axis values with canonical allowed values when requested.

    This makes matrix presets more future-proof:
    - If `include_empty=true` and the axis is a canonical tag key with allowed_values,
      we include those values even if no blocks exist yet.
    - Explicit `expected_*_values` always wins (we still include those as well).
    """
    if expected_values_csv:
        axis_values.update(v.strip() for v in expected_values_csv.split(",") if v.strip())
        return
    if not include_empty:
        return

    # Only apply to tag axes (explicit tag:<key>), or implicit tag axes that match canonical keys.
    from pixsim7.backend.main.services.prompt.block.tag_dictionary import get_canonical_block_tag_dictionary

    canonical = get_canonical_block_tag_dictionary()
    axis_key = (axis_key or "").strip()
    if not axis_key:
        return

    top_level_keys = {"role", "category", "package_name", "kind", "default_intent", "complexity_level"}
    tag_key: Optional[str] = None
    if axis_key.startswith("tag:"):
        tag_key = axis_key[4:].strip()
    elif axis_key not in top_level_keys and axis_key in canonical:
        tag_key = axis_key

    if not tag_key:
        return

    meta = canonical.get(tag_key) or {}
    allowed = meta.get("allowed_values") or []
    if isinstance(allowed, list) and allowed:
        axis_values.update(str(v) for v in allowed if v is not None and str(v).strip())


def _parse_csv_values(csv: Optional[str]) -> List[str]:
    if not csv:
        return []
    return [v.strip() for v in csv.split(",") if v.strip()]


def _axis_key_to_tag_key(axis_key: str) -> Optional[str]:
    """Map a matrix axis key to the underlying tag key, if it targets tags."""
    axis_key = (axis_key or "").strip()
    if not axis_key:
        return None
    if axis_key.startswith("tag:"):
        return axis_key[4:].strip() or None
    top_level_keys = {"role", "category", "package_name", "kind", "default_intent", "complexity_level"}
    return None if axis_key in top_level_keys else axis_key


def _canonical_allowed_values_for_tag_key(tag_key: str) -> List[str]:
    from pixsim7.backend.main.services.prompt.block.tag_dictionary import get_canonical_block_tag_dictionary

    canonical = get_canonical_block_tag_dictionary()
    meta = canonical.get(tag_key) or {}
    allowed = meta.get("allowed_values") or []
    if not isinstance(allowed, list):
        return []
    return [str(v).strip() for v in allowed if v is not None and str(v).strip()]


def _build_block_matrix_drift_report(
    *,
    blocks: List[Any],
    row_key: str,
    col_key: str,
    missing_label: str,
    expected_row_values_csv: Optional[str],
    expected_col_values_csv: Optional[str],
    use_canonical_expected_values: bool,
    expected_tag_keys_csv: Optional[str],
    required_tag_keys_csv: Optional[str],
    max_entries: int,
    max_examples_per_entry: int,
) -> Dict[str, Any]:
    observed_row_values: set[str] = set()
    observed_col_values: set[str] = set()
    row_missing = 0
    col_missing = 0
    dict_axis_values = {"row": 0, "col": 0}

    expected_row_values = _parse_csv_values(expected_row_values_csv)
    expected_col_values = _parse_csv_values(expected_col_values_csv)

    if use_canonical_expected_values and not expected_row_values:
        tag_key = _axis_key_to_tag_key(row_key)
        if tag_key:
            expected_row_values = _canonical_allowed_values_for_tag_key(tag_key)
    if use_canonical_expected_values and not expected_col_values:
        tag_key = _axis_key_to_tag_key(col_key)
        if tag_key:
            expected_col_values = _canonical_allowed_values_for_tag_key(tag_key)

    expected_row_set = set(expected_row_values) if expected_row_values else None
    expected_col_set = set(expected_col_values) if expected_col_values else None

    expected_tag_keys = set(_parse_csv_values(expected_tag_keys_csv)) if expected_tag_keys_csv else None
    required_tag_keys = _parse_csv_values(required_tag_keys_csv)

    unexpected_tag_key_counts: Counter[str] = Counter()
    unexpected_tag_key_examples: Dict[str, List[str]] = {}
    missing_required_counts: Counter[str] = Counter()
    missing_required_examples: Dict[str, List[str]] = {}
    observed_tag_key_counts: Counter[str] = Counter()

    for b in blocks:
        row_value = _resolve_block_matrix_value(b, row_key, missing_label=missing_label)
        col_value = _resolve_block_matrix_value(b, col_key, missing_label=missing_label)

        observed_row_values.add(row_value)
        observed_col_values.add(col_value)

        if row_value == missing_label:
            row_missing += 1
        if col_value == missing_label:
            col_missing += 1
        if row_value == "{...}":
            dict_axis_values["row"] += 1
        if col_value == "{...}":
            dict_axis_values["col"] += 1

        tags = b.tags if isinstance(getattr(b, "tags", None), dict) else {}
        block_id = getattr(b, "block_id", "") or ""

        for k in tags.keys():
            key = str(k)
            observed_tag_key_counts[key] += 1
            if expected_tag_keys is not None and key not in expected_tag_keys:
                unexpected_tag_key_counts[key] += 1
                bucket = unexpected_tag_key_examples.setdefault(key, [])
                if block_id and len(bucket) < max_examples_per_entry:
                    bucket.append(block_id)

        for req_key in required_tag_keys:
            value = tags.get(req_key)
            missing = value is None or value == "" or value == [] or value == {}
            if missing:
                missing_required_counts[req_key] += 1
                bucket = missing_required_examples.setdefault(req_key, [])
                if block_id and len(bucket) < max_examples_per_entry:
                    bucket.append(block_id)

    unexpected_row_values: List[str] = []
    unexpected_col_values: List[str] = []
    if expected_row_set is not None:
        unexpected_row_values = sorted(
            v for v in observed_row_values
            if v not in expected_row_set and v != missing_label
        )
    if expected_col_set is not None:
        unexpected_col_values = sorted(
            v for v in observed_col_values
            if v not in expected_col_set and v != missing_label
        )

    def _top(counter: Counter[str]) -> List[Dict[str, Any]]:
        items = [{"key": k, "count": v} for k, v in counter.most_common(max_entries)]
        return items

    def _top_with_examples(counter: Counter[str], examples: Dict[str, List[str]]) -> List[Dict[str, Any]]:
        items = []
        for k, v in counter.most_common(max_entries):
            items.append({"key": k, "count": v, "examples": examples.get(k, [])})
        return items

    drift: Dict[str, Any] = {
        "row": {
            "row_key": row_key,
            "missing_label": missing_label,
            "missing_count": row_missing,
            "dict_value_count": dict_axis_values["row"],
            "observed_values": sorted(observed_row_values),
            "expected_values": expected_row_values or None,
            "unexpected_values": unexpected_row_values,
        },
        "col": {
            "col_key": col_key,
            "missing_label": missing_label,
            "missing_count": col_missing,
            "dict_value_count": dict_axis_values["col"],
            "observed_values": sorted(observed_col_values),
            "expected_values": expected_col_values or None,
            "unexpected_values": unexpected_col_values,
        },
        "tags": {
            "expected_keys": sorted(expected_tag_keys) if expected_tag_keys is not None else None,
            "required_keys": required_tag_keys or None,
            "observed_keys_top": _top(observed_tag_key_counts),
            "unexpected_keys_top": _top_with_examples(unexpected_tag_key_counts, unexpected_tag_key_examples) if expected_tag_keys is not None else [],
            "missing_required_top": _top_with_examples(missing_required_counts, missing_required_examples) if required_tag_keys else [],
        },
    }
    return drift


def _to_block_response(block: Any) -> BlockResponse:
    return BlockResponse(
        id=block.id,
        block_id=block.block_id,
        role=block.role,
        category=block.category,
        kind=block.kind,
        default_intent=block.default_intent.value if block.default_intent else None,
        text=block.text,
        tags=block.tags or {},
        complexity_level=block.complexity_level,
        package_name=block.package_name,
        description=block.description,
        word_count=block.word_count or 0,
    )


def _iter_scalar_tag_values(value: Any) -> List[str]:
    """Flatten tag values for lightweight dictionary statistics."""
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            if item is None or isinstance(item, (dict, list)):
                continue
            out.append(str(item))
        return out
    if isinstance(value, dict):
        return []
    return [str(value)]


@router.get("/blocks", response_model=List[BlockResponse])
async def search_blocks(
    role: Optional[str] = Query(None, description="Filter by role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
    package_name: Optional[str] = Query(None, description="Filter by package"),
    q: Optional[str] = Query(None, description="Text search in block_id and text"),
    tags: Optional[str] = Query(None, description="Tag filters as comma-separated key:value pairs"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Search prompt blocks with optional filters."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    tag_constraints = _parse_tag_csv(tags)

    query = build_prompt_block_query(
        role=role,
        category=category,
        kind=kind,
        package_name=package_name,
        text_query=q,
        tag_constraints=tag_constraints or None,
    )

    query = query.order_by(PromptBlock.role, PromptBlock.category, PromptBlock.block_id)
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    blocks = result.scalars().all()

    return [_to_block_response(b) for b in blocks]


@router.get("/meta/blocks/catalog", response_model=List[BlockCatalogRowResponse])
async def get_block_catalog(
    role: Optional[str] = Query(None, description="Filter by role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
    package_name: Optional[str] = Query(None, description="Filter by package"),
    q: Optional[str] = Query(None, description="Text search in block_id and text"),
    tags: Optional[str] = Query(None, description="Tag filters as comma-separated key:value pairs"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    preview_chars: int = Query(120, ge=20, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Return normalized block rows for matrix tools / analysis / export."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    query = build_prompt_block_query(
        role=role,
        category=category,
        kind=kind,
        package_name=package_name,
        text_query=q,
        tag_constraints=_parse_tag_csv(tags) or None,
    )
    query = query.order_by(PromptBlock.role, PromptBlock.category, PromptBlock.block_id)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    blocks = result.scalars().all()

    rows: List[BlockCatalogRowResponse] = []
    for b in blocks:
        text = (b.text or "").strip()
        if len(text) > preview_chars:
            text = text[: max(0, preview_chars - 3)].rstrip() + "..."
        rows.append(
            BlockCatalogRowResponse(
                id=b.id,
                block_id=b.block_id,
                role=b.role,
                category=b.category,
                package_name=b.package_name,
                kind=b.kind,
                default_intent=b.default_intent.value if b.default_intent else None,
                tags=b.tags or {},
                word_count=b.word_count or 0,
                text_preview=text,
            )
        )
    return rows


@router.get("/meta/blocks/matrix", response_model=BlockMatrixResponse)
async def get_block_matrix(
    row_key: str = Query(..., description="Matrix row axis key (tag key or top-level field; use tag:<key> for tags)"),
    col_key: str = Query(..., description="Matrix column axis key (tag key or top-level field; use tag:<key> for tags)"),
    role: Optional[str] = Query(None, description="Filter by role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
    package_name: Optional[str] = Query(None, description="Filter by package"),
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
    db: AsyncSession = Depends(get_db),
):
    """Build a block coverage matrix from DB-loaded blocks (AI + UI friendly)."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    query = build_prompt_block_query(
        role=role,
        category=category,
        kind=kind,
        package_name=package_name,
        text_query=q,
        tag_constraints=_parse_tag_csv(tags) or None,
    )
    query = query.order_by(PromptBlock.block_id).limit(limit)
    result = await db.execute(query)
    blocks = result.scalars().all()

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
        expected_values_csv=expected_row_values,
    )
    _extend_axis_values_from_canonical_dictionary(
        col_values,
        col_key,
        include_empty=include_empty,
        expected_values_csv=expected_col_values,
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
        samples = [
            BlockMatrixCellSampleResponse(
                id=b.id,
                block_id=b.block_id,
                package_name=b.package_name,
                role=b.role,
                category=b.category,
            )
            for b in matrix_samples.get((r, c), [])
        ]
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
            "role": role,
            "category": category,
            "kind": kind,
            "package_name": package_name,
            "q": q,
            "tags": _parse_tag_csv(tags) or None,
            "limit": limit,
            "sample_per_cell": sample_per_cell,
            "missing_label": missing_label,
            "drift_report": _build_block_matrix_drift_report(
                blocks=blocks,
                row_key=row_key,
                col_key=col_key,
                missing_label=missing_label,
                expected_row_values_csv=expected_row_values,
                expected_col_values_csv=expected_col_values,
                use_canonical_expected_values=use_canonical_expected_values,
                expected_tag_keys_csv=expected_tag_keys,
                required_tag_keys_csv=required_tag_keys,
                max_entries=drift_max_entries,
                max_examples_per_entry=drift_examples_per_entry,
            )
            if include_drift_report
            else None,
        },
        cells=cells,
    )


@router.get("/blocks/roles", response_model=List[Dict[str, Any]])
async def list_block_roles(
    package_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List distinct role/category combinations with counts."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    query = (
        select(
            PromptBlock.role,
            PromptBlock.category,
            func.count(PromptBlock.id).label("count"),
        )
        .group_by(PromptBlock.role, PromptBlock.category)
        .order_by(PromptBlock.role, PromptBlock.category)
    )
    if package_name:
        query = query.where(PromptBlock.package_name == package_name)

    result = await db.execute(query)
    return [
        {"role": row.role, "category": row.category, "count": row.count}
        for row in result.all()
    ]


@router.get("/blocks/tags", response_model=Dict[str, List[str]])
async def list_block_tag_facets(
    role: Optional[str] = Query(None, description="Filter by role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    package_name: Optional[str] = Query(None, description="Filter by package"),
    db: AsyncSession = Depends(get_db),
):
    """List distinct tag keys and their distinct values from prompt blocks."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    query = select(PromptBlock.tags)
    if role:
        query = query.where(PromptBlock.role == role)
    if category:
        query = query.where(PromptBlock.category == category)
    if package_name:
        query = query.where(PromptBlock.package_name == package_name)

    result = await db.execute(query)
    all_tags = result.scalars().all()

    facets: Dict[str, set] = {}
    for tags_dict in all_tags:
        if not tags_dict or not isinstance(tags_dict, dict):
            continue
        for key, value in tags_dict.items():
            if key not in facets:
                facets[key] = set()
            facets[key].add(str(value))

    return {key: sorted(values) for key, values in sorted(facets.items())}


@router.get("/meta/blocks/tag-dictionary", response_model=BlockTagDictionaryResponse)
async def get_block_tag_dictionary(
    package_name: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    include_values: bool = Query(True),
    include_usage_examples: bool = Query(False),
    include_aliases: bool = Query(True),
    limit_values_per_key: int = Query(50, ge=1, le=500),
    limit_examples_per_key: int = Query(5, ge=0, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Return canonical tag dictionary with scoped DB usage stats (Phase 1)."""
    from pixsim7.backend.main.domain.prompt import PromptBlock

    canonical = get_canonical_block_tag_dictionary()
    alias_key_map = get_block_tag_alias_key_map()
    canonical_keys = set(canonical.keys())
    alias_keys = set(alias_key_map.keys())

    query = select(
        PromptBlock.id,
        PromptBlock.block_id,
        PromptBlock.package_name,
        PromptBlock.role,
        PromptBlock.category,
        PromptBlock.tags,
    )
    if package_name:
        query = query.where(PromptBlock.package_name == package_name)
    if role:
        query = query.where(PromptBlock.role == role)
    if category:
        query = query.where(PromptBlock.category == category)

    result = await db.execute(query)
    rows = result.all()

    key_counts: Dict[str, int] = {}
    value_counts: Dict[str, Dict[str, int]] = {}
    key_examples: Dict[str, List[BlockTagDictionaryExampleResponse]] = {}
    observed_unknown_keys: set[str] = set()
    observed_alias_keys: set[str] = set()

    for row in rows:
        tags = row.tags if isinstance(row.tags, dict) else {}
        if not tags:
            continue
        for tag_key, tag_value in tags.items():
            tag_key = str(tag_key)
            key_counts[tag_key] = key_counts.get(tag_key, 0) + 1
            if tag_key in alias_keys:
                observed_alias_keys.add(tag_key)
            elif tag_key not in canonical_keys:
                observed_unknown_keys.add(tag_key)

            if include_values:
                bucket = value_counts.setdefault(tag_key, {})
                for scalar in _iter_scalar_tag_values(tag_value):
                    bucket[scalar] = bucket.get(scalar, 0) + 1

            if include_usage_examples and limit_examples_per_key > 0:
                ex_bucket = key_examples.setdefault(tag_key, [])
                if len(ex_bucket) < limit_examples_per_key:
                    ex_bucket.append(
                        BlockTagDictionaryExampleResponse(
                            id=row.id,
                            block_id=row.block_id,
                            package_name=row.package_name,
                            role=row.role,
                            category=row.category,
                        )
                    )

    responses: List[BlockTagDictionaryKeyResponse] = []

    # Canonical keys first (even if unused in current scope)
    for key in sorted(canonical.keys()):
        meta = canonical[key]
        aliases = None
        if include_aliases:
            aliases = BlockTagDictionaryAliasesResponse(
                keys=[str(v) for v in (meta.get("aliases") or [])],
                values={str(k): str(v) for k, v in (meta.get("value_aliases") or {}).items()},
            )

        common_values: List[BlockTagDictionaryValueSummaryResponse] = []
        if include_values:
            observed_values = value_counts.get(key, {})
            allowed_values = [str(v) for v in (meta.get("allowed_values") or [])]
            status_map = {v: "canonical" for v in allowed_values}
            # Include observed first by count, then include canonical-only zero-count values.
            for value, count in sorted(observed_values.items(), key=lambda item: (-item[1], item[0]))[:limit_values_per_key]:
                common_values.append(
                    BlockTagDictionaryValueSummaryResponse(
                        value=value,
                        count=count,
                        status=status_map.get(value, "observed"),
                    )
                )
            seen_values = {cv.value for cv in common_values}
            for value in allowed_values:
                if len(common_values) >= limit_values_per_key:
                    break
                if value in seen_values:
                    continue
                common_values.append(
                    BlockTagDictionaryValueSummaryResponse(value=value, count=0, status="canonical")
                )

        responses.append(
            BlockTagDictionaryKeyResponse(
                key=key,
                status=str(meta.get("status") or "active"),
                description=meta.get("description"),
                data_type=str(meta.get("data_type") or "string"),
                observed_count=key_counts.get(key, 0),
                common_values=common_values,
                aliases=aliases,
                examples=key_examples.get(key, []),
            )
        )

    # Include observed non-canonical keys for visibility (helps prevent scattering).
    for key in sorted((set(key_counts.keys()) - canonical_keys)):
        status = "alias_key" if key in alias_keys else "unknown"
        mapped_to = alias_key_map.get(key)
        aliases = None
        if include_aliases and mapped_to:
            aliases = BlockTagDictionaryAliasesResponse(keys=[], values={"$key_alias": mapped_to})
        common_values = []
        if include_values:
            observed_values = value_counts.get(key, {})
            common_values = [
                BlockTagDictionaryValueSummaryResponse(value=v, count=c, status="observed")
                for v, c in sorted(observed_values.items(), key=lambda item: (-item[1], item[0]))[:limit_values_per_key]
            ]
        responses.append(
            BlockTagDictionaryKeyResponse(
                key=key,
                status=status,
                description=f"Observed non-canonical key{f'; alias of {mapped_to}' if mapped_to else ''}.",
                data_type="string",
                observed_count=key_counts.get(key, 0),
                common_values=common_values,
                aliases=aliases,
                examples=key_examples.get(key, []),
            )
        )

    warnings: List[BlockTagDictionaryWarningResponse] = []
    if observed_alias_keys:
        warnings.append(
            BlockTagDictionaryWarningResponse(
                kind="alias_keys_present",
                keys=sorted(observed_alias_keys),
                message="Observed alias keys in scoped blocks; prefer canonical keys for new content.",
            )
        )
    if observed_unknown_keys:
        warnings.append(
            BlockTagDictionaryWarningResponse(
                kind="unknown_keys_present",
                keys=sorted(observed_unknown_keys),
                message="Observed non-canonical keys in scoped blocks.",
            )
        )

    return BlockTagDictionaryResponse(
        generated_at=datetime.utcnow().isoformat() + "Z",
        scope={
            "package_name": package_name,
            "role": role,
            "category": category,
        },
        keys=responses,
        warnings=warnings,
    )


# ===== Content Pack Management =====

@router.get("/meta/content-packs", response_model=List[str])
async def list_content_packs():
    """List discovered content packs (plugins with content/ dirs)."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        discover_content_packs,
    )
    return discover_content_packs()


@router.get("/meta/content-packs/manifests", response_model=List[ContentPackMatrixManifestResponse])
async def list_content_pack_manifests(
    pack: Optional[str] = Query(None, description="Optional pack name filter"),
):
    """List optional content-pack manifest files with Block Matrix query presets."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        CONTENT_PACKS_DIR,
        discover_content_packs,
        parse_manifests,
    )

    packs = [pack] if pack else discover_content_packs()
    manifests: List[ContentPackMatrixManifestResponse] = []
    for pack_name in packs:
        content_dir = CONTENT_PACKS_DIR / pack_name
        if not content_dir.exists() or not content_dir.is_dir():
            continue
        for raw in parse_manifests(content_dir, pack_name=pack_name):
            manifests.append(ContentPackMatrixManifestResponse(**raw))
    return manifests


@router.post("/meta/content-packs/reload")
async def reload_content_packs(
    pack: Optional[str] = Query(None, description="Specific pack to reload (default: all)"),
    force: bool = Query(False, description="Overwrite existing blocks/templates"),
    prune: bool = Query(False, description="Delete rows for this pack missing from YAML"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reload content packs from disk without restarting the server.

    Discovers plugin content/ directories and upserts blocks + templates.
    Default: skip existing. Use force=true to overwrite.
    """
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        discover_content_packs,
        load_pack,
    )

    packs = [pack] if pack else discover_content_packs()
    results = {}

    for pack_name in packs:
        try:
            stats = await load_pack(
                db,
                pack_name,
                force=force,
                prune_missing=prune,
            )
            results[pack_name] = stats
        except FileNotFoundError:
            results[pack_name] = {"error": f"Content pack '{pack_name}' not found"}
        except Exception as e:
            results[pack_name] = {"error": str(e)}

    return {"packs_processed": len(packs), "results": results}
