from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import CurrentGamePrincipal, DatabaseSession
from pixsim7.backend.main.domain.game import GameItem
from pixsim7.backend.main.shared.schemas.api_base import ApiModel


router = APIRouter()

GAME_OBJECT_META_KEY = "_game_object"
GAME_OBJECT_KIND_META_KEY = "object_kind"
GAME_OBJECT_TEMPLATE_BINDING_META_KEY = "template_binding"
GAME_OBJECT_CAPABILITIES_META_KEY = "capabilities"
GAME_OBJECT_COMPONENTS_META_KEY = "components"
GAME_OBJECT_TAGS_META_KEY = "tags"
GAME_OBJECT_KIND_DATA_META_KEY = "kind_data"


class GameObjectTemplateBinding(ApiModel):
    template_kind: str
    template_id: str
    runtime_kind: Optional[str] = None
    link_id: Optional[str] = None
    mapping_id: Optional[str] = None


class GameObjectCapabilitySchema(ApiModel):
    id: str
    enabled: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)


class GameObjectComponentSchema(ApiModel):
    type: str
    enabled: bool = True
    data: Dict[str, Any] = Field(default_factory=dict)


class GameObjectSummary(ApiModel):
    id: int
    world_id: Optional[int] = None
    name: str
    object_kind: str = "generic"
    template_binding: Optional[GameObjectTemplateBinding] = None
    tags: List[str] = Field(default_factory=list)


class GameObjectDetail(GameObjectSummary):
    description: Optional[str] = None
    capabilities: List[GameObjectCapabilitySchema] = Field(default_factory=list)
    components: List[GameObjectComponentSchema] = Field(default_factory=list)
    kind_data: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)
    stats: Dict[str, Any] = Field(default_factory=dict)
    stats_metadata: Dict[str, Any] = Field(default_factory=dict)


class CreateGameObjectPayload(ApiModel):
    world_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    object_kind: str = "generic"
    template_binding: Optional[GameObjectTemplateBinding] = None
    capabilities: List[GameObjectCapabilitySchema] = Field(default_factory=list)
    components: List[GameObjectComponentSchema] = Field(default_factory=list)
    kind_data: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    stats: Dict[str, Any] = Field(default_factory=dict)
    stats_metadata: Dict[str, Any] = Field(default_factory=dict)


class PutGameObjectPayload(ApiModel):
    world_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    object_kind: str = "generic"
    template_binding: Optional[GameObjectTemplateBinding] = None
    capabilities: List[GameObjectCapabilitySchema] = Field(default_factory=list)
    components: List[GameObjectComponentSchema] = Field(default_factory=list)
    kind_data: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    stats: Dict[str, Any] = Field(default_factory=dict)
    stats_metadata: Dict[str, Any] = Field(default_factory=dict)


class PatchGameObjectPayload(ApiModel):
    name: Optional[str] = None
    description: Optional[str] = None
    object_kind: Optional[str] = None
    template_binding: Optional[GameObjectTemplateBinding] = None
    capabilities: Optional[List[GameObjectCapabilitySchema]] = None
    components: Optional[List[GameObjectComponentSchema]] = None
    kind_data: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    stats_metadata: Optional[Dict[str, Any]] = None


class PatchGameObjectBindingPayload(ApiModel):
    template_kind: Optional[str] = None
    template_id: Optional[str] = None
    runtime_kind: Optional[str] = None
    link_id: Optional[str] = None
    mapping_id: Optional[str] = None


def _normalize_object_kind(value: Optional[Any]) -> str:
    normalized = str(value or "").strip()
    return normalized or "generic"


def _normalize_template_binding(
    binding: Optional[GameObjectTemplateBinding],
) -> Optional[GameObjectTemplateBinding]:
    if binding is None:
        return None

    template_kind = str(binding.template_kind or "").strip()
    template_id = str(binding.template_id or "").strip()
    link_id_raw = binding.link_id
    link_id = str(link_id_raw).strip() if link_id_raw is not None else None
    if link_id == "":
        link_id = None
    runtime_kind_raw = binding.runtime_kind
    runtime_kind = str(runtime_kind_raw).strip() if runtime_kind_raw is not None else None
    if runtime_kind == "":
        runtime_kind = None
    mapping_id_raw = binding.mapping_id
    mapping_id = str(mapping_id_raw).strip() if mapping_id_raw is not None else None
    if mapping_id == "":
        mapping_id = None

    if not template_kind or not template_id:
        raise HTTPException(
            status_code=400,
            detail="template_binding requires non-empty template_kind and template_id",
        )
    return GameObjectTemplateBinding(
        template_kind=template_kind,
        template_id=template_id,
        runtime_kind=runtime_kind,
        link_id=link_id,
        mapping_id=mapping_id,
    )


def _read_object_meta_section(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(meta, dict):
        return {}
    raw = meta.get(GAME_OBJECT_META_KEY)
    if isinstance(raw, dict):
        return dict(raw)
    return {}


def _merge_object_meta(
    *,
    meta: Optional[Dict[str, Any]],
    object_kind: str,
    template_binding: Optional[GameObjectTemplateBinding],
    capabilities: Optional[List[GameObjectCapabilitySchema]] = None,
    components: Optional[List[GameObjectComponentSchema]] = None,
    tags: Optional[List[str]] = None,
    kind_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    canonical_meta = dict(meta) if isinstance(meta, dict) else {}
    object_meta = _read_object_meta_section(canonical_meta)

    object_meta[GAME_OBJECT_KIND_META_KEY] = object_kind
    if template_binding is None:
        object_meta.pop(GAME_OBJECT_TEMPLATE_BINDING_META_KEY, None)
    else:
        object_meta[GAME_OBJECT_TEMPLATE_BINDING_META_KEY] = template_binding.model_dump(by_alias=False)

    if capabilities is not None:
        object_meta[GAME_OBJECT_CAPABILITIES_META_KEY] = [
            c.model_dump(by_alias=False) for c in capabilities
        ]
    if components is not None:
        object_meta[GAME_OBJECT_COMPONENTS_META_KEY] = [
            c.model_dump(by_alias=False) for c in components
        ]
    if tags is not None:
        object_meta[GAME_OBJECT_TAGS_META_KEY] = list(tags)
    if kind_data is not None:
        object_meta[GAME_OBJECT_KIND_DATA_META_KEY] = dict(kind_data)

    canonical_meta[GAME_OBJECT_META_KEY] = object_meta
    return canonical_meta


def _extract_template_binding(meta: Optional[Dict[str, Any]]) -> Optional[GameObjectTemplateBinding]:
    object_meta = _read_object_meta_section(meta)
    raw_binding = object_meta.get(GAME_OBJECT_TEMPLATE_BINDING_META_KEY)
    if not isinstance(raw_binding, dict):
        return None

    template_kind = str(
        raw_binding.get("template_kind") or raw_binding.get("templateKind") or ""
    ).strip()
    template_id = str(
        raw_binding.get("template_id") or raw_binding.get("templateId") or ""
    ).strip()
    if not template_kind or not template_id:
        return None

    link_id_raw = raw_binding.get("link_id") or raw_binding.get("linkId")
    link_id = str(link_id_raw).strip() if link_id_raw is not None else None
    if link_id == "":
        link_id = None

    runtime_kind_raw = raw_binding.get("runtime_kind") or raw_binding.get("runtimeKind")
    runtime_kind = str(runtime_kind_raw).strip() if runtime_kind_raw is not None else None
    if runtime_kind == "":
        runtime_kind = None

    mapping_id_raw = raw_binding.get("mapping_id") or raw_binding.get("mappingId")
    mapping_id = str(mapping_id_raw).strip() if mapping_id_raw is not None else None
    if mapping_id == "":
        mapping_id = None

    return GameObjectTemplateBinding(
        template_kind=template_kind,
        template_id=template_id,
        runtime_kind=runtime_kind,
        link_id=link_id,
        mapping_id=mapping_id,
    )


def _extract_capabilities(meta: Optional[Dict[str, Any]]) -> List[GameObjectCapabilitySchema]:
    object_meta = _read_object_meta_section(meta)
    raw = object_meta.get(GAME_OBJECT_CAPABILITIES_META_KEY)
    if not isinstance(raw, list):
        return []
    result: List[GameObjectCapabilitySchema] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        result.append(GameObjectCapabilitySchema(
            id=str(item["id"]),
            enabled=bool(item.get("enabled", True)),
            config=item.get("config") if isinstance(item.get("config"), dict) else {},
        ))
    return result


def _extract_components(meta: Optional[Dict[str, Any]]) -> List[GameObjectComponentSchema]:
    object_meta = _read_object_meta_section(meta)
    raw = object_meta.get(GAME_OBJECT_COMPONENTS_META_KEY)
    if not isinstance(raw, list):
        return []
    result: List[GameObjectComponentSchema] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("type"):
            continue
        result.append(GameObjectComponentSchema(
            type=str(item["type"]),
            enabled=bool(item.get("enabled", True)),
            data=item.get("data") if isinstance(item.get("data"), dict) else {},
        ))
    return result


def _extract_tags(meta: Optional[Dict[str, Any]]) -> List[str]:
    object_meta = _read_object_meta_section(meta)
    raw = object_meta.get(GAME_OBJECT_TAGS_META_KEY)
    if not isinstance(raw, list):
        return []
    return [str(t) for t in raw if t]


def _extract_kind_data(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    object_meta = _read_object_meta_section(meta)
    raw = object_meta.get(GAME_OBJECT_KIND_DATA_META_KEY)
    if not isinstance(raw, dict):
        return {}
    return dict(raw)


def _serialize_object_summary(obj: GameItem) -> GameObjectSummary:
    meta = obj.meta if isinstance(obj.meta, dict) else {}
    object_meta = _read_object_meta_section(meta)
    object_kind = _normalize_object_kind(object_meta.get(GAME_OBJECT_KIND_META_KEY))
    template_binding = _extract_template_binding(meta)
    tags = _extract_tags(meta)
    return GameObjectSummary(
        id=int(obj.id),
        world_id=obj.world_id,
        name=str(obj.name),
        object_kind=object_kind,
        template_binding=template_binding,
        tags=tags,
    )


def _serialize_object_detail(obj: GameItem) -> GameObjectDetail:
    meta = obj.meta if isinstance(obj.meta, dict) else {}
    summary = _serialize_object_summary(obj)
    return GameObjectDetail(
        id=summary.id,
        world_id=summary.world_id,
        name=summary.name,
        object_kind=summary.object_kind,
        template_binding=summary.template_binding,
        tags=summary.tags,
        description=obj.description,
        capabilities=_extract_capabilities(meta),
        components=_extract_components(meta),
        kind_data=_extract_kind_data(meta),
        meta=meta,
        stats=getattr(obj, "stats", {}) or {},
        stats_metadata=getattr(obj, "stats_metadata", {}) or {},
    )


async def _load_object_or_404(
    db: DatabaseSession,
    object_id: int,
    *,
    world_id: Optional[int] = None,
) -> GameItem:
    obj = await db.get(GameItem, object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    if world_id is not None and obj.world_id is not None and int(obj.world_id) != int(world_id):
        raise HTTPException(status_code=404, detail="Object not found")
    return obj


@router.get("/", response_model=List[GameObjectSummary])
async def list_objects(
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> List[GameObjectSummary]:
    stmt = select(GameItem).order_by(GameItem.id)
    if world_id is not None:
        stmt = stmt.where(GameItem.world_id == world_id)
    rows = await db.execute(stmt)
    objects = list(rows.scalars().all())
    return [_serialize_object_summary(obj) for obj in objects]


@router.get("/{object_id}", response_model=GameObjectDetail)
async def get_object(
    object_id: int,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    obj = await _load_object_or_404(db, object_id, world_id=world_id)
    return _serialize_object_detail(obj)


@router.post("/", response_model=GameObjectDetail, status_code=201)
async def create_object(
    payload: CreateGameObjectPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    effective_world_id = world_id if world_id is not None else payload.world_id
    object_kind = _normalize_object_kind(payload.object_kind)
    template_binding = _normalize_template_binding(payload.template_binding)
    meta = _merge_object_meta(
        meta=payload.meta,
        object_kind=object_kind,
        template_binding=template_binding,
        capabilities=payload.capabilities or None,
        components=payload.components or None,
        tags=payload.tags or None,
        kind_data=payload.kind_data or None,
    )

    obj = GameItem(
        world_id=effective_world_id,
        name=payload.name,
        description=payload.description,
        meta=meta,
        stats=payload.stats or {},
        stats_metadata=payload.stats_metadata or {},
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_object_detail(obj)


@router.put("/{object_id}", response_model=GameObjectDetail)
async def put_object(
    object_id: int,
    payload: PutGameObjectPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    obj = await _load_object_or_404(db, object_id, world_id=None)

    effective_world_id = world_id if world_id is not None else payload.world_id
    object_kind = _normalize_object_kind(payload.object_kind)
    template_binding = _normalize_template_binding(payload.template_binding)

    obj.name = payload.name
    obj.description = payload.description
    obj.meta = _merge_object_meta(
        meta=payload.meta,
        object_kind=object_kind,
        template_binding=template_binding,
        capabilities=payload.capabilities or None,
        components=payload.components or None,
        tags=payload.tags or None,
        kind_data=payload.kind_data or None,
    )
    obj.stats = payload.stats or {}
    obj.stats_metadata = payload.stats_metadata or {}
    if effective_world_id is not None:
        obj.world_id = int(effective_world_id)

    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_object_detail(obj)


@router.patch("/{object_id}", response_model=GameObjectDetail)
async def patch_object(
    object_id: int,
    payload: PatchGameObjectPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    obj = await _load_object_or_404(db, object_id, world_id=world_id)

    existing_meta = obj.meta if isinstance(obj.meta, dict) else {}
    existing_object_meta = _read_object_meta_section(existing_meta)

    if payload.name is not None:
        obj.name = payload.name
    if payload.description is not None:
        obj.description = payload.description

    object_kind = (
        _normalize_object_kind(payload.object_kind)
        if payload.object_kind is not None
        else _normalize_object_kind(existing_object_meta.get(GAME_OBJECT_KIND_META_KEY))
    )

    if payload.template_binding is not None:
        template_binding = _normalize_template_binding(payload.template_binding)
    else:
        template_binding = _extract_template_binding(existing_meta)

    merged_user_meta = dict(existing_meta)
    if payload.meta is not None:
        for k, v in payload.meta.items():
            if k != GAME_OBJECT_META_KEY:
                merged_user_meta[k] = v

    obj.meta = _merge_object_meta(
        meta=merged_user_meta,
        object_kind=object_kind,
        template_binding=template_binding,
        capabilities=payload.capabilities,
        components=payload.components,
        tags=payload.tags,
        kind_data=payload.kind_data,
    )

    if payload.stats is not None:
        obj.stats = payload.stats
    if payload.stats_metadata is not None:
        obj.stats_metadata = payload.stats_metadata

    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_object_detail(obj)


@router.patch("/{object_id}/binding", response_model=GameObjectDetail)
async def patch_object_binding(
    object_id: int,
    payload: PatchGameObjectBindingPayload,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    obj = await _load_object_or_404(db, object_id, world_id=world_id)

    existing_meta = obj.meta if isinstance(obj.meta, dict) else {}
    existing_binding = _extract_template_binding(existing_meta)

    template_kind = (
        str(payload.template_kind).strip()
        if payload.template_kind is not None
        else (existing_binding.template_kind if existing_binding else "")
    )
    template_id = (
        str(payload.template_id).strip()
        if payload.template_id is not None
        else (existing_binding.template_id if existing_binding else "")
    )

    if not template_kind or not template_id:
        raise HTTPException(
            status_code=400,
            detail="Binding requires non-empty template_kind and template_id (provide them or ensure they exist).",
        )

    def _resolve_optional(new_val: Optional[str], old_val: Optional[str]) -> Optional[str]:
        if new_val is not None:
            stripped = str(new_val).strip()
            return stripped or None
        return old_val

    merged_binding = GameObjectTemplateBinding(
        template_kind=template_kind,
        template_id=template_id,
        runtime_kind=_resolve_optional(payload.runtime_kind, existing_binding.runtime_kind if existing_binding else None),
        link_id=_resolve_optional(payload.link_id, existing_binding.link_id if existing_binding else None),
        mapping_id=_resolve_optional(payload.mapping_id, existing_binding.mapping_id if existing_binding else None),
    )

    existing_object_meta = _read_object_meta_section(existing_meta)
    object_kind = _normalize_object_kind(existing_object_meta.get(GAME_OBJECT_KIND_META_KEY))

    obj.meta = _merge_object_meta(
        meta=existing_meta,
        object_kind=object_kind,
        template_binding=merged_binding,
    )

    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_object_detail(obj)


@router.delete("/{object_id}/binding", response_model=GameObjectDetail)
async def delete_object_binding(
    object_id: int,
    db: DatabaseSession,
    user: CurrentGamePrincipal,
    world_id: Optional[int] = None,
) -> GameObjectDetail:
    obj = await _load_object_or_404(db, object_id, world_id=world_id)

    existing_meta = obj.meta if isinstance(obj.meta, dict) else {}
    existing_object_meta = _read_object_meta_section(existing_meta)
    object_kind = _normalize_object_kind(existing_object_meta.get(GAME_OBJECT_KIND_META_KEY))

    obj.meta = _merge_object_meta(
        meta=existing_meta,
        object_kind=object_kind,
        template_binding=None,
    )

    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_object_detail(obj)
