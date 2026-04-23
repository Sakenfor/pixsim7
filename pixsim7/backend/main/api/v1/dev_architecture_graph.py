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
    CapabilityNode,
    DriftWarning,
    FrontendSourceInfo,
    RegistryDescriptor,
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
    registry_descriptors = build_registry_descriptors(routes, capabilities, services, plugins)
    runtime_registries = build_runtime_registry_descriptors()

    backend = ArchitectureGraphBackend(
        routes=routes,
        capability_apis=capabilities,
        services=services,
        plugins=plugins,
        registries=registry_descriptors,
        registry_descriptors=registry_descriptors,
        runtime_registries=runtime_registries,
    )
    source = BackendSourceInfo(generated_at=now)
    return backend, source


def build_registry_descriptors(
    routes: list[dict[str, Any]],
    capabilities: list[dict[str, Any]],
    services: list[dict[str, Any]],
    plugins: list[dict[str, Any]],
) -> list[RegistryDescriptor]:
    """Build coarse registry descriptors for backend architecture views."""
    registries: list[RegistryDescriptor] = [
        RegistryDescriptor(
            id="routes",
            name="Route Registry",
            category="routes",
            backing_source="fastapi-runtime-introspection",
            layer="backend",
            scope="catalog",
            update_mode="snapshot",
            item_count=len(routes),
            description="All discovered FastAPI routes.",
        ),
        RegistryDescriptor(
            id="capability-apis",
            name="Capability API Registry",
            category="capabilities",
            backing_source="capability-manifest",
            layer="backend",
            scope="catalog",
            update_mode="snapshot",
            item_count=len(capabilities),
            description="Capability APIs exposed through plugin context.",
        ),
        RegistryDescriptor(
            id="services",
            name="Service Manifest Registry",
            category="services",
            backing_source="service-manifest",
            layer="backend",
            scope="catalog",
            update_mode="snapshot",
            item_count=len(services),
            description="Backend service composition manifest entries.",
        ),
        RegistryDescriptor(
            id="backend-plugins",
            name="Backend Plugin Manifest Registry",
            category="plugins",
            backing_source="route-manifests",
            layer="backend",
            scope="catalog",
            update_mode="snapshot",
            item_count=len(plugins),
            description="Backend route plugins discovered from manifest.py files.",
        ),
    ]

    by_kind: dict[str, int] = {}
    for plugin in plugins:
        kind = str(plugin.get("kind") or "unknown")
        by_kind[kind] = by_kind.get(kind, 0) + 1

    for kind in sorted(by_kind.keys()):
        registries.append(
            RegistryDescriptor(
                id=f"backend-plugins:{kind}",
                name=f"Backend Plugins ({kind})",
                category="plugins",
                backing_source="route-manifests",
                layer="backend",
                scope="catalog",
                update_mode="snapshot",
                item_count=by_kind[kind],
                family=kind,
                description=f"Backend route plugins grouped by kind={kind}.",
            )
        )

    return registries


def build_runtime_registry_descriptors() -> list[RegistryDescriptor]:
    """Runtime registries are currently frontend-local and not backend-introspected."""
    return []


def build_capability_nodes(
    frontend: ArchitectureGraphFrontend,
    backend: ArchitectureGraphBackend,
) -> list[CapabilityNode]:
    """Build capability nodes so dep graphs can distinguish capabilities vs feature nodes."""
    nodes: dict[str, CapabilityNode] = {}

    frontend_feature_ids = {entry.id for entry in frontend.entries}

    for capability in backend.capability_apis:
        node_id = f"capability:{capability.name}"
        nodes[node_id] = CapabilityNode(
            id=node_id,
            label=capability.name,
            category="feature_capability",
            owner=capability.category,
            source="backend.capability_apis",
        )

    for plugin in backend.plugins:
        for provided in plugin.provides_capabilities:
            node_id = f"capability:{provided}"
            if node_id in nodes:
                continue
            nodes[node_id] = CapabilityNode(
                id=node_id,
                label=provided,
                category="plugin_capability",
                owner=plugin.id,
                source="backend.plugins",
            )

        for feature_id in plugin.provides_features:
            if feature_id not in frontend_feature_ids:
                continue
            node_id = f"feature-capability:{feature_id}"
            if node_id in nodes:
                continue
            nodes[node_id] = CapabilityNode(
                id=node_id,
                label=feature_id,
                category="feature_capability",
                owner=plugin.id,
                source="backend.plugins",
            )

    return [nodes[key] for key in sorted(nodes.keys())]


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

    # Link backend plugins to declared capabilities and frontend features.
    frontend_feature_ids = {entry.id for entry in frontend.entries}
    seen_capability_links: set[tuple[str, str]] = set()
    for plugin in backend.plugins:
        plugin_ref = f"plugin:{plugin.id}"
        explicit_consumes = set(plugin.explicit_consumes_features or [])
        explicit_provides = set(plugin.explicit_provides_features or [])
        default_consumes = set(plugin.default_consumes_features or [])
        default_provides = set(plugin.default_provides_features or [])

        def _relation_sources(feature_id: str, direction: str) -> set[str]:
            sources: set[str] = set()
            if direction in {"consumes", "unknown"}:
                if feature_id in explicit_consumes:
                    sources.add("explicit")
                if feature_id in default_consumes:
                    sources.add("family_default")
            if direction in {"provides", "unknown"}:
                if feature_id in explicit_provides:
                    sources.add("explicit")
                if feature_id in default_provides:
                    sources.add("family_default")
            return sources

        for capability in plugin.provides_capabilities:
            to_ref = f"capability:{capability}"
            key = (plugin_ref, to_ref)
            if key in seen_capability_links:
                continue
            seen_capability_links.add(key)
            links.append(ArchitectureLink(**{
                "from": plugin_ref,
                "to": to_ref,
                "kind": "plugin_to_capability",
                "status": "resolved",
                "direction": "provides",
            }))

        feature_directions: dict[str, set[str]] = {}
        for feature_id in plugin.consumes_features:
            if feature_id not in feature_directions:
                feature_directions[feature_id] = set()
            feature_directions[feature_id].add("consumes")
        for feature_id in plugin.provides_features:
            if feature_id not in feature_directions:
                feature_directions[feature_id] = set()
            feature_directions[feature_id].add("provides")

        for feature_id in sorted(feature_directions.keys()):
            to_ref = f"frontend:{feature_id}"
            direction_values = feature_directions[feature_id]
            direction = "unknown" if len(direction_values) != 1 else next(iter(direction_values))
            relation_sources = _relation_sources(feature_id, direction)
            relation_source = None
            if len(relation_sources) > 1:
                relation_source = "mixed"
            elif len(relation_sources) == 1:
                relation_source = next(iter(relation_sources))

            link_payload: Dict[str, Any] = {
                "from": plugin_ref,
                "to": to_ref,
                "kind": "plugin_to_feature",
                "status": "resolved" if feature_id in frontend_feature_ids else "unresolved",
                "direction": direction,
            }
            if relation_source is not None:
                link_payload["relation_source"] = relation_source
            links.append(ArchitectureLink(**{
                **link_payload,
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


def check_locator_bindings() -> List[DriftWarning]:
    """Emit warnings for expected capability bindings that aren't registered.

    Part of the `manifest-runtime-binding` plan: routes using
    `Depends(get_<capability>)` rely on `bind_default_capabilities()` having
    been called at startup. If the locator is missing an expected name, those
    routes would 500 at request time with KeyError. Surface it here so AppMap
    shows the drift before a user triggers the endpoint.
    """
    warnings: List[DriftWarning] = []
    try:
        from pixsim7.backend.main.infrastructure.plugins.capabilities.locator import (
            capability_locator,
            CAP_ANALYZER_REGISTRY,
        )
    except Exception as exc:
        return [DriftWarning(
            code="capability_locator.import_failed",
            message=f"Could not import capability locator: {exc}",
            severity="error",
        )]

    expected = [CAP_ANALYZER_REGISTRY]
    bound = capability_locator.list_bound()
    for name in expected:
        if name not in bound:
            warnings.append(DriftWarning(
                code="capability_locator.unbound",
                message=f"Expected capability '{name}' is not bound. Ensure bind_default_capabilities() ran during lifespan startup.",
                severity="warning",
            ))
    return warnings


def build_architecture_graph() -> ArchitectureGraphV1:
    """Assemble the full architecture graph payload."""
    frontend, frontend_source, warnings = load_frontend_source()
    backend, backend_source = discover_backend_source()
    warnings = warnings + check_locator_bindings()

    links = build_links(frontend, backend)
    capability_nodes = build_capability_nodes(frontend, backend)
    metrics = build_metrics(frontend, backend, warnings)

    return ArchitectureGraphV1(
        generated_at=datetime.now(timezone.utc).isoformat(),
        sources=ArchitectureGraphSources(
            frontend=frontend_source,
            backend=backend_source,
        ),
        frontend=frontend,
        backend=backend,
        capability_nodes=capability_nodes,
        links=links,
        metrics=metrics,
    )
