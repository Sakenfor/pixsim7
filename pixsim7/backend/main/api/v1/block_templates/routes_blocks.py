"""Block search, upsert, delete, catalog, roles, tags, and tag dictionary endpoints."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import get_current_user
from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
)
from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)
from pixsim7.backend.main.services.prompt.block.block_id_policy import (
    is_namespaced_block_id,
    namespaced_block_id_error,
)
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.capabilities import (
    derive_block_capabilities,
    normalize_capability_ids,
)
from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
    get_canonical_block_tag_dictionary,
    get_block_tag_alias_key_map,
)
from pixsim7.backend.main.services.prompt.block.vocabulary_governance import (
    VocabularyGovernanceService,
)
from pixsim7.backend.main.services.crud.primitives import DeleteResponse
from .schemas import (
    BlockResponse,
    UpsertPrimitiveBlockRequest,
    UpsertPrimitiveBlockResponse,
    BlockCatalogRowResponse,
    BlockTagDictionaryResponse,
    BlockTagDictionaryKeyResponse,
    BlockTagDictionaryValueSummaryResponse,
    BlockTagDictionaryAliasesResponse,
    BlockTagDictionaryExampleResponse,
    BlockTagDictionaryWarningResponse,
)
from .helpers_roles import (
    _parse_tag_csv,
    _to_block_response,
    _iter_scalar_tag_values,
)
from .router import router


def _is_admin_user(user: Any) -> bool:
    if user is None:
        return False
    admin_attr = getattr(user, "is_admin", None)
    if callable(admin_attr):
        return bool(admin_attr())
    return bool(admin_attr)


def _extract_tag_owner_user_id(tags: Any) -> Optional[int]:
    if not isinstance(tags, dict):
        return None
    raw = tags.get("owner_user_id")
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _assert_can_write_primitive_block(*, block: Any, current_user: User) -> None:
    if _is_admin_user(current_user):
        return
    owner_user_id = _extract_tag_owner_user_id(getattr(block, "tags", None))
    if owner_user_id is None:
        raise HTTPException(status_code=403, detail="Not allowed to modify system-owned block")
    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=owner_user_id,
        denied_detail="Not allowed to modify this block",
    )


@router.get("/blocks", response_model=List[BlockResponse])
async def search_blocks(
    role: Optional[str] = Query(None, description="Filter by inferred role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Filter by kind (primitives are single_state)"),
    package_name: Optional[str] = Query(None, description="Filter by package via tags.source_pack"),
    q: Optional[str] = Query(None, description="Text search in block_id and text"),
    tags: Optional[str] = Query(None, description="Tag filters as comma-separated key:value pairs"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    """Search primitive blocks with optional filters."""
    if kind and str(kind).strip() and str(kind).strip() != "single_state":
        return []

    tag_constraints = _parse_tag_csv(tags) or None
    if package_name:
        merged = dict(tag_constraints or {})
        merged.setdefault("source_pack", package_name)
        tag_constraints = merged
    role_filter = role.strip() if isinstance(role, str) and role.strip() else None

    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    query = build_block_primitive_query(
        category=category,
        composition_role=role_filter,
        tag_query=tag_constraints,
        text_query=q,
    )
    query = query.order_by(BlockPrimitive.category, BlockPrimitive.block_id)
    query = query.offset(offset).limit(limit)

    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    return [_to_block_response(b) for b in blocks]


@router.put("/blocks/by-block-id/{block_id}", response_model=UpsertPrimitiveBlockResponse)
async def upsert_block_by_block_id(
    block_id: str,
    request: UpsertPrimitiveBlockRequest,
    response: Response = None,
    create_if_missing: bool = Query(
        True,
        description="Create block when missing; otherwise return 404 for unknown block_id.",
    ),
    current_user: User = Depends(get_current_user),
):
    """Create or update a primitive block by block_id.

    This endpoint writes to the separate block primitives database.
    """
    normalized_block_id = str(block_id or "").strip()
    if not normalized_block_id:
        raise HTTPException(status_code=400, detail="block_id_required")

    category = str(request.category or "").strip()
    text = str(request.text or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="category_required")
    if not text:
        raise HTTPException(status_code=400, detail="text_required")

    user_is_admin = _is_admin_user(current_user)
    if not user_is_admin and request.is_public:
        raise HTTPException(
            status_code=403,
            detail="Non-admin users can only create private blocks",
        )

    tags_dict = dict(request.tags or {})
    requested_block_metadata = request.block_metadata
    block_metadata_dict = (
        dict(requested_block_metadata)
        if isinstance(requested_block_metadata, dict)
        else None
    )
    if not user_is_admin:
        if current_user.id is None:
            raise HTTPException(status_code=403, detail="User identity required")
        tags_dict["owner_user_id"] = int(current_user.id)
    inferred_role = infer_composition_role(role=None, category=category, tags=tags_dict).role_id
    if inferred_role:
        existing = tags_dict.get("composition_role")
        if not (isinstance(existing, str) and existing.strip()):
            tags_dict["composition_role"] = inferred_role

    declared_capabilities = normalize_capability_ids(request.capabilities)
    capabilities = derive_block_capabilities(
        category=category,
        tags=tags_dict,
        declared=declared_capabilities,
    )
    now = datetime.now(timezone.utc)

    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(
            select(BlockPrimitive).where(BlockPrimitive.block_id == normalized_block_id)
        )
        block = result.scalars().first()
        if block is None:
            if not create_if_missing:
                raise HTTPException(status_code=404, detail="block_not_found")
            if not is_namespaced_block_id(normalized_block_id):
                raise HTTPException(
                    status_code=400,
                    detail=namespaced_block_id_error(normalized_block_id),
                )

            block = BlockPrimitive(
                block_id=normalized_block_id,
                category=category,
                text=text,
                tags=tags_dict,
                block_metadata=(block_metadata_dict if block_metadata_dict is not None else {}),
                capabilities=capabilities,
                source=request.source,
                is_public=(request.is_public if user_is_admin else False),
                avg_rating=request.avg_rating,
                usage_count=request.usage_count or 0,
                created_at=now,
                updated_at=now,
            )
            blocks_db.add(block)
            await blocks_db.commit()
            await blocks_db.refresh(block)
            if response is not None:
                response.status_code = 201
            return UpsertPrimitiveBlockResponse(
                status="created",
                block=_to_block_response(block),
            )

        _assert_can_write_primitive_block(block=block, current_user=current_user)
        block.category = category
        block.text = text
        block.tags = tags_dict
        if block_metadata_dict is not None:
            block.block_metadata = block_metadata_dict
        block.capabilities = capabilities
        block.source = request.source
        block.is_public = (request.is_public if user_is_admin else False)
        if request.avg_rating is not None:
            block.avg_rating = request.avg_rating
        if request.usage_count is not None:
            block.usage_count = request.usage_count
        block.updated_at = now
        blocks_db.add(block)
        await blocks_db.commit()
        await blocks_db.refresh(block)
        return UpsertPrimitiveBlockResponse(
            status="updated",
            block=_to_block_response(block),
        )


@router.delete("/blocks/by-block-id/{block_id}", response_model=DeleteResponse)
async def delete_block_by_block_id(
    block_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a primitive block by block_id."""
    normalized_block_id = str(block_id or "").strip()
    if not normalized_block_id:
        raise HTTPException(status_code=400, detail="block_id_required")

    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(
            select(BlockPrimitive).where(BlockPrimitive.block_id == normalized_block_id)
        )
        block = result.scalars().first()
        if block is None:
            raise HTTPException(status_code=404, detail="block_not_found")
        _assert_can_write_primitive_block(block=block, current_user=current_user)
        await blocks_db.delete(block)
        await blocks_db.commit()

    return DeleteResponse(success=True, message=f"Block '{normalized_block_id}' deleted.")


@router.get("/meta/blocks/catalog", response_model=List[BlockCatalogRowResponse])
async def get_block_catalog(
    role: Optional[str] = Query(None, description="Filter by inferred role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    kind: Optional[str] = Query(None, description="Filter by kind (primitives are single_state)"),
    package_name: Optional[str] = Query(None, description="Filter by package via tags.source_pack"),
    q: Optional[str] = Query(None, description="Text search in block_id and text"),
    tags: Optional[str] = Query(None, description="Tag filters as comma-separated key:value pairs"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    preview_chars: int = Query(120, ge=20, le=500),
):
    """Return normalized block rows for matrix tools / analysis / export."""
    if kind and str(kind).strip() and str(kind).strip() != "single_state":
        return []

    tag_constraints = _parse_tag_csv(tags) or None
    if package_name:
        merged = dict(tag_constraints or {})
        merged.setdefault("source_pack", package_name)
        tag_constraints = merged
    role_filter = role.strip() if isinstance(role, str) and role.strip() else None

    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    query = build_block_primitive_query(
        category=category,
        composition_role=role_filter,
        text_query=q,
        tag_query=tag_constraints,
    )
    query = query.order_by(BlockPrimitive.category, BlockPrimitive.block_id)
    query = query.offset(offset).limit(limit)
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    rows: List[BlockCatalogRowResponse] = []
    for b in blocks:
        full_text = (str(getattr(b, "text", "") or "")).strip()
        text = full_text
        if len(full_text) > preview_chars:
            text = full_text[: max(0, preview_chars - 3)].rstrip() + "..."
        tags_map = b.tags if isinstance(getattr(b, "tags", None), dict) else {}
        inferred = infer_composition_role(
            role=None,
            category=getattr(b, "category", None),
            tags=tags_map,
        )
        source_pack = tags_map.get("source_pack") if isinstance(tags_map, dict) else None
        package = str(source_pack).strip() if isinstance(source_pack, str) and source_pack.strip() else None
        rows.append(
            BlockCatalogRowResponse(
                id=b.id,
                block_id=b.block_id,
                composition_role=inferred.role_id,
                category=getattr(b, "category", None),
                package_name=package,
                kind="single_state",
                default_intent=None,
                tags=tags_map,
                capabilities=normalize_capability_ids(getattr(b, "capabilities", None)),
                word_count=len([token for token in full_text.split() if token]),
                text_preview=text,
            )
        )
    return rows


@router.get("/blocks/roles", response_model=List[Dict[str, Any]])
async def list_block_roles(
    package_name: Optional[str] = Query(None),
):
    """List inferred role/category combinations with counts from primitives."""
    tag_query = {"all": {"source_pack": package_name}} if package_name else None
    query = build_block_primitive_query(category=None, tag_query=tag_query)
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    counts: Dict[tuple[Optional[str], Optional[str]], int] = {}
    for block in blocks:
        tags_map = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
        inferred = infer_composition_role(
            role=None,
            category=getattr(block, "category", None),
            tags=tags_map,
        )
        key = (inferred.role_id, getattr(block, "category", None))
        counts[key] = counts.get(key, 0) + 1

    rows = [
        {"composition_role": role, "category": category, "count": count}
        for (role, category), count in counts.items()
    ]
    rows.sort(key=lambda row: (str(row["composition_role"] or ""), str(row["category"] or "")))
    return rows


@router.get("/blocks/tags", response_model=Dict[str, List[str]])
async def list_block_tag_facets(
    role: Optional[str] = Query(None, description="Filter by inferred role"),
    category: Optional[str] = Query(None, description="Filter by category"),
    package_name: Optional[str] = Query(None, description="Filter by package via tags.source_pack"),
):
    """List distinct tag keys and values from primitive blocks."""
    role_filter = role.strip() if isinstance(role, str) and role.strip() else None
    tag_query = {"all": {"source_pack": package_name}} if package_name else None
    query = build_block_primitive_query(
        composition_role=role_filter,
        category=category,
        tag_query=tag_query,
    )
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    all_tags: List[Dict[str, Any]] = []
    for block in blocks:
        tags_map = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
        if not tags_map:
            continue
        all_tags.append(tags_map)

    facets: Dict[str, set[str]] = {}
    for tags_dict in all_tags:
        for key, value in tags_dict.items():
            bucket = facets.setdefault(str(key), set())
            for scalar in _iter_scalar_tag_values(value):
                bucket.add(str(scalar))

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
):
    """Return canonical tag dictionary with scoped primitive usage stats."""

    canonical = get_canonical_block_tag_dictionary()
    alias_key_map = get_block_tag_alias_key_map()
    canonical_keys = set(canonical.keys())
    alias_keys = set(alias_key_map.keys())

    role_filter = role.strip() if isinstance(role, str) and role.strip() else None
    tag_query = {"all": {"source_pack": package_name}} if package_name else None
    query = build_block_primitive_query(
        composition_role=role_filter,
        category=category,
        tag_query=tag_query,
    )
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        blocks = list(result.scalars().all())

    key_counts: Dict[str, int] = {}
    value_counts: Dict[str, Dict[str, int]] = {}
    key_examples: Dict[str, List[BlockTagDictionaryExampleResponse]] = {}
    observed_unknown_keys: set[str] = set()
    observed_alias_keys: set[str] = set()

    for block in blocks:
        tags_map = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
        if not tags_map:
            continue
        inferred = infer_composition_role(
            role=None,
            category=getattr(block, "category", None),
            tags=tags_map,
        )
        source_pack = tags_map.get("source_pack") if isinstance(tags_map, dict) else None
        package = str(source_pack).strip() if isinstance(source_pack, str) and source_pack.strip() else None

        for tag_key, tag_value in tags_map.items():
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
                            id=block.id,
                            block_id=block.block_id,
                            package_name=package,
                            role=inferred.role_id,
                            category=getattr(block, "category", None),
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
        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        scope={
            "package_name": package_name,
            "composition_role": role,
            "category": category,
        },
        keys=responses,
        warnings=warnings,
    )


@router.post("/meta/vocabulary/validate")
async def validate_vocabulary(
    request_body: Dict[str, Any],
):
    """Validate tags and ontology IDs against canonical vocabulary."""
    service = VocabularyGovernanceService()
    tags = request_body.get("tags") or {}
    ontology_ids = request_body.get("ontology_ids") or []

    tag_result = service.validate_tags(tags) if tags else None
    ontology_result = service.validate_ontology_ids(ontology_ids) if ontology_ids else None

    combined_valid = True
    combined_entries = []
    combined_warnings = []
    combined_errors = []

    if tag_result:
        combined_valid = combined_valid and tag_result.valid
        combined_entries.extend([e.model_dump() for e in tag_result.entries])
        combined_warnings.extend(tag_result.warnings)
        combined_errors.extend(tag_result.errors)

    if ontology_result:
        combined_valid = combined_valid and ontology_result.valid
        combined_entries.extend([e.model_dump() for e in ontology_result.entries])
        combined_warnings.extend(ontology_result.warnings)
        combined_errors.extend(ontology_result.errors)

    return {
        "valid": combined_valid,
        "entries": combined_entries,
        "warnings": combined_warnings,
        "errors": combined_errors,
    }


@router.get("/meta/vocabulary/suggest")
async def suggest_vocabulary(
    q: str = Query("", description="Partial tag key to suggest completions for"),
    context: Optional[str] = Query(None, description="Optional context JSON"),
):
    """Suggest canonical tags based on partial input."""
    import json as _json

    service = VocabularyGovernanceService()
    ctx = None
    if context:
        try:
            ctx = _json.loads(context)
        except (ValueError, TypeError):
            ctx = None

    suggestions = service.suggest_tags(q, context=ctx)
    return {
        "query": q,
        "suggestions": [s.model_dump() for s in suggestions],
    }
