"""
App Map Snapshot v2 - assembly logic.

Builds the backend-served App Map snapshot used by dev tooling.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
from typing import Any, List, Tuple

from .dev_architecture import (
    discover_capabilities,
    discover_plugin_manifests,
    discover_routes,
    discover_services,
)
from .dev_app_map_contract import (
    AppMapBackendSnapshot,
    AppMapBackendSource,
    AppMapDriftWarning,
    AppMapExternalRegistryEntry,
    AppMapExternalRegistrySource,
    AppMapFeatureEntry,
    AppMapFrontendRegistries,
    AppMapFrontendSnapshot,
    AppMapFrontendSource,
    AppMapLink,
    AppMapSnapshotMetrics,
    AppMapSnapshotSources,
    AppMapSnapshotV2,
)


_FRONTEND_ARTIFACT_PATH = "docs/app_map.generated.json"
_EXTERNAL_REGISTRY_MANIFEST_PATH = "docs/app_map.external_registries.json"
_STALE_THRESHOLD_HOURS = 72


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_path_candidates(relative_path: str) -> List[Path]:
    return [
        Path(relative_path),
        Path("..") / relative_path,
        Path.cwd() / relative_path,
    ]


def _load_json_from_candidates(relative_path: str) -> Tuple[dict[str, Any] | None, str]:
    for candidate in _resolve_path_candidates(relative_path):
        if not candidate.exists():
            continue
        try:
            with open(candidate, "r", encoding="utf-8") as f:
                return json.load(f), str(candidate)
        except (json.JSONDecodeError, OSError):
            continue
    return None, relative_path


def _normalize_format(value: str | None) -> str:
    normalized = (value or "other").strip().lower()
    if normalized in {"json", "yaml", "toml", "ts", "md"}:
        return normalized
    return "other"


def _safe_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def _string_list_or_none(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    parsed = [str(item).strip() for item in value if str(item).strip()]
    return parsed or None


def load_external_registries() -> tuple[list[AppMapExternalRegistryEntry], list[AppMapDriftWarning]]:
    warnings: list[AppMapDriftWarning] = []
    raw, _ = _load_json_from_candidates(_EXTERNAL_REGISTRY_MANIFEST_PATH)
    if raw is None:
        return [], warnings

    raw_items = raw.get("registries", [])
    if not isinstance(raw_items, list):
        warnings.append(AppMapDriftWarning(
            code="external_registry_manifest_invalid",
            message=f"{_EXTERNAL_REGISTRY_MANIFEST_PATH} must contain a 'registries' array.",
            severity="warning",
        ))
        return [], warnings

    items: list[AppMapExternalRegistryEntry] = []
    for entry in raw_items:
        if not isinstance(entry, dict):
            continue

        registry_id = str(entry.get("id", "")).strip()
        if not registry_id:
            continue

        registry_path = str(entry.get("path", "")).strip()
        if not registry_path:
            continue

        resolved = Path(registry_path)
        if not resolved.is_absolute():
            resolved = Path.cwd() / registry_path

        exists = resolved.exists()
        last_modified: str | None = None
        if exists:
            try:
                last_modified = datetime.fromtimestamp(
                    resolved.stat().st_mtime,
                    tz=timezone.utc,
                ).isoformat()
            except OSError:
                last_modified = None

        items.append(AppMapExternalRegistryEntry(
            id=registry_id,
            label=str(entry.get("label") or registry_id),
            path=registry_path,
            format=_normalize_format(entry.get("format")),
            owner=str(entry.get("owner", "")).strip() or None,
            description=str(entry.get("description", "")).strip() or None,
            last_modified=last_modified,
            exists=exists,
        ))

    items.sort(key=lambda item: item.id)
    return items, warnings


def _load_frontend_artifact() -> tuple[AppMapFrontendSnapshot, AppMapFrontendSource, list[AppMapDriftWarning]]:
    warnings: list[AppMapDriftWarning] = []
    raw, resolved_path = _load_json_from_candidates(_FRONTEND_ARTIFACT_PATH)

    if raw is None:
        warnings.append(AppMapDriftWarning(
            code="frontend_artifact_missing",
            message="app_map.generated.json not found. Run: pnpm docs:app-map",
            severity="warning",
        ))
        return (
            AppMapFrontendSnapshot(
                entries=[],
                registries=AppMapFrontendRegistries(),
            ),
            AppMapFrontendSource(
                kind="missing",
                path=_FRONTEND_ARTIFACT_PATH,
                generated_at=None,
            ),
            warnings,
        )

    generated_at = raw.get("generatedAt")
    if isinstance(generated_at, str) and generated_at:
        try:
            generated_dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - generated_dt).total_seconds() / 3600
            if age_hours > _STALE_THRESHOLD_HOURS:
                warnings.append(AppMapDriftWarning(
                    code="frontend_artifact_stale",
                    message=(
                        f"app_map.generated.json is {int(age_hours)}h old "
                        f"(threshold: {_STALE_THRESHOLD_HOURS}h). Run: pnpm docs:app-map"
                    ),
                    severity="warning",
                ))
        except (TypeError, ValueError):
            pass

    entries: list[AppMapFeatureEntry] = []
    for item in raw.get("entries", []):
        if not isinstance(item, dict):
            continue
        try:
            entries.append(AppMapFeatureEntry.model_validate(item))
        except Exception:
            entry_id = str(item.get("id", "<unknown>"))
            warnings.append(AppMapDriftWarning(
                code="frontend_entry_invalid",
                message=f"Invalid frontend app map entry skipped: {entry_id}",
                severity="warning",
            ))

    registries = AppMapFrontendRegistries(
        actions=[{
            "id": str(item.get("id", "")),
            "title": str(item.get("title", "")),
            "featureId": str(item.get("featureId", "")) or None,
            "description": item.get("description"),
            "icon": item.get("icon"),
            "shortcut": item.get("shortcut"),
            "route": item.get("route"),
            "visibility": item.get("visibility"),
            "contexts": _string_list_or_none(item.get("contexts")),
            "category": item.get("category"),
            "tags": _string_list_or_none(item.get("tags")),
            "sources": _string_list_or_none(item.get("sources")),
        } for item in raw.get("actions", []) if isinstance(item, dict) and item.get("id") and item.get("title")],
        panels=[{
            "id": str(item.get("id", "")),
            "title": str(item.get("title", "")),
            "updatedAt": item.get("updatedAt"),
            "changeNote": item.get("changeNote"),
            "featureHighlights": _string_list_or_none(item.get("featureHighlights")),
            "category": item.get("category"),
            "source": item.get("source"),
            "description": item.get("description"),
        } for item in raw.get("panels", []) if isinstance(item, dict) and item.get("id") and item.get("title")],
        modules=[{
            "id": str(item.get("id", "")),
            "name": str(item.get("name", "")),
            "updatedAt": item.get("updatedAt"),
            "changeNote": item.get("changeNote"),
            "featureHighlights": _string_list_or_none(item.get("featureHighlights")),
            "route": item.get("route"),
            "source": item.get("source"),
        } for item in raw.get("modules", []) if isinstance(item, dict) and item.get("id") and item.get("name")],
        stores=[{
            "name": str(item.get("name", "")),
            "feature": str(item.get("feature", "")),
            "source": str(item.get("source", "")),
        } for item in raw.get("stores", []) if isinstance(item, dict) and item.get("name") and item.get("feature") and item.get("source")],
        hooks=[{
            "name": str(item.get("name", "")),
            "feature": str(item.get("feature", "")),
            "source": str(item.get("source", "")),
        } for item in raw.get("hooks", []) if isinstance(item, dict) and item.get("name") and item.get("feature") and item.get("source")],
    )

    snapshot = AppMapFrontendSnapshot(entries=entries, registries=registries)
    source = AppMapFrontendSource(
        kind="generated_artifact",
        path=_safe_relative(Path(resolved_path)) if Path(resolved_path).exists() else _FRONTEND_ARTIFACT_PATH,
        generated_at=generated_at if isinstance(generated_at, str) else None,
    )
    return snapshot, source, warnings


def _discover_backend_snapshot() -> tuple[AppMapBackendSnapshot, AppMapBackendSource]:
    now = _utc_now_iso()
    backend = AppMapBackendSnapshot(
        routes=discover_routes(),
        plugins=discover_plugin_manifests(),
        services=discover_services(),
        capability_apis=discover_capabilities(),
    )
    source = AppMapBackendSource(generated_at=now)
    return backend, source


def _build_links(frontend: AppMapFrontendSnapshot, backend: AppMapBackendSnapshot) -> list[AppMapLink]:
    links: list[AppMapLink] = []
    backend_route_paths = {route.path for route in backend.routes}

    for entry in frontend.entries:
        for route in entry.routes or []:
            api_path = f"/api/v1{route}"
            status = "resolved" if api_path in backend_route_paths else "unresolved"
            links.append(AppMapLink(**{
                "from": f"frontend:{entry.id}",
                "to": f"route:{api_path}",
                "kind": "frontend_to_backend",
                "status": status,
            }))

        for ref in entry.backend or []:
            last_segment = ref.rsplit(".", 1)[-1] if "." in ref else ref
            has_matching_tag = any(last_segment in route.tags for route in backend.routes)
            status = "resolved" if has_matching_tag else "unresolved"
            links.append(AppMapLink(**{
                "from": f"frontend:{entry.id}",
                "to": f"backend:{ref}",
                "kind": "frontend_to_backend",
                "status": status,
            }))

    return links


def build_app_map_snapshot() -> AppMapSnapshotV2:
    frontend, frontend_source, warnings = _load_frontend_artifact()
    backend, backend_source = _discover_backend_snapshot()
    external_registries, external_warnings = load_external_registries()
    warnings.extend(external_warnings)

    frontend.registries.external = external_registries

    links = _build_links(frontend, backend)
    metrics = AppMapSnapshotMetrics(
        total_frontend_features=len(frontend.entries),
        total_actions=len(frontend.registries.actions),
        total_backend_routes=len(backend.routes),
        total_panels=len(frontend.registries.panels),
        total_modules=len(frontend.registries.modules),
        total_stores=len(frontend.registries.stores),
        total_hooks=len(frontend.registries.hooks),
        total_external_registries=len(frontend.registries.external),
        drift_warnings=warnings,
    )

    return AppMapSnapshotV2(
        generated_at=_utc_now_iso(),
        sources=AppMapSnapshotSources(
            frontend=frontend_source,
            backend=backend_source,
            external_registries=AppMapExternalRegistrySource(path=_EXTERNAL_REGISTRY_MANIFEST_PATH),
        ),
        frontend=frontend,
        backend=backend,
        links=links,
        metrics=metrics,
    )
