from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from ..seed_data import (
    BOOTSTRAP_PROFILE,
    BOOTSTRAP_SOURCE_KEY,
    LOCATION_SEEDS,
    NPC_BEHAVIOR_BINDINGS,
    NPC_SEEDS,
    REGISTERED_SOURCE_PACKS,
    REGISTERED_TEMPLATE_PACKS,
    REQUIRED_BLOCK_IDS,
    REQUIRED_TEMPLATE_SLUGS,
    SIMULATION_TEMPLATE,
    expected_source_pack_for_block_id,
)
from .common import (
    base_world_meta,
    build_behavior_config,
)

WORLD_UPSERT_META_KEY = "project_world_upsert_key"


def _normalize_api_base(api_base: str) -> str:
    normalized = str(api_base or "").strip()
    if not normalized:
        return "http://localhost:8000"
    return normalized.rstrip("/")


def _world_upsert_key(world_name: str) -> str:
    normalized_world_name = str(world_name or "").strip() or "world"
    return f"{BOOTSTRAP_SOURCE_KEY}:world:{normalized_world_name}"


def _response_excerpt(response: httpx.Response, *, limit: int = 500) -> str:
    try:
        body: Any = response.json()
    except Exception:
        body = response.text
    text = str(body)
    if len(text) > limit:
        return text[: limit - 3] + "..."
    return text


def _raise_http_error(response: httpx.Response, *, context: str) -> None:
    if response.status_code < 400:
        return
    raise RuntimeError(
        f"{context}: HTTP {response.status_code} {_response_excerpt(response)}"
    )


async def _api_get_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.get(path, params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


async def _api_post_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.post(path, json=(body or {}), params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


async def _api_put_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.put(path, json=(body or {}), params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


def _is_http_not_found_error(exc: Exception) -> bool:
    return "HTTP 404" in str(exc)


def _to_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_iso_timestamp(value: Any) -> datetime:
    text = str(value or "").strip()
    if not text:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _snapshot_sort_key(snapshot: Dict[str, Any]) -> tuple[datetime, int]:
    updated_at = _parse_iso_timestamp(snapshot.get("updated_at"))
    snapshot_id = _to_int(snapshot.get("id")) or 0
    return updated_at, snapshot_id


def _matching_project_snapshots_by_name(
    snapshots: List[Dict[str, Any]],
    *,
    project_name: str,
) -> List[Dict[str, Any]]:
    matching: List[Dict[str, Any]] = []
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        if str(snapshot.get("name") or "").strip() == project_name:
            matching.append(snapshot)
    matching.sort(key=_snapshot_sort_key, reverse=True)
    return matching


def _select_preferred_project_snapshot_from_matching(
    snapshots: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not snapshots:
        return None
    non_legacy = [snapshot for snapshot in snapshots if not _is_legacy_seed_snapshot(snapshot)]
    if non_legacy:
        return non_legacy[0]
    return snapshots[0]


def _canonical_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _bundle_hash(bundle: Dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(bundle).encode("utf-8")).hexdigest()


def _normalize_project_file_path(project_file: Optional[str], *, project_name: str) -> Path:
    raw = str(project_file or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()

    safe_name = "".join(ch if ch.isalnum() or ch in ("_", "-", ".") else "_" for ch in project_name.strip())
    safe_name = safe_name or "bananza_project"
    return (Path.cwd() / ".pixsim7" / "bananza" / f"{safe_name}.json").resolve()


def _build_project_file_payload(snapshot_detail: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "project": {
            "id": snapshot_detail.get("id"),
            "name": snapshot_detail.get("name"),
            "source_world_id": snapshot_detail.get("source_world_id"),
            "updated_at": snapshot_detail.get("updated_at"),
            "schema_version": snapshot_detail.get("schema_version"),
            "provenance": snapshot_detail.get("provenance") or {},
        },
        "bundle": snapshot_detail.get("bundle") or {},
    }


def _read_project_file(project_file: Path) -> Dict[str, Any]:
    with open(project_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise RuntimeError(f"project_file_invalid:{project_file}")
    bundle = data.get("bundle")
    if not isinstance(bundle, dict):
        raise RuntimeError(f"project_file_missing_bundle:{project_file}")
    return data


def _write_project_file(project_file: Path, payload: Dict[str, Any]) -> str:
    project_file.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True)
    with open(project_file, "w", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _backup_project_file(project_file: Path, payload: Dict[str, Any]) -> Path:
    project_file.parent.mkdir(parents=True, exist_ok=True)
    backup_path = project_file.with_suffix(f"{project_file.suffix}.bak")
    text = json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True)
    with open(backup_path, "w", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")
    return backup_path


async def _resolve_auth_token(
    *,
    api_base: str,
    explicit_token: Optional[str],
    username: str,
    password: str,
) -> str:
    if explicit_token and str(explicit_token).strip():
        return str(explicit_token).strip()

    env_token = os.getenv("PIXSIM_AUTH_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()

    # Alias used by MCP/agent bridge tooling; support it for API-mode seeding too.
    api_token = os.getenv("PIXSIM_API_TOKEN")
    if api_token and api_token.strip():
        return api_token.strip()

    async with httpx.AsyncClient(base_url=api_base, timeout=30.0) as auth_client:
        response = await auth_client.post(
            "/api/v1/auth/login",
            json={
                "username": str(username or "admin").strip() or "admin",
                "password": str(password or "admin").strip() or "admin",
            },
        )
        _raise_http_error(response, context="login")
        data = response.json()
        token = str(data.get("access_token") or "").strip()
        if not token:
            raise RuntimeError("login_succeeded_but_no_access_token")
        return token


async def resolve_api_auth_token(
    *,
    api_base: str,
    auth_token: Optional[str] = None,
    username: str = "admin",
    password: str = "admin",
) -> str:
    return await _resolve_auth_token(
        api_base=_normalize_api_base(api_base),
        explicit_token=auth_token,
        username=username,
        password=password,
    )


async def _api_ensure_world(
    client: httpx.AsyncClient,
    *,
    world_name: str,
    project_name: Optional[str] = None,
    project_id: Optional[int] = None,
) -> Dict[str, Any]:
    preferred_world_id: Optional[int] = None
    if project_name:
        snapshot = await _api_find_project_snapshot_detail(
            client,
            project_name=project_name,
            project_id=project_id,
        )
        if isinstance(snapshot, dict):
            preferred_world_id = _to_int(snapshot.get("source_world_id"))

    worlds_payload = await _api_get_json(
        client,
        "/api/v1/game/worlds",
        params={"offset": 0, "limit": 1000},
        context="list_worlds",
    )
    if not isinstance(worlds_payload, dict):
        raise RuntimeError("unexpected_worlds_payload")
    worlds = worlds_payload.get("worlds") or []
    if not isinstance(worlds, list):
        raise RuntimeError("unexpected_worlds_list")

    matching_world_ids: List[int] = []
    for world in worlds:
        if not isinstance(world, dict):
            continue
        if str(world.get("name")) != world_name:
            continue
        world_id = _to_int(world.get("id"))
        if world_id is None:
            continue
        matching_world_ids.append(world_id)

    candidate_world_ids: List[int] = []
    if preferred_world_id is not None:
        candidate_world_ids.append(preferred_world_id)
    candidate_world_ids.extend(
        world_id for world_id in sorted(set(matching_world_ids)) if world_id != preferred_world_id
    )

    base_meta = base_world_meta()
    base_meta[WORLD_UPSERT_META_KEY] = _world_upsert_key(world_name)
    if not candidate_world_ids:
        created = await _api_post_json(
            client,
            "/api/v1/game/worlds",
            body={
                "name": world_name,
                "meta": base_meta,
                "upsert_key": base_meta[WORLD_UPSERT_META_KEY],
            },
            context="create_world",
        )
        if not isinstance(created, dict):
            raise RuntimeError("unexpected_create_world_payload")
        return created

    detail: Optional[Dict[str, Any]] = None
    for world_id in candidate_world_ids:
        try:
            fetched = await _api_get_json(
                client,
                f"/api/v1/game/worlds/{int(world_id)}",
                context="get_world",
            )
        except RuntimeError as exc:
            if _is_http_not_found_error(exc):
                continue
            raise
        if isinstance(fetched, dict):
            detail = fetched
            break

    if detail is None:
        created = await _api_post_json(
            client,
            "/api/v1/game/worlds",
            body={
                "name": world_name,
                "meta": base_meta,
                "upsert_key": base_meta[WORLD_UPSERT_META_KEY],
            },
            context="create_world",
        )
        if not isinstance(created, dict):
            raise RuntimeError("unexpected_create_world_payload")
        return created

    if not isinstance(detail, dict):
        raise RuntimeError("unexpected_world_detail_payload")
    world_id = _to_int(detail.get("id"))
    if world_id is None:
        raise RuntimeError("world_id_missing_in_detail")

    merged_meta = dict(detail.get("meta") or {})
    merged_meta.update(base_meta)
    updated = await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/meta",
        body={"meta": merged_meta},
        context="update_world_meta",
    )
    if not isinstance(updated, dict):
        raise RuntimeError("unexpected_updated_world_payload")
    return updated


async def _api_upsert_locations(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, int]]:
    summaries = await _api_get_json(
        client,
        "/api/v1/game/locations",
        context="list_locations",
    )
    if not isinstance(summaries, list):
        raise RuntimeError("unexpected_locations_payload")

    expected_keys = {seed.key for seed in LOCATION_SEEDS}
    existing_by_key: Dict[str, Dict[str, Any]] = {}
    for summary in summaries:
        if not isinstance(summary, dict):
            continue
        location_id = summary.get("id")
        if location_id is None:
            continue
        detail = await _api_get_json(
            client,
            f"/api/v1/game/locations/{int(location_id)}",
            context=f"get_location:{location_id}",
        )
        if not isinstance(detail, dict):
            continue
        meta = detail.get("meta") if isinstance(detail.get("meta"), dict) else {}
        if meta.get("bootstrap_source") != BOOTSTRAP_SOURCE_KEY:
            continue
        if meta.get("bootstrap_world_name") != world_name:
            continue
        location_key = meta.get("location_key")
        if isinstance(location_key, str) and location_key in expected_keys:
            existing_by_key[location_key] = detail

    created = 0
    updated = 0
    locations_by_key: Dict[str, Dict[str, Any]] = {}

    for seed in LOCATION_SEEDS:
        seed_meta = {
            "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
            "bootstrap_world_name": world_name,
            "location_key": seed.key,
            "description": seed.description,
        }
        existing = existing_by_key.get(seed.key)
        if existing is not None:
            merged_meta = dict(existing.get("meta") or {})
            merged_meta.update(seed_meta)
            payload = {
                "name": seed.name,
                "x": seed.x,
                "y": seed.y,
                "meta": merged_meta,
            }
            saved = await _api_put_json(
                client,
                f"/api/v1/game/locations/{int(existing['id'])}",
                params={"world_id": world_id},
                body=payload,
                context=f"update_location:{seed.key}",
            )
            updated += 1
        else:
            payload = {
                "name": seed.name,
                "x": seed.x,
                "y": seed.y,
                "meta": seed_meta,
            }
            saved = await _api_post_json(
                client,
                "/api/v1/game/locations",
                params={"world_id": world_id},
                body=payload,
                context=f"create_location:{seed.key}",
            )
            created += 1
        if not isinstance(saved, dict):
            raise RuntimeError(f"unexpected_location_payload:{seed.key}")
        locations_by_key[seed.key] = saved

    return locations_by_key, {"created": created, "updated": updated}


async def _api_upsert_npcs_and_schedules(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
    locations_by_key: Dict[str, Dict[str, Any]],
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[str, int]]:
    summaries = await _api_get_json(
        client,
        "/api/v1/game/npcs",
        context="list_npcs",
    )
    if not isinstance(summaries, list):
        raise RuntimeError("unexpected_npcs_payload")

    expected_keys = {seed.key for seed in NPC_SEEDS}
    existing_by_key: Dict[str, Dict[str, Any]] = {}
    for summary in summaries:
        if not isinstance(summary, dict):
            continue
        npc_id = summary.get("id")
        if npc_id is None:
            continue
        response = await client.get(
            f"/api/v1/game/npcs/{int(npc_id)}",
            params={"world_id": world_id},
        )
        if response.status_code == 404:
            continue
        _raise_http_error(response, context=f"get_npc:{npc_id}")
        detail = response.json()
        if not isinstance(detail, dict):
            continue
        personality = detail.get("personality") if isinstance(detail.get("personality"), dict) else {}
        if personality.get("bootstrap_source") != BOOTSTRAP_SOURCE_KEY:
            continue
        if personality.get("bootstrap_world_name") != world_name:
            continue
        npc_key = personality.get("npc_key")
        if isinstance(npc_key, str) and npc_key in expected_keys:
            existing_by_key[npc_key] = detail

    created = 0
    updated = 0
    npcs_by_key: Dict[str, Dict[str, Any]] = {}
    schedules_by_npc: Dict[str, List[Dict[str, Any]]] = {}

    for seed in NPC_SEEDS:
        home_location = locations_by_key.get(seed.home_location_key)
        if not isinstance(home_location, dict) or home_location.get("id") is None:
            raise RuntimeError(f"missing_home_location:{seed.home_location_key}")

        seed_personality = dict(seed.personality)
        seed_personality.update(
            {
                "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                "bootstrap_world_name": world_name,
                "npc_key": seed.key,
            }
        )
        existing = existing_by_key.get(seed.key)
        if existing is not None:
            merged_personality = dict(existing.get("personality") or {})
            merged_personality.update(seed_personality)
            payload = {
                "name": seed.name,
                "home_location_id": int(home_location["id"]),
                "personality": merged_personality,
            }
            saved = await _api_put_json(
                client,
                f"/api/v1/game/npcs/{int(existing['id'])}",
                params={"world_id": world_id},
                body=payload,
                context=f"update_npc:{seed.key}",
            )
            updated += 1
        else:
            payload = {
                "name": seed.name,
                "home_location_id": int(home_location["id"]),
                "personality": seed_personality,
            }
            saved = await _api_post_json(
                client,
                "/api/v1/game/npcs",
                params={"world_id": world_id},
                body=payload,
                context=f"create_npc:{seed.key}",
            )
            created += 1

        if not isinstance(saved, dict):
            raise RuntimeError(f"unexpected_npc_payload:{seed.key}")
        npcs_by_key[seed.key] = saved

    for seed in NPC_SEEDS:
        npc = npcs_by_key.get(seed.key)
        if not npc or npc.get("id") is None:
            continue
        schedule_items: List[Dict[str, Any]] = []
        for schedule_seed in seed.schedules:
            location = locations_by_key.get(schedule_seed.location_key)
            if not location or location.get("id") is None:
                continue
            schedule_items.append(
                {
                    "day_of_week": schedule_seed.day_of_week,
                    "start_time": schedule_seed.start_time,
                    "end_time": schedule_seed.end_time,
                    "location_id": int(location["id"]),
                    "rule": {
                        "bootstrap_source": BOOTSTRAP_SOURCE_KEY,
                        "label": schedule_seed.label,
                    },
                }
            )
        replaced = await _api_put_json(
            client,
            f"/api/v1/game/npcs/{int(npc['id'])}/schedules",
            params={"world_id": world_id},
            body={"items": schedule_items},
            context=f"replace_schedules:{seed.key}",
        )
        items = replaced.get("items") if isinstance(replaced, dict) else []
        schedules_by_npc[seed.key] = items if isinstance(items, list) else []

    return npcs_by_key, schedules_by_npc, {"created": created, "updated": updated}


async def _api_apply_behavior(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
    npcs_by_key: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    behavior_config = build_behavior_config()
    world = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}",
        context="get_world_for_behavior",
    )
    if not isinstance(world, dict):
        raise RuntimeError("unexpected_world_payload_for_behavior")

    world_meta = dict(world.get("meta") or {})
    existing_simulation = world_meta.get("simulation")
    merged_simulation = dict(SIMULATION_TEMPLATE)
    if isinstance(existing_simulation, dict):
        merged_simulation.update(existing_simulation)
    world_meta["simulation"] = merged_simulation
    world_meta["project_content_packs"] = {
        "registration_mode": "explicit",
        "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
        "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
    }

    await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/meta",
        body={"meta": world_meta},
        context="update_world_simulation_meta",
    )

    await _api_put_json(
        client,
        f"/api/v1/game/worlds/{world_id}/behavior",
        body={"config": behavior_config},
        context="update_world_behavior",
    )

    updated_npcs = 0
    for npc_key, binding in NPC_BEHAVIOR_BINDINGS.items():
        npc = npcs_by_key.get(npc_key)
        if not npc or npc.get("id") is None:
            continue
        personality = dict(npc.get("personality") or {})
        behavior = dict(personality.get("behavior") or {})

        behavior["routineId"] = binding["routineId"]
        if isinstance(binding.get("preferences"), dict):
            behavior["preferences"] = dict(binding["preferences"])

        personality["archetypeId"] = binding["archetypeId"]
        personality["routineId"] = binding["routineId"]
        personality["behavior"] = behavior
        personality["bootstrap_source"] = BOOTSTRAP_SOURCE_KEY
        personality["bootstrap_world_name"] = world_name
        personality["npc_key"] = npc_key

        payload = {
            "name": npc.get("name") or npc_key,
            "home_location_id": npc.get("home_location_id"),
            "personality": personality,
        }
        updated = await _api_put_json(
            client,
            f"/api/v1/game/npcs/{int(npc['id'])}",
            params={"world_id": world_id},
            body=payload,
            context=f"bind_behavior_npc:{npc_key}",
        )
        if isinstance(updated, dict):
            npcs_by_key[npc_key] = updated
        updated_npcs += 1

    return {
        "world_id": world_id,
        "routines": len(behavior_config.get("routines", {})),
        "activities": len(behavior_config.get("activities", {})),
        "npcs_bound": updated_npcs,
    }


async def _api_verify_required_blocks(client: httpx.AsyncClient) -> Dict[str, Any]:
    """Verify all required block IDs exist. Fails fast with missing IDs."""
    missing: List[str] = []
    wrong_source_pack: List[str] = []
    for block_id in REQUIRED_BLOCK_IDS:
        rows = await _api_get_json(
            client,
            "/api/v1/block-templates/meta/blocks/catalog",
            params={"q": block_id, "limit": 200},
            context=f"verify_block:{block_id}",
        )
        if not isinstance(rows, list):
            raise RuntimeError(f"unexpected_block_catalog_payload:{block_id}")

        row: Optional[Dict[str, Any]] = None
        for candidate in rows:
            if not isinstance(candidate, dict):
                continue
            if str(candidate.get("block_id") or "").strip() == block_id:
                row = candidate
                break

        if row is None:
            missing.append(block_id)
            continue

        expected_pack = expected_source_pack_for_block_id(block_id)
        tags = row.get("tags")
        tags_map = tags if isinstance(tags, dict) else {}
        source_pack = str(tags_map.get("source_pack") or row.get("package_name") or "").strip()

        if expected_pack and source_pack != expected_pack:
            wrong_source_pack.append(
                f"{block_id}: expected source_pack={expected_pack!r}, got {source_pack!r}"
            )
            continue
        if source_pack and source_pack not in REGISTERED_SOURCE_PACKS:
            wrong_source_pack.append(
                f"{block_id}: source_pack={source_pack!r} is not explicitly registered"
            )

    if missing:
        raise RuntimeError(
            f"Required block primitives missing ({len(missing)}/{len(REQUIRED_BLOCK_IDS)}). "
            f"Load content packs before running seed.\n"
            f"  Missing: {missing}"
        )

    if wrong_source_pack:
        raise RuntimeError(
            "Required block primitives found with unexpected source pack mapping. "
            "Register expected packs explicitly and reload content packs.\n"
            f"  Errors: {wrong_source_pack}"
        )

    return {
        "verified": len(REQUIRED_BLOCK_IDS),
        "missing": 0,
        "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
    }


async def _api_verify_required_templates(client: httpx.AsyncClient) -> Dict[str, Any]:
    """Verify all required template slugs exist. Fails fast with missing slugs."""
    missing: List[str] = []
    wrong_source_pack: List[str] = []
    for slug in REQUIRED_TEMPLATE_SLUGS:
        try:
            template = await _api_get_json(
                client,
                f"/api/v1/block-templates/by-slug/{slug}",
                context=f"verify_template:{slug}",
            )
        except RuntimeError as exc:
            if _is_http_not_found_error(exc):
                missing.append(slug)
            else:
                raise
            continue

        if not isinstance(template, dict):
            raise RuntimeError(f"unexpected_template_payload:{slug}")

        package_name = str(template.get("package_name") or "").strip()
        if package_name and package_name not in REGISTERED_TEMPLATE_PACKS:
            wrong_source_pack.append(
                f"{slug}: package_name={package_name!r} is not explicitly registered"
            )

    if missing:
        raise RuntimeError(
            f"Required generation templates missing ({len(missing)}/{len(REQUIRED_TEMPLATE_SLUGS)}). "
            f"Load content packs before running seed.\n"
            f"  Missing: {missing}"
        )

    if wrong_source_pack:
        raise RuntimeError(
            "Required templates found with unexpected package registration.\n"
            f"  Errors: {wrong_source_pack}"
        )

    return {
        "verified": len(REQUIRED_TEMPLATE_SLUGS),
        "missing": 0,
        "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
    }


async def _api_upsert_project_snapshot(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    world_name: str,
    project_name: str,
    project_id: Optional[int],
    prune_duplicates: bool = True,
) -> Dict[str, Any]:
    if world_id <= 0:
        raise RuntimeError("world_id_missing_for_project_snapshot")

    bundle = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}/project/export",
        context="export_world_project_bundle",
    )
    if not isinstance(bundle, dict):
        raise RuntimeError("unexpected_world_bundle_payload")

    overwrite_project_id: Optional[int] = project_id
    duplicate_ids: List[int] = []
    deleted_duplicate_ids: List[int] = []
    duplicate_delete_failures: List[Dict[str, Any]] = []
    migrated_from_legacy_seed = False
    if overwrite_project_id is None:
        snapshots = await _api_get_json(
            client,
            "/api/v1/game/worlds/projects/snapshots",
            params={"offset": 0, "limit": 500},
            context="list_project_snapshots",
        )
        if isinstance(snapshots, list):
            matching_name_snapshots = _matching_project_snapshots_by_name(
                snapshots,
                project_name=project_name,
            )
            if matching_name_snapshots:
                non_legacy = [
                    snapshot
                    for snapshot in matching_name_snapshots
                    if not _is_legacy_seed_snapshot(snapshot)
                ]
                if non_legacy:
                    primary_id = _to_int(non_legacy[0].get("id"))
                    if primary_id is not None:
                        overwrite_project_id = primary_id
                else:
                    migrated_from_legacy_seed = True
                duplicate_ids = [
                    pid
                    for pid in (
                        _to_int(snapshot.get("id"))
                        for snapshot in matching_name_snapshots
                    )
                    if pid is not None and pid != overwrite_project_id
                ]

    payload: Dict[str, Any] = {
        "name": project_name,
        "bundle": bundle,
        "source_world_id": world_id,
    }
    if overwrite_project_id is not None:
        payload["overwrite_project_id"] = int(overwrite_project_id)
    else:
        payload["provenance"] = {
            "kind": "import",
            "source_key": BOOTSTRAP_SOURCE_KEY,
            "meta": {
                "bootstrap_mode": "explicit_initialization",
                "bootstrap_profile": BOOTSTRAP_PROFILE,
                "bootstrap_world_name": world_name,
                "registered_source_packs": list(REGISTERED_SOURCE_PACKS),
                "registered_template_packs": list(REGISTERED_TEMPLATE_PACKS),
            },
        }

    saved = await _api_post_json(
        client,
        "/api/v1/game/worlds/projects/snapshots",
        body=payload,
        context="save_project_snapshot",
    )
    if not isinstance(saved, dict):
        raise RuntimeError("unexpected_project_snapshot_payload")

    saved_project_id = int(saved.get("id") or 0)
    if prune_duplicates:
        for duplicate_id in duplicate_ids:
            if duplicate_id == saved_project_id:
                continue
            response = await client.delete(
                f"/api/v1/game/worlds/projects/snapshots/{duplicate_id}",
            )
            if response.status_code in (200, 202, 204, 404):
                if response.status_code != 404:
                    deleted_duplicate_ids.append(duplicate_id)
                continue
            duplicate_delete_failures.append(
                {
                    "project_id": duplicate_id,
                    "status": response.status_code,
                    "body": _response_excerpt(response),
                }
            )

    return {
        "project_id": saved_project_id,
        "name": str(saved.get("name") or project_name),
        "source_world_id": saved.get("source_world_id"),
        "overwritten": overwrite_project_id is not None,
        "migrated_from_legacy_seed": migrated_from_legacy_seed,
        "bundle_mode": "full_export",
        "duplicate_candidates": len(duplicate_ids),
        "duplicates_deleted": len(deleted_duplicate_ids),
        "deleted_duplicate_ids": deleted_duplicate_ids,
        "duplicate_delete_failures": duplicate_delete_failures,
    }


async def _api_get_saved_project_detail(
    client: httpx.AsyncClient,
    *,
    project_id: int,
) -> Optional[Dict[str, Any]]:
    try:
        detail = await _api_get_json(
            client,
            f"/api/v1/game/worlds/projects/snapshots/{int(project_id)}",
            context=f"get_project_snapshot:{project_id}",
        )
    except RuntimeError as exc:
        if _is_http_not_found_error(exc):
            return None
        raise

    if not isinstance(detail, dict):
        raise RuntimeError(f"unexpected_project_snapshot_detail:{project_id}")
    return detail


async def _api_find_project_snapshot_detail(
    client: httpx.AsyncClient,
    *,
    project_name: str,
    project_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if project_id is not None:
        return await _api_get_saved_project_detail(client, project_id=int(project_id))

    snapshots = await _api_get_json(
        client,
        "/api/v1/game/worlds/projects/snapshots",
        params={"offset": 0, "limit": 500},
        context="list_project_snapshots",
    )
    if not isinstance(snapshots, list):
        raise RuntimeError("unexpected_project_snapshots_payload")

    matching = _matching_project_snapshots_by_name(snapshots, project_name=project_name)

    if not matching:
        return None

    preferred_snapshot = _select_preferred_project_snapshot_from_matching(matching)
    resolved_id = _to_int(preferred_snapshot.get("id")) if isinstance(preferred_snapshot, dict) else None
    if resolved_id is None:
        return None
    return await _api_get_saved_project_detail(client, project_id=resolved_id)


def _normalize_sync_mode(sync_mode: Optional[str]) -> str:
    normalized = str(sync_mode or "two_way").strip().lower()
    if normalized in {"two_way", "backend_to_file", "file_to_backend", "none"}:
        return normalized
    return "two_way"


def _is_legacy_seed_snapshot(snapshot: Dict[str, Any]) -> bool:
    provenance = snapshot.get("provenance") if isinstance(snapshot.get("provenance"), dict) else {}
    kind = str(provenance.get("kind") or "").strip().lower()
    source_key = str(provenance.get("source_key") or "").strip()
    return kind in {"seed", "demo"} or source_key == BOOTSTRAP_PROFILE


async def sync_project_snapshot_file_via_api(
    *,
    api_base: str,
    auth_token: Optional[str],
    username: str,
    password: str,
    project_name: str,
    project_id: Optional[int] = None,
    source_world_id: Optional[int] = None,
    project_file: Optional[str] = None,
    sync_mode: str = "two_way",
) -> Dict[str, Any]:
    normalized_mode = _normalize_sync_mode(sync_mode)
    if normalized_mode == "none":
        return {"action": "noop", "reason": "sync_mode_none"}

    normalized_api_base = _normalize_api_base(api_base)
    token = await _resolve_auth_token(
        api_base=normalized_api_base,
        explicit_token=auth_token,
        username=username,
        password=password,
    )
    project_file_path = _normalize_project_file_path(project_file, project_name=project_name)

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(
        base_url=normalized_api_base,
        timeout=120.0,
        headers=headers,
    ) as client:
        snapshot = await _api_find_project_snapshot_detail(
            client,
            project_name=project_name,
            project_id=project_id,
        )
        file_payload: Optional[Dict[str, Any]] = None
        if project_file_path.exists():
            file_payload = _read_project_file(project_file_path)

        file_mtime = datetime.fromtimestamp(0, tz=timezone.utc)
        if project_file_path.exists():
            file_mtime = datetime.fromtimestamp(project_file_path.stat().st_mtime, tz=timezone.utc)

        if snapshot is None and file_payload is None:
            return {
                "action": "noop",
                "reason": "project_snapshot_and_file_missing",
                "project_file": str(project_file_path),
            }

        if snapshot is None:
            if normalized_mode == "backend_to_file":
                return {
                    "action": "noop",
                    "reason": "backend_snapshot_missing_for_backend_to_file_mode",
                    "project_file": str(project_file_path),
                }
            bundle = file_payload["bundle"] if file_payload else {}
            file_project = file_payload.get("project") if isinstance(file_payload.get("project"), dict) else {}
            payload: Dict[str, Any] = {
                "name": str(file_project.get("name") or project_name),
                "bundle": bundle,
            }
            resolved_world_id = _to_int(file_project.get("source_world_id")) or _to_int(source_world_id)
            if resolved_world_id is not None:
                payload["source_world_id"] = resolved_world_id
            saved = await _api_post_json(
                client,
                "/api/v1/game/worlds/projects/snapshots",
                body=payload,
                context="sync_create_project_snapshot_from_file",
            )
            if not isinstance(saved, dict):
                raise RuntimeError("unexpected_sync_save_project_payload")
            saved_id = _to_int(saved.get("id"))
            if saved_id is None:
                raise RuntimeError("sync_created_project_missing_id")
            snapshot = await _api_get_saved_project_detail(client, project_id=saved_id)
            if snapshot is None:
                raise RuntimeError("sync_created_project_missing_detail")
            written_hash = _write_project_file(project_file_path, _build_project_file_payload(snapshot))
            return {
                "action": "pushed",
                "project_id": saved_id,
                "project_name": snapshot.get("name"),
                "project_file": str(project_file_path),
                "mode": normalized_mode,
                "bundle_hash": written_hash,
            }

        if file_payload is None:
            if normalized_mode == "file_to_backend":
                return {
                    "action": "noop",
                    "reason": "project_file_missing_for_file_to_backend_mode",
                    "project_id": snapshot.get("id"),
                    "project_file": str(project_file_path),
                }
            written_hash = _write_project_file(project_file_path, _build_project_file_payload(snapshot))
            return {
                "action": "pulled",
                "project_id": snapshot.get("id"),
                "project_name": snapshot.get("name"),
                "project_file": str(project_file_path),
                "mode": normalized_mode,
                "bundle_hash": written_hash,
            }

        snapshot_bundle = snapshot.get("bundle") if isinstance(snapshot.get("bundle"), dict) else {}
        file_bundle = file_payload.get("bundle") if isinstance(file_payload.get("bundle"), dict) else {}
        backend_hash = _bundle_hash(snapshot_bundle)
        file_hash = _bundle_hash(file_bundle)
        if backend_hash == file_hash:
            return {
                "action": "noop",
                "reason": "already_in_sync",
                "project_id": snapshot.get("id"),
                "project_name": snapshot.get("name"),
                "project_file": str(project_file_path),
                "mode": normalized_mode,
                "bundle_hash": backend_hash,
            }

        file_project = file_payload.get("project") if isinstance(file_payload.get("project"), dict) else {}
        file_updated_at = _parse_iso_timestamp(file_project.get("updated_at"))
        backend_updated_at = _parse_iso_timestamp(snapshot.get("updated_at"))

        push_file_to_backend = False
        if normalized_mode == "file_to_backend":
            push_file_to_backend = True
        elif normalized_mode == "two_way":
            push_file_to_backend = (file_updated_at > backend_updated_at) or (file_mtime > backend_updated_at)

        if push_file_to_backend:
            payload: Dict[str, Any] = {
                "name": str(file_project.get("name") or snapshot.get("name") or project_name),
                "bundle": file_bundle,
                "overwrite_project_id": int(snapshot["id"]),
            }
            resolved_world_id = (
                _to_int(file_project.get("source_world_id"))
                or _to_int(snapshot.get("source_world_id"))
                or _to_int(source_world_id)
            )
            if resolved_world_id is not None:
                payload["source_world_id"] = resolved_world_id

            saved = await _api_post_json(
                client,
                "/api/v1/game/worlds/projects/snapshots",
                body=payload,
                context="sync_push_project_file_to_backend",
            )
            if not isinstance(saved, dict):
                raise RuntimeError("unexpected_sync_push_project_payload")
            saved_id = _to_int(saved.get("id")) or int(snapshot["id"])
            updated_snapshot = await _api_get_saved_project_detail(client, project_id=saved_id)
            if updated_snapshot is None:
                raise RuntimeError("sync_push_project_missing_detail")
            written_hash = _write_project_file(project_file_path, _build_project_file_payload(updated_snapshot))
            return {
                "action": "pushed",
                "project_id": updated_snapshot.get("id"),
                "project_name": updated_snapshot.get("name"),
                "project_file": str(project_file_path),
                "mode": normalized_mode,
                "bundle_hash": written_hash,
            }

        backup_path = _backup_project_file(project_file_path, file_payload)
        written_hash = _write_project_file(project_file_path, _build_project_file_payload(snapshot))
        return {
            "action": "pulled",
            "project_id": snapshot.get("id"),
            "project_name": snapshot.get("name"),
            "project_file": str(project_file_path),
            "mode": normalized_mode,
            "bundle_hash": written_hash,
            "backup_file": str(backup_path),
        }


async def seed_bananza_boat_slice_via_api(
    *,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
    prune_duplicate_projects: bool = True,
    api_base: str,
    auth_token: Optional[str] = None,
    username: str = "admin",
    password: str = "admin",
) -> Dict[str, Any]:
    normalized_api_base = _normalize_api_base(api_base)
    token = await _resolve_auth_token(
        api_base=normalized_api_base,
        explicit_token=auth_token,
        username=username,
        password=password,
    )

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(
        base_url=normalized_api_base,
        timeout=120.0,
        headers=headers,
    ) as client:
        # Validate that required content is loaded before proceeding
        block_check = await _api_verify_required_blocks(client)
        template_check = await _api_verify_required_templates(client)

        world = await _api_ensure_world(
            client,
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
        )
        world_id = int(world.get("id") or 0)
        if world_id <= 0:
            raise RuntimeError("world_id_missing_after_api_seed")

        locations_by_key, location_summary = await _api_upsert_locations(
            client,
            world_id=world_id,
            world_name=world_name,
        )
        npcs_by_key, schedules_by_npc, npc_summary = await _api_upsert_npcs_and_schedules(
            client,
            world_id=world_id,
            world_name=world_name,
            locations_by_key=locations_by_key,
        )
        behavior_summary = await _api_apply_behavior(
            client,
            world_id=world_id,
            world_name=world_name,
            npcs_by_key=npcs_by_key,
        )

        project_summary = await _api_upsert_project_snapshot(
            client,
            world_id=world_id,
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
            prune_duplicates=prune_duplicate_projects,
        )

    print("Seed complete: Bananza Boat slice (API mode)")
    print(f"  api_base: {normalized_api_base}")
    print(f"  world_id: {world_id}")
    print(
        "  content_check: "
        f"blocks_verified={block_check['verified']} "
        f"templates_verified={template_check['verified']}"
    )
    print(
        "  project_snapshot: "
        f"id={project_summary['project_id']} "
        f"name={project_summary['name']!r} "
        f"source_world_id={project_summary['source_world_id']} "
        f"overwritten={project_summary['overwritten']} "
        f"migrated_from_legacy_seed={project_summary['migrated_from_legacy_seed']} "
        f"bundle_mode={project_summary['bundle_mode']}"
    )
    print(
        "  project_snapshot_dedup: "
        f"candidates={project_summary['duplicate_candidates']} "
        f"deleted={project_summary['duplicates_deleted']} "
        f"failed={len(project_summary['duplicate_delete_failures'])}"
    )
    print(
        "  locations: "
        f"created={location_summary['created']} "
        f"updated={location_summary['updated']}"
    )
    for key in sorted(locations_by_key.keys()):
        loc = locations_by_key[key]
        print(f"    - {key}: id={loc.get('id')} name={loc.get('name')}")
    print(
        "  npcs: "
        f"created={npc_summary['created']} "
        f"updated={npc_summary['updated']}"
    )
    for key in sorted(npcs_by_key.keys()):
        npc = npcs_by_key[key]
        print(
            f"    - {key}: id={npc.get('id')} "
            f"name={npc.get('name')} home_location_id={npc.get('home_location_id')}"
        )
    print(
        "  behavior: "
        f"activities={behavior_summary['activities']} "
        f"routines={behavior_summary['routines']} "
        f"npcs_bound={behavior_summary['npcs_bound']}"
    )
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/primitives/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )

    return {
        "world_id": world_id,
        "project_id": project_summary["project_id"],
        "project_name": project_summary["name"],
        "source_world_id": project_summary["source_world_id"],
        "api_base": normalized_api_base,
    }
