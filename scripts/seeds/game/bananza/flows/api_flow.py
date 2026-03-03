from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import httpx

from ..seed_data import (
    GENERATION_TEMPLATE_SEEDS,
    LOCATION_SEEDS,
    NPC_BEHAVIOR_BINDINGS,
    NPC_SEEDS,
    PRIMITIVE_SEEDS,
    SEED_KEY,
    SIMULATION_TEMPLATE,
)
from .common import (
    base_world_meta,
    build_behavior_config,
    generation_template_payload,
)


def _normalize_api_base(api_base: str) -> str:
    normalized = str(api_base or "").strip()
    if not normalized:
        return "http://localhost:8000"
    return normalized.rstrip("/")


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


async def _api_patch_json(
    client: httpx.AsyncClient,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    context: str,
) -> Any:
    response = await client.patch(path, json=(body or {}), params=params)
    _raise_http_error(response, context=context)
    if response.status_code == 204:
        return None
    return response.json()


def _is_http_not_found_error(exc: Exception) -> bool:
    return "HTTP 404" in str(exc)


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


async def _api_ensure_world(
    client: httpx.AsyncClient,
    *,
    world_name: str,
) -> Dict[str, Any]:
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

    existing = None
    for world in worlds:
        if isinstance(world, dict) and str(world.get("name")) == world_name:
            existing = world
            break

    base_meta = base_world_meta()
    if existing is None:
        created = await _api_post_json(
            client,
            "/api/v1/game/worlds",
            body={"name": world_name, "meta": base_meta},
            context="create_world",
        )
        if not isinstance(created, dict):
            raise RuntimeError("unexpected_create_world_payload")
        return created

    world_id = int(existing.get("id"))
    detail = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}",
        context="get_world",
    )
    if not isinstance(detail, dict):
        raise RuntimeError("unexpected_world_detail_payload")
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
        if meta.get("seed_key") != SEED_KEY:
            continue
        if meta.get("seed_world_name") != world_name:
            continue
        location_key = meta.get("location_key")
        if isinstance(location_key, str) and location_key in expected_keys:
            existing_by_key[location_key] = detail

    created = 0
    updated = 0
    locations_by_key: Dict[str, Dict[str, Any]] = {}

    for seed in LOCATION_SEEDS:
        seed_meta = {
            "seed_key": SEED_KEY,
            "seed_world_name": world_name,
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
        if personality.get("seed_key") != SEED_KEY:
            continue
        if personality.get("seed_world_name") != world_name:
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
                "seed_key": SEED_KEY,
                "seed_world_name": world_name,
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
                        "seed_key": SEED_KEY,
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
    world_meta.setdefault("seed_key", SEED_KEY)

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
        personality["seed_key"] = SEED_KEY
        personality["seed_world_name"] = world_name
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


async def _api_upsert_primitives(client: httpx.AsyncClient) -> Dict[str, int]:
    created = 0
    updated = 0
    for primitive in PRIMITIVE_SEEDS:
        block_id = str(primitive.get("block_id") or "").strip()
        if not block_id:
            continue
        payload = {
            "category": primitive.get("category"),
            "text": primitive.get("text"),
            "tags": dict(primitive.get("tags") or {}),
            "source": "system",
            "is_public": True,
            "avg_rating": 4.0,
        }
        upserted = await _api_put_json(
            client,
            f"/api/v1/block-templates/blocks/by-block-id/{block_id}",
            params={"create_if_missing": True},
            body=payload,
            context=f"upsert_primitive:{block_id}",
        )
        status = upserted.get("status") if isinstance(upserted, dict) else None
        if status == "created":
            created += 1
        else:
            updated += 1

    return {"created": created, "updated": updated, "total": len(PRIMITIVE_SEEDS)}


async def _api_upsert_generation_templates(client: httpx.AsyncClient) -> Dict[str, int]:
    created = 0
    updated = 0

    for seed in GENERATION_TEMPLATE_SEEDS:
        payload = generation_template_payload(seed)
        slug = str(payload.get("slug") or "").strip()
        if not slug:
            continue

        existing: Optional[Dict[str, Any]] = None
        try:
            fetched = await _api_get_json(
                client,
                f"/api/v1/block-templates/by-slug/{slug}",
                context=f"get_template_by_slug:{slug}",
            )
            if isinstance(fetched, dict):
                existing = fetched
        except RuntimeError as exc:
            if not _is_http_not_found_error(exc):
                raise

        existing_id = existing.get("id") if isinstance(existing, dict) else None
        if existing_id:
            update_payload = dict(payload)
            update_payload.pop("slug", None)
            await _api_patch_json(
                client,
                f"/api/v1/block-templates/{existing_id}",
                body=update_payload,
                context=f"update_template:{slug}",
            )
            updated += 1
            continue

        await _api_post_json(
            client,
            "/api/v1/block-templates",
            body=payload,
            context=f"create_template:{slug}",
        )
        created += 1

    return {
        "created": created,
        "updated": updated,
        "total": len(GENERATION_TEMPLATE_SEEDS),
    }


async def _api_upsert_project_snapshot(
    client: httpx.AsyncClient,
    *,
    world_id: int,
    project_name: str,
    project_id: Optional[int],
) -> Dict[str, Any]:
    if world_id <= 0:
        raise RuntimeError("world_id_missing_for_project_snapshot")

    bundle = await _api_get_json(
        client,
        f"/api/v1/game/worlds/{world_id}/project/export",
        context="export_world_project_bundle",
    )

    overwrite_project_id: Optional[int] = project_id
    if overwrite_project_id is None:
        snapshots = await _api_get_json(
            client,
            "/api/v1/game/worlds/projects/snapshots",
            params={"offset": 0, "limit": 500},
            context="list_project_snapshots",
        )
        if isinstance(snapshots, list):
            for snapshot in snapshots:
                if not isinstance(snapshot, dict):
                    continue
                if str(snapshot.get("name")) == project_name:
                    snapshot_id = snapshot.get("id")
                    if snapshot_id is not None:
                        overwrite_project_id = int(snapshot_id)
                    break

    payload: Dict[str, Any] = {
        "name": project_name,
        "bundle": bundle,
        "source_world_id": world_id,
    }
    if overwrite_project_id is not None:
        payload["overwrite_project_id"] = int(overwrite_project_id)

    saved = await _api_post_json(
        client,
        "/api/v1/game/worlds/projects/snapshots",
        body=payload,
        context="save_project_snapshot",
    )
    if not isinstance(saved, dict):
        raise RuntimeError("unexpected_project_snapshot_payload")

    return {
        "project_id": int(saved.get("id") or 0),
        "name": str(saved.get("name") or project_name),
        "source_world_id": saved.get("source_world_id"),
        "overwritten": overwrite_project_id is not None,
        "bundle_mode": "full_export",
    }


async def seed_bananza_boat_slice_via_api(
    *,
    world_name: str,
    project_name: str,
    project_id: Optional[int] = None,
    api_base: str,
    auth_token: Optional[str] = None,
    username: str = "admin",
    password: str = "admin",
) -> None:
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
        world = await _api_ensure_world(client, world_name=world_name)
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
        primitive_summary = await _api_upsert_primitives(client)
        template_summary = await _api_upsert_generation_templates(client)

        project_summary = await _api_upsert_project_snapshot(
            client,
            world_id=world_id,
            project_name=project_name,
            project_id=project_id,
        )

    print("Seed complete: Bananza Boat slice (API mode)")
    print(f"  api_base: {normalized_api_base}")
    print(f"  world_id: {world_id}")
    print(
        "  project_snapshot: "
        f"id={project_summary['project_id']} "
        f"name={project_summary['name']!r} "
        f"source_world_id={project_summary['source_world_id']} "
        f"overwritten={project_summary['overwritten']} "
        f"bundle_mode={project_summary['bundle_mode']}"
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
    print(
        "  primitives: "
        f"created={primitive_summary['created']} "
        f"updated={primitive_summary['updated']} "
        f"total_seed={primitive_summary['total']}"
    )
    print(
        "  templates: "
        f"created={template_summary['created']} "
        f"updated={template_summary['updated']} "
        f"total_seed={template_summary['total']}"
    )
    print("")
    print("Next step example:")
    print(
        "  POST /api/v1/game/dialogue/actions/select with "
        "lead_npc_id, partner_npc_id, world_id, location_tag, mood, pose"
    )
