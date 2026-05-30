"""
Backend runtime GameObject store.

Python port of the TypeScript engine store
(`packages/game/engine/src/runtime/gameObjectStore.ts`). Operates over the
canonical `session.flags["gameObjects"]` shape defined by the shared contract
(`packages/shared/types/src/game.ts`): a `GameObjectStore` of
`{schemaVersion, objects: {<ref>: GameObject}, meta}` keyed by canonical ref
(e.g. "item:flower", "npc:12").

Keys are camelCase to match the frontend-authored JSON shape verbatim
(`gameObjects`, `itemData`, `runtimeKind`, `worldId`, ...).

Scope (backend-canonical-gameobject-adoption, checkpoint 1): the store itself
plus read/list/get/upsert/remove and the TEMPORARY `flags.inventory` mirror.
It is greenfield and not yet wired into InventoryService / narrative ECS — that
is checkpoints 2 and 3. Behaviour intentionally mirrors the TS store so the two
runtimes stay parity-testable.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

GAME_OBJECT_STORE_SCHEMA_VERSION = 1

GameObjectLookup = Union[str, Dict[str, Any]]


# ---------------------------------------------------------------------------
# Low-level coercion helpers (mirror the TS asRecord/toNumber/toStringArray)
# ---------------------------------------------------------------------------

def _as_record(value: Any) -> Optional[Dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _is_finite_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _to_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(float(value)) else None
    if isinstance(value, str):
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        return parsed if math.isfinite(parsed) else None
    return None


def _id_to_ref_string(obj_id: Any) -> str:
    if isinstance(obj_id, str):
        return obj_id.strip()
    if isinstance(obj_id, bool):
        return ""
    if isinstance(obj_id, (int, float)) and math.isfinite(float(obj_id)):
        as_float = float(obj_id)
        return str(int(as_float)) if as_float.is_integer() else str(obj_id)
    return ""


def to_game_object_ref(kind: Any, obj_id: Any) -> str:
    normalized_kind = kind.strip() if isinstance(kind, str) else ""
    normalized_id = _id_to_ref_string(obj_id)
    if not normalized_kind or not normalized_id:
        raise ValueError("Cannot build game object ref without kind and id")
    return f"{normalized_kind}:{normalized_id}"


# ---------------------------------------------------------------------------
# Transform / object normalization
# ---------------------------------------------------------------------------

def _create_fallback_transform(world_id: Any, location_id: Any = None) -> Dict[str, Any]:
    world = _to_number(world_id)
    transform: Dict[str, Any] = {
        "worldId": int(world) if world is not None else 0,
        "position": {"x": 0, "y": 0},
        "space": "world_2d",
    }
    location = _to_number(location_id)
    if location is not None and location >= 0:
        transform["locationId"] = int(location)
    return transform


def _normalize_transform(raw: Any, fallback: Dict[str, Any]) -> Dict[str, Any]:
    record = _as_record(raw)
    position = _as_record(record.get("position")) if record else None
    pos_x = _to_number(position.get("x")) if position else None
    pos_y = _to_number(position.get("y")) if position else None
    world_id = _to_number(record.get("worldId")) if record else None
    if record and position and pos_x is not None and pos_y is not None and world_id is not None:
        normalized: Dict[str, Any] = {**fallback, **record, "worldId": int(world_id)}
        normalized["position"] = {**position, "x": pos_x, "y": pos_y}
        location = _to_number(record.get("locationId"))
        if location is not None and location >= 0:
            normalized["locationId"] = int(location)
        return normalized
    return fallback


def _normalize_capabilities(raw: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(raw, list):
        return None
    result: List[Dict[str, Any]] = []
    for entry in raw:
        record = _as_record(entry)
        cap_id = record.get("id") if record else None
        cap_id = cap_id.strip() if isinstance(cap_id, str) and cap_id.strip() else None
        if not cap_id:
            continue
        result.append({**record, "id": cap_id, "enabled": record.get("enabled") is not False})
    return result


def _normalize_game_object(
    raw: Any, fallback_ref: str, world_id: Any
) -> Optional[Dict[str, Any]]:
    record = _as_record(raw)
    if not record:
        return None
    kind = record.get("kind")
    kind = kind.strip() if isinstance(kind, str) else None
    id_value = record.get("id")
    if not kind:
        return None
    if isinstance(id_value, str):
        normalized_id: Any = id_value.strip()
        if not normalized_id:
            return None
    elif isinstance(id_value, (int, float)) and not isinstance(id_value, bool) and math.isfinite(float(id_value)):
        normalized_id = id_value
    else:
        return None

    ref_raw = record.get("ref")
    ref = ref_raw if isinstance(ref_raw, str) and ref_raw.strip() else to_game_object_ref(kind, normalized_id)
    fallback = _create_fallback_transform(world_id)
    transform = _normalize_transform(record.get("transform"), fallback)
    capabilities = _normalize_capabilities(record.get("capabilities"))

    runtime_kind = record.get("runtimeKind")
    runtime_kind = runtime_kind if isinstance(runtime_kind, str) and runtime_kind.strip() else kind
    name = record.get("name")
    name = name if isinstance(name, str) and name.strip() else fallback_ref

    normalized: Dict[str, Any] = {
        **record,
        "kind": kind,
        "id": normalized_id,
        "ref": ref,
        "runtimeKind": runtime_kind,
        "name": name,
        "transform": transform,
    }
    if capabilities is not None:
        normalized["capabilities"] = capabilities
    else:
        normalized.pop("capabilities", None)
    return normalized


def _normalize_store(raw_store: Any, world_id: Any) -> Optional[Dict[str, Any]]:
    record = _as_record(raw_store)
    objects_record = _as_record(record.get("objects")) if record else None
    if not record or objects_record is None:
        return None

    objects: Dict[str, Any] = {}
    for ref, raw_object in objects_record.items():
        normalized = _normalize_game_object(raw_object, ref, world_id)
        if not normalized:
            continue
        normalized_ref = normalized["ref"] if isinstance(normalized.get("ref"), str) else ref
        objects[normalized_ref] = normalized

    schema_version = _to_number(record.get("schemaVersion"))
    store: Dict[str, Any] = {
        "schemaVersion": int(schema_version) if schema_version is not None else GAME_OBJECT_STORE_SCHEMA_VERSION,
        "objects": objects,
    }
    meta = _as_record(record.get("meta"))
    if meta is not None:
        store["meta"] = meta
    return store


def build_inventory_item_object(
    world_id: Any,
    item_id: str,
    quantity: Any,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a canonical item-kind GameObject (mirror of the TS builder)."""
    obj_id = item_id.strip()
    qty_num = _to_number(quantity)
    qty = max(0, int(qty_num)) if qty_num is not None else 0
    meta = _as_record(metadata) or {}
    name = meta.get("name")
    name = name if isinstance(name, str) and name.strip() else obj_id
    extra_item_data = _as_record(meta.get("itemData")) or {}
    reserved = {"name", "itemData", "id", "itemId", "qty", "quantity"}
    rest_meta = {k: v for k, v in meta.items() if k not in reserved}
    return {
        "kind": "item",
        "id": obj_id,
        "ref": f"item:{obj_id}",
        "name": name,
        "runtimeKind": "item",
        "transform": _create_fallback_transform(world_id),
        "capabilities": [{"id": "inventory_item", "enabled": True}],
        "itemData": {**rest_meta, **extra_item_data, "itemDefId": obj_id, "quantity": qty},
        "meta": {"source": "canonical.inventory"},
    }


# ---------------------------------------------------------------------------
# Public read API
# ---------------------------------------------------------------------------

def get_session_game_object_store(
    session_flags: Dict[str, Any], world_id: Any
) -> Dict[str, Any]:
    flags = _as_record(session_flags) or {}
    canonical = _normalize_store(flags.get("gameObjects"), world_id)
    return canonical or {"schemaVersion": GAME_OBJECT_STORE_SCHEMA_VERSION, "objects": {}}


def _matches_query(
    obj: Dict[str, Any],
    kind: Optional[str],
    capability: Optional[str],
    tags: Optional[List[str]],
    location_id: Optional[int],
) -> bool:
    if kind and obj.get("kind") != kind:
        return False
    if location_id is not None:
        obj_location = _to_number((obj.get("transform") or {}).get("locationId"))
        if obj_location is None or int(obj_location) != location_id:
            return False
    if capability and capability.strip():
        required = capability.strip()
        caps = obj.get("capabilities") or []
        if not any(c.get("id") == required and c.get("enabled") is not False for c in caps):
            return False
    if tags:
        owned = {t.lower() for t in _to_string_array(obj.get("tags"))}
        if not all(t.lower() in owned for t in tags):
            return False
    return True


def list_session_game_objects(
    session_flags: Dict[str, Any],
    world_id: Any,
    *,
    kind: Optional[str] = None,
    capability: Optional[str] = None,
    tags: Optional[List[str]] = None,
    location_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    store = get_session_game_object_store(session_flags, world_id)
    ordered = [store["objects"][ref] for ref in sorted(store["objects"].keys())]
    return [obj for obj in ordered if _matches_query(obj, kind, capability, tags, location_id)]


def get_session_game_object(
    session_flags: Dict[str, Any], world_id: Any, lookup: GameObjectLookup
) -> Optional[Dict[str, Any]]:
    store = get_session_game_object_store(session_flags, world_id)
    if isinstance(lookup, str):
        ref = lookup
    else:
        ref = to_game_object_ref(lookup.get("kind"), lookup.get("id"))
    return store["objects"].get(ref)


# ---------------------------------------------------------------------------
# Public write API (mutates session_flags in place, matching backend services)
# ---------------------------------------------------------------------------

def _write_store_objects(
    session_flags: Dict[str, Any],
    merged_objects: Dict[str, Any],
    base_store: Dict[str, Any],
) -> Dict[str, Any]:
    """Write the merged object set as the canonical store.

    As of the canonical cutover, the legacy ``flags.inventory.items`` mirror is
    no longer maintained — InventoryService and all readers consume canonical
    item GameObjects directly.
    """
    session_flags["gameObjects"] = {
        "schemaVersion": GAME_OBJECT_STORE_SCHEMA_VERSION,
        "objects": merged_objects,
        "meta": {
            **(_as_record(base_store.get("meta")) or {}),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    return session_flags


def upsert_session_game_objects(
    session_flags: Dict[str, Any], world_id: Any, objects: List[Dict[str, Any]]
) -> Dict[str, Any]:
    if not objects:
        return session_flags
    base = get_session_game_object_store(session_flags, world_id)
    merged = dict(base["objects"])
    for obj in objects:
        try:
            fallback_ref = to_game_object_ref(obj.get("kind"), obj.get("id"))
        except ValueError:
            continue
        normalized = _normalize_game_object(obj, fallback_ref, world_id)
        if not normalized:
            continue
        key = normalized["ref"] if isinstance(normalized.get("ref"), str) else fallback_ref
        merged[key] = normalized
    return _write_store_objects(session_flags, merged, base)


def remove_session_game_objects(
    session_flags: Dict[str, Any], world_id: Any, refs: List[str]
) -> Dict[str, Any]:
    if not refs:
        return session_flags
    base = get_session_game_object_store(session_flags, world_id)
    merged = dict(base["objects"])
    changed = False
    for ref in refs:
        if ref in merged:
            del merged[ref]
            changed = True
    if not changed:
        return session_flags
    return _write_store_objects(session_flags, merged, base)


# ---------------------------------------------------------------------------
# NPC component helpers
# ---------------------------------------------------------------------------
#
# Single-component get/set/remove on the canonical npc GameObject. Used by
# ecs_helpers (narrative component) and apply_stat_deltas (stats:<def_id>
# components) so both share one upsert-preserving-other-fields path.


def _npc_ref(npc_id: Any) -> str:
    if isinstance(npc_id, str):
        return npc_id if npc_id.startswith("npc:") else f"npc:{npc_id}"
    return f"npc:{npc_id}"


def get_npc_component(
    session_flags: Dict[str, Any],
    world_id: Any,
    npc_id: Any,
    component_type: str,
) -> Optional[Dict[str, Any]]:
    """Return the single component matching ``component_type`` on the canonical
    npc (with hydration), or ``None`` when absent."""
    obj = get_session_game_object(session_flags, world_id, _npc_ref(npc_id))
    if not obj:
        return None
    for comp in obj.get("components") or []:
        if isinstance(comp, dict) and comp.get("type") == component_type:
            return comp
    return None


def set_npc_component(
    session_flags: Dict[str, Any],
    world_id: Any,
    npc_id: Any,
    component_type: str,
    data: Dict[str, Any],
    enabled: bool = True,
) -> Dict[str, Any]:
    """Upsert a single component onto the canonical npc, preserving all other
    components and hydrated fields (transform, npcData, capabilities, tags, ...).

    Creates a minimal npc object if none exists yet."""
    obj = get_session_game_object(session_flags, world_id, _npc_ref(npc_id))
    current = list(obj.get("components") or []) if obj else []
    components = [c for c in current if c.get("type") != component_type]
    components.append({"type": component_type, "enabled": enabled, "data": dict(data)})
    if obj is None:
        normalized_id = npc_id
        if isinstance(npc_id, str) and npc_id.startswith("npc:"):
            try:
                normalized_id = int(npc_id[4:])
            except (TypeError, ValueError):
                normalized_id = npc_id[4:]
        payload: Dict[str, Any] = {
            "kind": "npc",
            "id": normalized_id,
            "name": f"NPC {normalized_id}",
            "components": components,
        }
    else:
        payload = {**obj, "components": components}
    return upsert_session_game_objects(session_flags, world_id, [payload])


def remove_npc_component(
    session_flags: Dict[str, Any],
    world_id: Any,
    npc_id: Any,
    component_type: str,
) -> Dict[str, Any]:
    """Remove a component from the canonical npc by type (no-op when absent)."""
    obj = get_session_game_object(session_flags, world_id, _npc_ref(npc_id))
    if not obj:
        return session_flags
    current = obj.get("components") or []
    if not any(c.get("type") == component_type for c in current):
        return session_flags
    payload = {**obj, "components": [c for c in current if c.get("type") != component_type]}
    return upsert_session_game_objects(session_flags, world_id, [payload])


# ---------------------------------------------------------------------------
# Convenience accessors (item / npc / component)
# ---------------------------------------------------------------------------

def item_quantity(obj: Dict[str, Any]) -> int:
    if obj.get("kind") != "item":
        return 0
    item_data = _as_record(obj.get("itemData")) or {}
    quantity = _to_number(item_data.get("quantity"))
    return max(0, int(quantity)) if quantity is not None else 0


def get_component(obj: Dict[str, Any], component_type: str) -> Optional[Dict[str, Any]]:
    required = component_type.strip() if isinstance(component_type, str) else ""
    if not required:
        return None
    for comp in obj.get("components") or []:
        if isinstance(comp, dict) and comp.get("type") == required:
            return comp
    return None


def has_capability(obj: Dict[str, Any], capability_id: str) -> bool:
    required = capability_id.strip() if isinstance(capability_id, str) else ""
    if not required:
        return False
    for cap in obj.get("capabilities") or []:
        if isinstance(cap, dict) and cap.get("id") == required and cap.get("enabled") is not False:
            return True
    return False
