"""
Architecture Graph v1 — Assembly logic.

Combines frontend generated artifact + backend runtime introspection
into the canonical ArchitectureGraphV1 payload.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List

from .dev_architecture import (
    discover_capabilities,
    discover_plugin_manifests,
    discover_routes,
    discover_services,
    load_frontend_app_map,
)
from .dev_architecture_contract import (
    ArchitectureGraphBackend,
    ArchitectureGraphFrontend,
    ArchitectureGraphMetrics,
    ArchitectureGraphSources,
    ArchitectureGraphV1,
    ArchitectureLink,
    BackendSourceInfo,
    DriftWarning,
    FrontendSourceInfo,
)


_FRONTEND_ARTIFACT_PATH = "docs/app_map.generated.json"
_STALE_THRESHOLD_HOURS = 72


def load_frontend_source() -> tuple[ArchitectureGraphFrontend, FrontendSourceInfo, list[DriftWarning]]:
    """Load frontend entries from the generated artifact and produce source metadata."""
    warnings: list[DriftWarning] = []
    raw = load_frontend_app_map()

    if raw.get("error"):
        # Artifact missing or unreadable
        warnings.append(DriftWarning(
            code="frontend_artifact_missing",
            message=raw["error"],
            severity="warning",
        ))
        return (
            ArchitectureGraphFrontend(entries=[]),
            FrontendSourceInfo(kind="fallback_local", path=_FRONTEND_ARTIFACT_PATH, generated_at=None),
            warnings,
        )

    generated_at = raw.get("generatedAt")

    # Check staleness
    if generated_at:
        try:
            gen_dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - gen_dt).total_seconds() / 3600
            if age_hours > _STALE_THRESHOLD_HOURS:
                warnings.append(DriftWarning(
                    code="frontend_artifact_stale",
                    message=f"app_map.generated.json is {int(age_hours)}h old (threshold: {_STALE_THRESHOLD_HOURS}h). Run: pnpm docs:app-map",
                    severity="warning",
                ))
        except (ValueError, TypeError):
            pass

    entries = raw.get("entries", [])
    return (
        ArchitectureGraphFrontend(entries=entries),
        FrontendSourceInfo(kind="generated_artifact", path=_FRONTEND_ARTIFACT_PATH, generated_at=generated_at),
        warnings,
    )


def discover_backend_source() -> tuple[ArchitectureGraphBackend, BackendSourceInfo]:
    """Collect all backend discovery data into the graph backend section."""
    now = datetime.now(timezone.utc).isoformat()

    routes = discover_routes()
    capabilities = discover_capabilities()
    services = discover_services()
    plugins = discover_plugin_manifests()

    backend = ArchitectureGraphBackend(
        routes=routes,
        capability_apis=capabilities,
        services=services,
        plugins=plugins,
    )
    source = BackendSourceInfo(generated_at=now)
    return backend, source


def build_links(
    frontend: ArchitectureGraphFrontend,
    backend: ArchitectureGraphBackend,
) -> List[ArchitectureLink]:
    """Derive cross-domain links between frontend features and backend routes/services."""
    links: List[ArchitectureLink] = []

    # Build a set of backend route paths for quick lookup
    backend_route_paths = {r.path for r in backend.routes}

    for entry in frontend.entries:
        # Link frontend routes to backend routes
        for route in entry.routes or []:
            # Frontend routes are UI paths; check if a matching API path exists
            api_path = f"/api/v1{route}"
            status = "resolved" if api_path in backend_route_paths else "unresolved"
            links.append(ArchitectureLink(**{
                "from": f"frontend:{entry.id}",
                "to": f"route:{api_path}",
                "kind": "frontend_to_backend",
                "status": status,
            }))

        # Link frontend backend refs to services
        for ref in entry.backend or []:
            # Backend refs look like "pixsim7.backend.main.api.v1.assets"
            # Check if any route tag matches the last segment
            last_segment = ref.rsplit(".", 1)[-1] if "." in ref else ref
            has_matching_tag = any(
                last_segment in r.tags
                for r in backend.routes
            )
            status = "resolved" if has_matching_tag else "unresolved"
            links.append(ArchitectureLink(**{
                "from": f"frontend:{entry.id}",
                "to": f"backend:{ref}",
                "kind": "frontend_to_backend",
                "status": status,
            }))

    return links


def build_metrics(
    frontend: ArchitectureGraphFrontend,
    backend: ArchitectureGraphBackend,
    warnings: List[DriftWarning],
) -> ArchitectureGraphMetrics:
    """Compute aggregate metrics."""
    return ArchitectureGraphMetrics(
        total_frontend_features=len(frontend.entries),
        total_backend_routes=len(backend.routes),
        drift_warnings=warnings,
    )


def build_architecture_graph() -> ArchitectureGraphV1:
    """Assemble the full architecture graph payload."""
    frontend, frontend_source, warnings = load_frontend_source()
    backend, backend_source = discover_backend_source()

    links = build_links(frontend, backend)
    metrics = build_metrics(frontend, backend, warnings)

    return ArchitectureGraphV1(
        generated_at=datetime.now(timezone.utc).isoformat(),
        sources=ArchitectureGraphSources(
            frontend=frontend_source,
            backend=backend_source,
        ),
        frontend=frontend,
        backend=backend,
        links=links,
        metrics=metrics,
    )
