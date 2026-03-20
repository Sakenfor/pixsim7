"""
Game authoring meta contract endpoint.

Provides machine-readable workflows for AI agents and automation that create
and iterate on game worlds via the API.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import (
    CurrentGamePrincipal,
    get_game_world_service,
)
from pixsim7.backend.main.domain.game.project_runtime_meta import (
    read_project_behavior_enabled_plugins,
    read_project_runtime_preferences,
)
from pixsim7.backend.main.services.game.project_storage import GameProjectStorageService

router = APIRouter()

GAME_AUTHORING_CONTRACT_VERSION = "2026-03-20.1"


class GameAuthoringEndpointContract(BaseModel):
    id: str
    method: str
    path: str
    summary: str
    contract_ref: Optional[str] = None
    idempotent: bool = False
    notes: Optional[str] = None


class GameAuthoringWorkflowStepContract(BaseModel):
    step: int
    endpoint_id: str
    goal: str
    consumes: List[str] = Field(default_factory=list)
    outputs: List[str] = Field(default_factory=list)
    optional: bool = False


class GameAuthoringWorkflowContract(BaseModel):
    id: str
    label: str
    description: str
    audience: List[str] = Field(default_factory=lambda: ["agent", "user"])
    steps: List[GameAuthoringWorkflowStepContract]


class GameSeedProfileContract(BaseModel):
    id: str
    label: str
    audience: List[str] = Field(default_factory=lambda: ["agent", "user"])
    defaults: Dict[str, Any] = Field(default_factory=dict)
    required_content_checks: List[str] = Field(default_factory=list)
    cli_example: str
    notes: List[str] = Field(default_factory=list)


class GameAuthoringIdempotencyRuleContract(BaseModel):
    scope: str
    behavior: str
    recommendation: str


class DiscoveredGameProjectContract(BaseModel):
    project_id: int
    name: str
    source_world_id: Optional[int] = None
    provenance_kind: str
    provenance_source_key: Optional[str] = None
    runtime_preferences: Dict[str, Any] = Field(default_factory=dict)
    behavior_enabled_plugins: Optional[List[str]] = None
    tags: List[str] = Field(default_factory=list)
    updated_at: Optional[str] = None


class GameAuthoringContractResponse(BaseModel):
    version: str
    endpoint: str
    summary: str
    endpoints: List[GameAuthoringEndpointContract]
    workflows: List[GameAuthoringWorkflowContract]
    discovered_projects: List[DiscoveredGameProjectContract] = Field(default_factory=list)
    seed_profiles: List[GameSeedProfileContract]
    idempotency: List[GameAuthoringIdempotencyRuleContract]
    streamlining_recommendations: List[str] = Field(default_factory=list)


def _normalize_endpoint_path(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


def _build_default_authoring_endpoints() -> List[GameAuthoringEndpointContract]:
    return [
        GameAuthoringEndpointContract(
            id="blocks.content_packs",
            method="GET",
            path="/api/v1/block-templates/meta/content-packs/manifests",
            summary="Verify required source/template packs are loaded before authoring.",
            contract_ref="blocks.discovery",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="blocks.catalog",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/catalog",
            summary="Inspect available primitives before building behavior/dialogue.",
            contract_ref="blocks.discovery",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.worlds.list",
            method="GET",
            path="/api/v1/game/worlds",
            summary="List worlds to reuse existing projects instead of duplicating.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.worlds.create",
            method="POST",
            path="/api/v1/game/worlds",
            summary="Create a new world shell with initial metadata.",
            idempotent=False,
            notes="Use deterministic names + pre-check via list to avoid duplicates.",
        ),
        GameAuthoringEndpointContract(
            id="game.worlds.update_meta",
            method="PUT",
            path="/api/v1/game/worlds/{world_id}/meta",
            summary="Upsert world-level metadata (simulation + content-pack registration).",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.create",
            method="POST",
            path="/api/v1/game/locations",
            summary="Create world locations before scene and room-navigation authoring.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.list",
            method="GET",
            path="/api/v1/game/objects",
            summary="List authored runtime objects for a world.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.create",
            method="POST",
            path="/api/v1/game/objects",
            summary="Create a generic runtime object with optional template binding metadata.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.put",
            method="PUT",
            path="/api/v1/game/objects/{object_id}",
            summary="Replace a runtime object payload while preserving canonical object metadata envelope.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.patch",
            method="PATCH",
            path="/api/v1/game/objects/{object_id}",
            summary="Partial update: merge supplied fields (capabilities, components, tags, binding, meta) into existing object.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.patch_binding",
            method="PATCH",
            path="/api/v1/game/objects/{object_id}/binding",
            summary="Merge-update template binding metadata without touching other object fields.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.objects.delete_binding",
            method="DELETE",
            path="/api/v1/game/objects/{object_id}/binding",
            summary="Remove template binding from an object.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.update_meta",
            method="PATCH",
            path="/api/v1/game/locations/{location_id}",
            summary="Update location metadata while preserving canonical room_navigation format.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.npc_slots.get",
            method="GET",
            path="/api/v1/game/locations/{location_id}/npc-slots-2d",
            summary="Read 2D NPC slot layout metadata for location staging and editor hydration.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.npc_slots.put",
            method="PUT",
            path="/api/v1/game/locations/{location_id}/npc-slots-2d",
            summary="Replace 2D NPC slot layout without rewriting unrelated location meta keys.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.get",
            method="GET",
            path="/api/v1/game/locations/{location_id}/room-navigation",
            summary="Fetch canonical room-navigation payload for incremental editing.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.put",
            method="PUT",
            path="/api/v1/game/locations/{location_id}/room-navigation",
            summary="Replace complete room-navigation payload while preserving other location meta.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.patch",
            method="PATCH",
            path="/api/v1/game/locations/{location_id}/room-navigation",
            summary="Apply partial patch operations (checkpoint/edge/hotspot) to room navigation.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.validate",
            method="POST",
            path="/api/v1/game/locations/{location_id}/room-navigation/validate",
            summary="Validate a candidate room-navigation payload without mutating location state.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.transition_cache.get",
            method="GET",
            path="/api/v1/game/locations/{location_id}/room-navigation/transition-cache",
            summary="Read room-navigation transition cache without touching core navigation payload.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.locations.room_navigation.transition_cache.put",
            method="PUT",
            path="/api/v1/game/locations/{location_id}/room-navigation/transition-cache",
            summary="Update transition-cache state via dedicated endpoint (no full location.meta writes).",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.behavior.validate",
            method="POST",
            path="/api/v1/game/worlds/{world_id}/behavior/validate",
            summary="Validate behavior config without mutating world state.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.behavior.update",
            method="PUT",
            path="/api/v1/game/worlds/{world_id}/behavior",
            summary="Persist full behavior config after validation.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.worlds.export_project",
            method="GET",
            path="/api/v1/game/worlds/{world_id}/project/export",
            summary="Export canonical project bundle for snapshot save and file sync.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.projects.list_snapshots",
            method="GET",
            path="/api/v1/game/worlds/projects/snapshots",
            summary="Find existing snapshots by name before creating new ones.",
            idempotent=True,
        ),
        GameAuthoringEndpointContract(
            id="game.projects.save_snapshot",
            method="POST",
            path="/api/v1/game/worlds/projects/snapshots",
            summary="Create or overwrite a saved project snapshot from bundle payload.",
            idempotent=True,
            notes="Set overwrite_project_id for deterministic updates.",
        ),
        GameAuthoringEndpointContract(
            id="game.projects.import_snapshot",
            method="POST",
            path="/api/v1/game/worlds/projects/import",
            summary="Materialize a saved snapshot as a new playable world.",
            idempotent=False,
        ),
        GameAuthoringEndpointContract(
            id="game.sessions.create",
            method="POST",
            path="/api/v1/game/sessions",
            summary="Create/ensure runtime session for smoke-testing playability.",
            idempotent=False,
            notes="Pass world_id and scene_id=0 to auto-resolve world scene.",
        ),
    ]


def _auto_discovered_endpoint_id(method: str, path: str) -> str:
    without_prefix = path.removeprefix("/api/v1/game/")
    normalized = re.sub(r"{([^}]+)}", r"by_\1", without_prefix)
    normalized = re.sub(r"[^a-zA-Z0-9_]+", ".", normalized).strip(".").lower()
    if not normalized:
        normalized = "root"
    return f"game.auto.{method.lower()}.{normalized}"


def _resolve_authoring_endpoints(request: Optional[Request]) -> List[GameAuthoringEndpointContract]:
    default_endpoints = _build_default_authoring_endpoints()
    by_key = {
        (endpoint.method.upper(), _normalize_endpoint_path(endpoint.path)): endpoint
        for endpoint in default_endpoints
    }

    non_game_endpoints = [
        endpoint
        for endpoint in default_endpoints
        if not endpoint.path.startswith("/api/v1/game/")
    ]

    if request is None:
        return default_endpoints

    app = getattr(request, "app", None)
    routes = getattr(app, "routes", None)
    if not isinstance(routes, list):
        return default_endpoints

    discovered_game_endpoints: List[GameAuthoringEndpointContract] = []
    seen: set[tuple[str, str]] = set()

    for route in routes:
        if not isinstance(route, APIRoute):
            continue

        normalized_path = _normalize_endpoint_path(route.path)
        if not normalized_path.startswith("/api/v1/game/"):
            continue

        methods = sorted(
            method.upper()
            for method in (route.methods or set())
            if method and method.upper() not in {"HEAD", "OPTIONS"}
        )
        if not methods:
            continue

        for method in methods:
            key = (method, normalized_path)
            if key in seen:
                continue
            seen.add(key)

            default_endpoint = by_key.get(key)
            if default_endpoint is not None:
                discovered_game_endpoints.append(default_endpoint.model_copy(deep=True))
                continue

            summary = str(route.summary or route.name or "").strip()
            if not summary:
                summary = f"{method} {normalized_path}"

            discovered_game_endpoints.append(
                GameAuthoringEndpointContract(
                    id=_auto_discovered_endpoint_id(method, normalized_path),
                    method=method,
                    path=normalized_path,
                    summary=summary,
                    contract_ref="game.authoring",
                    idempotent=method in {"GET", "PUT", "DELETE"},
                    notes="Auto-discovered from loaded /api/v1/game route plugins.",
                )
            )

    if not discovered_game_endpoints:
        discovered_game_endpoints = [
            endpoint
            for endpoint in default_endpoints
            if endpoint.path.startswith("/api/v1/game/")
        ]

    discovered_game_endpoints.sort(key=lambda endpoint: (endpoint.path, endpoint.method, endpoint.id))
    return non_game_endpoints + discovered_game_endpoints


def _normalize_audience_filter(audience: Optional[str]) -> Optional[str]:
    if audience is None:
        return None

    normalized = str(audience).strip().lower()
    if not normalized:
        return None
    if normalized not in {"agent", "user"}:
        raise HTTPException(
            status_code=422,
            detail="Invalid audience filter. Expected one of: agent, user.",
        )
    return normalized


async def _discover_projects_for_user(
    *,
    owner_user_id: int,
    game_world_service: Any,
) -> List[DiscoveredGameProjectContract]:
    db = getattr(game_world_service, "db", None)
    if db is None:
        return []

    storage = GameProjectStorageService(db)
    projects = await storage.list_projects(
        owner_user_id=owner_user_id,
        offset=0,
        limit=100,
    )

    discovered: List[DiscoveredGameProjectContract] = []
    for project in projects:
        name = str(getattr(project, "name", "") or "").strip()
        source_world_id = getattr(project, "source_world_id", None)
        provenance_kind = str(getattr(project, "origin_kind", "") or "unknown").strip().lower() or "unknown"
        source_key_raw = getattr(project, "origin_source_key", None)
        provenance_source_key = str(source_key_raw).strip() if source_key_raw is not None else None
        if provenance_source_key == "":
            provenance_source_key = None

        origin_meta = getattr(project, "origin_meta", None)
        runtime_preferences = read_project_runtime_preferences(origin_meta)
        behavior_enabled_plugins = read_project_behavior_enabled_plugins(origin_meta)

        tags: List[str] = []
        lower_name = name.lower()
        if provenance_kind in {"seed", "demo"}:
            tags.append("seeded")
        if "bananza" in lower_name or (
            provenance_source_key is not None and "bananza" in provenance_source_key.lower()
        ):
            tags.append("bananza")
        mode = runtime_preferences.get("mode")
        if mode in {"api", "direct"}:
            tags.append(f"mode:{mode}")
        sync_mode = runtime_preferences.get("sync_mode")
        if isinstance(sync_mode, str) and sync_mode:
            tags.append(f"sync:{sync_mode}")

        updated_at_raw = getattr(project, "updated_at", None)
        if isinstance(updated_at_raw, datetime):
            updated_at = updated_at_raw.isoformat()
        else:
            updated_at = None

        project_id = int(getattr(project, "id"))
        discovered.append(
            DiscoveredGameProjectContract(
                project_id=project_id,
                name=name or f"Project {project_id}",
                source_world_id=source_world_id,
                provenance_kind=provenance_kind,
                provenance_source_key=provenance_source_key,
                runtime_preferences=runtime_preferences,
                behavior_enabled_plugins=behavior_enabled_plugins,
                tags=tags,
                updated_at=updated_at,
            )
        )

    return discovered


@router.get("/meta/authoring-contract", response_model=GameAuthoringContractResponse)
async def get_game_authoring_contract(
    current_user: CurrentGamePrincipal,
    request: Request = None,
    audience: Optional[str] = None,
    game_world_service=Depends(get_game_world_service),
) -> GameAuthoringContractResponse:
    """
    Canonical game authoring contract for API/AI-agent orchestration.

    Includes API endpoints, ordered workflows, idempotency behavior, and
    seed-profile guidance (including Bananza).
    """
    audience_filter = _normalize_audience_filter(audience)
    discovered_projects = await _discover_projects_for_user(
        owner_user_id=int(current_user.id),
        game_world_service=game_world_service,
    )

    endpoints = _resolve_authoring_endpoints(request)

    workflows = [
        GameAuthoringWorkflowContract(
            id="quick_world_bootstrap",
            label="Quick World Bootstrap",
            description=(
                "Minimal repeatable path for AI agents: verify packs, create/update world, "
                "validate behavior, and checkpoint as project snapshot."
            ),
            steps=[
                GameAuthoringWorkflowStepContract(
                    step=1,
                    endpoint_id="blocks.content_packs",
                    goal="Confirm required content packs are loaded.",
                ),
                GameAuthoringWorkflowStepContract(
                    step=2,
                    endpoint_id="game.worlds.create",
                    goal="Create world shell.",
                    outputs=["world_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=3,
                    endpoint_id="game.worlds.update_meta",
                    goal="Apply simulation/meta defaults + project content packs.",
                    consumes=["world_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=4,
                    endpoint_id="game.behavior.validate",
                    goal="Validate behavior config before write.",
                    consumes=["world_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=5,
                    endpoint_id="game.behavior.update",
                    goal="Persist behavior config.",
                    consumes=["world_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=6,
                    endpoint_id="game.worlds.export_project",
                    goal="Export canonical bundle.",
                    consumes=["world_id"],
                    outputs=["bundle"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=7,
                    endpoint_id="game.projects.save_snapshot",
                    goal="Save initial project snapshot checkpoint.",
                    consumes=["bundle", "world_id"],
                    outputs=["project_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=8,
                    endpoint_id="game.sessions.create",
                    goal="Create world session for smoke test.",
                    consumes=["world_id"],
                    outputs=["session_id"],
                    optional=True,
                ),
            ],
        ),
        GameAuthoringWorkflowContract(
            id="room_navigation_iteration_loop",
            label="Room Navigation Iteration Loop",
            description=(
                "Incremental 3D room-orientation authoring path: fetch canonical graph, "
                "apply targeted patch ops, validate, and then run runtime smoke tests."
            ),
            steps=[
                GameAuthoringWorkflowStepContract(
                    step=1,
                    endpoint_id="game.locations.create",
                    goal="Create location shell (skip if location already exists).",
                    outputs=["location_id"],
                    optional=True,
                ),
                GameAuthoringWorkflowStepContract(
                    step=2,
                    endpoint_id="game.locations.room_navigation.get",
                    goal="Read current canonical room navigation graph.",
                    consumes=["location_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=3,
                    endpoint_id="game.locations.room_navigation.patch",
                    goal="Apply incremental checkpoint/edge/hotspot edits.",
                    consumes=["location_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=4,
                    endpoint_id="game.locations.room_navigation.validate",
                    goal="Preflight validate candidate payload before publish.",
                    consumes=["location_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=5,
                    endpoint_id="game.locations.room_navigation.transition_cache.put",
                    goal="Persist transition cache updates independently from room graph edits.",
                    consumes=["location_id"],
                    optional=True,
                ),
                GameAuthoringWorkflowStepContract(
                    step=6,
                    endpoint_id="game.sessions.create",
                    goal="Create session and verify runtime starts cleanly after nav edits.",
                    consumes=["world_id"],
                    outputs=["session_id"],
                    optional=True,
                ),
            ],
        ),
        GameAuthoringWorkflowContract(
            id="object_authoring_loop",
            label="Object Authoring Loop",
            description=(
                "Author generic runtime objects through the dedicated object surface, "
                "including capabilities, components, tags, and template binding metadata "
                "used by ObjectLink-aware runtimes."
            ),
            steps=[
                GameAuthoringWorkflowStepContract(
                    step=1,
                    endpoint_id="game.objects.list",
                    goal="Read current object catalog for a world.",
                    consumes=["world_id"],
                    outputs=["object_ids"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=2,
                    endpoint_id="game.objects.create",
                    goal="Create object entries with object_kind, capabilities, components, tags, and template_binding.",
                    consumes=["world_id"],
                    outputs=["object_id"],
                    optional=True,
                ),
                GameAuthoringWorkflowStepContract(
                    step=3,
                    endpoint_id="game.objects.put",
                    goal="Apply deterministic full updates to existing objects.",
                    consumes=["object_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=4,
                    endpoint_id="game.objects.patch",
                    goal="Apply partial updates (e.g. add capabilities or tags) without full payload.",
                    consumes=["object_id"],
                    optional=True,
                ),
                GameAuthoringWorkflowStepContract(
                    step=5,
                    endpoint_id="game.objects.patch_binding",
                    goal="Update binding metadata (runtime_kind, mapping_id, link_id) independently.",
                    consumes=["object_id"],
                    optional=True,
                ),
            ],
        ),
        GameAuthoringWorkflowContract(
            id="snapshot_iteration_loop",
            label="Snapshot Iteration Loop",
            description=(
                "Fast idempotent loop for agent-driven edits: export current world, "
                "overwrite same snapshot, keep history deterministic."
            ),
            steps=[
                GameAuthoringWorkflowStepContract(
                    step=1,
                    endpoint_id="game.projects.list_snapshots",
                    goal="Resolve existing snapshot id by project name.",
                    outputs=["overwrite_project_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=2,
                    endpoint_id="game.worlds.export_project",
                    goal="Export updated world bundle.",
                    consumes=["world_id"],
                    outputs=["bundle"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=3,
                    endpoint_id="game.projects.save_snapshot",
                    goal="Overwrite snapshot id for deterministic updates.",
                    consumes=["bundle", "overwrite_project_id", "world_id"],
                    outputs=["project_id"],
                ),
            ],
        ),
        GameAuthoringWorkflowContract(
            id="import_and_playtest",
            label="Import And Playtest",
            description="Create an isolated playable world from a saved snapshot for QA/playtest.",
            steps=[
                GameAuthoringWorkflowStepContract(
                    step=1,
                    endpoint_id="game.projects.list_snapshots",
                    goal="Find source snapshot to import.",
                    outputs=["project_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=2,
                    endpoint_id="game.projects.import_snapshot",
                    goal="Import snapshot into a new world.",
                    consumes=["project_id"],
                    outputs=["world_id"],
                ),
                GameAuthoringWorkflowStepContract(
                    step=3,
                    endpoint_id="game.sessions.create",
                    goal="Create session and verify runtime starts cleanly.",
                    consumes=["world_id"],
                    outputs=["session_id"],
                ),
            ],
        ),
    ]

    seed_profiles = [
        GameSeedProfileContract(
            id="bananza_boat_slice_v1",
            label="Bananza Boat API Seed",
            defaults={
                "world_name": "Bananza Boat",
                "project_name": "Bananza Boat Seed Project",
                "sync_mode": "two_way",
                "mode": "api",
            },
            required_content_checks=[
                "required_blocks_available",
                "required_templates_available",
                "registered_source_packs_match_project_meta",
            ],
            cli_example=(
                "python -m scripts.seeds.game.bananza.cli --mode api "
                "--world-name \"Bananza Boat\" --project-name \"Bananza Boat Seed Project\""
            ),
            notes=[
                "Seeder now treats content packs as authority; it no longer authors primitive/template definitions inline.",
                "Project snapshot dedupe uses name + overwrite semantics to keep reruns deterministic.",
                "Use --prune-duplicate-projects to clean legacy duplicate snapshots.",
            ],
        ),
    ]

    idempotency = [
        GameAuthoringIdempotencyRuleContract(
            scope="game.worlds.create",
            behavior="Not inherently idempotent; repeated calls can create duplicate world names.",
            recommendation="Call game.worlds.list first and reuse a matching world_id when possible.",
        ),
        GameAuthoringIdempotencyRuleContract(
            scope="game.projects.save_snapshot",
            behavior="Idempotent when overwrite_project_id is provided.",
            recommendation="Resolve snapshot id by project name and always overwrite that id in agent loops.",
        ),
        GameAuthoringIdempotencyRuleContract(
            scope="game.behavior.update",
            behavior="Idempotent for equivalent config payloads.",
            recommendation="Run game.behavior.validate first and write normalized config only.",
        ),
    ]

    if audience_filter is not None:
        workflows = [w for w in workflows if audience_filter in w.audience]
        seed_profiles = [p for p in seed_profiles if audience_filter in p.audience]

    return GameAuthoringContractResponse(
        version=GAME_AUTHORING_CONTRACT_VERSION,
        endpoint="/api/v1/game/meta/authoring-contract",
        summary=(
            "Canonical API contract for AI-agent world/bootstrap/snapshot workflows, "
            "including Bananza seed profile guidance."
        ),
        endpoints=endpoints,
        workflows=workflows,
        discovered_projects=discovered_projects,
        seed_profiles=seed_profiles,
        idempotency=idempotency,
        streamlining_recommendations=[
            "Use snapshot-first iteration: export world bundle, then save with overwrite_project_id.",
            "Pin project content packs in world meta before behavior authoring to avoid primitive drift.",
            "Treat behavior validation as a preflight gate in every automated write cycle.",
            "For 3D room orientation, prefer room-navigation PATCH ops instead of rewriting full location.meta blobs.",
            "Use room-navigation transition-cache endpoints for generation cache persistence instead of generic location meta writes.",
            "For 2D character staging, use npc-slots-2d endpoints instead of generic location meta writes.",
            "Prefer /game/objects endpoints over raw item writes when authoring generic object_kind + template_binding metadata.",
            "After import/bootstrap, immediately create a session to catch runtime regressions early.",
            "Keep project names deterministic so agents can resume and update instead of duplicating.",
            "Prefer discovered_projects to resume existing projects (Bananza and future seeds) before creating new ones.",
        ],
    )
