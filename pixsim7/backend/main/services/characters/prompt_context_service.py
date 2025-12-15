"""
Generalized prompt context resolution with resolver/enricher pattern.

Quick Start:
- Use `get_npc_prompt_context()` for NPCs (backward compatible)
- Use `get_prompt_context()` for generic entity resolution
- Register custom enrichers with `register_enricher(entity_type, enricher_fn)`
- Register resolvers for new entity types with `register_resolver(entity_type, resolver_fn)`

Example: Register an enricher to add relationship data
    async def add_relationships(snapshot, request):
        snapshot.extras["relationship_tier"] = "friendly"
        return snapshot

    service.register_enricher("npc", add_relationships)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import GameNPC, NPCState
from pixsim7.backend.main.domain.game.stats import StatEngine, create_stat_engine
from pixsim7.backend.main.services.characters.instance_service import (
    CharacterInstanceService,
)
from pixsim7.backend.main.services.characters.npc_sync_service import (
    CharacterNPCSyncService,
)
from pixsim7.backend.main.services.prompt_context.mapping import (
    FieldMapping,
    merge_field_mappings,
    set_nested_value,
    get_nested_value,
)
from pixsim7.backend.main.services.characters.npc_prompt_mapping import (
    get_npc_field_mapping,
)

# -------------------------------------------------------------------------------------------------
# Generic context types
# -------------------------------------------------------------------------------------------------


@dataclass
class PromptContextSnapshot:
    """Generic prompt context snapshot for any entity type.

    Fields are intentionally minimal so other entity types (props, locations, buildings) can reuse
    the same structure.
    """

    entity_type: str
    template_id: Optional[str]  # Authoring template/instance identifier (UUID/stringified)
    runtime_id: Optional[str]   # Live/runtime instance identifier
    name: str

    # Authoring traits / personality (typically from template/instance)
    traits: Dict[str, Any] = field(default_factory=dict)

    # Runtime state (typically from live instance)
    state: Dict[str, Any] = field(default_factory=dict)
    location_id: Optional[int] = None

    # Metadata
    source: Literal["live", "snapshot", "merged"] = "snapshot"
    world_id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Return a simple dict for template substitution."""
        return {
            "entity_type": self.entity_type,
            "template_id": self.template_id,
            "runtime_id": self.runtime_id,
            "name": self.name,
            "traits": self.traits,
            "state": self.state,
            "location_id": self.location_id,
            "source": self.source,
            "world_id": self.world_id,
        }


@dataclass
class PromptContextRequest:
    """Generic request for prompt context resolution."""

    entity_type: str
    template_id: Optional[str] = None
    runtime_id: Optional[str] = None
    prefer_live: bool = True


class EntityContextResolver(Protocol):
    async def resolve(self, request: PromptContextRequest) -> PromptContextSnapshot:
        ...


# Type alias for enricher functions
EnricherFn = Callable[[PromptContextSnapshot, PromptContextRequest], Awaitable[PromptContextSnapshot]]


# -------------------------------------------------------------------------------------------------
# NPC resolver (implements the generic protocol)
# -------------------------------------------------------------------------------------------------


class _NpcContextResolver:
    """Resolve prompt context for NPCs using declarative field mapping and StatEngine."""

    def __init__(
        self,
        db: AsyncSession,
        instance_service: CharacterInstanceService,
        sync_service: CharacterNPCSyncService,
        stat_engine: StatEngine,
        field_mapping: Optional[Dict[str, FieldMapping]] = None,
        mapping_overlay: Optional[Dict[str, FieldMapping]] = None,
    ):
        self.db = db
        self.instance_service = instance_service
        self.sync_service = sync_service
        self.stat_engine = stat_engine

        # Merge base mapping with optional overlay (plugins, links, etc.)
        base_mapping = field_mapping or get_npc_field_mapping()
        self.field_mapping = merge_field_mappings(base_mapping, mapping_overlay)

    async def resolve(self, request: PromptContextRequest) -> PromptContextSnapshot:
        instance_id: Optional[UUID] = (
            UUID(request.template_id) if request.template_id else None
        )
        npc_id: Optional[int] = int(request.runtime_id) if request.runtime_id else None

        if not instance_id:
            raise ValueError("NPC prompt context requires template_id (CharacterInstance id)")

        # 1. Load instance + NPC
        instance = await self.instance_service.get_instance(instance_id)
        if not instance:
            raise ValueError(f"CharacterInstance {instance_id} not found")

        merged_traits = await self.instance_service.get_merged_traits(instance_id)

        # 2. Resolve NPC (supports both CharacterNPCLink and generic ObjectLink)
        npc: Optional[GameNPC] = None
        npc_state: Optional[NPCState] = None
        resolved_npc_id = npc_id

        if resolved_npc_id:
            # Direct runtime ID provided
            npc = await self.db.get(GameNPC, resolved_npc_id)
        else:
            # Resolve via links (try CharacterNPCLink first, then ObjectLink)
            # 1. Try CharacterNPCLink (legacy/existing)
            links = await self.sync_service.get_links_for_instance(instance_id)
            active_links = [l for l in links if l.sync_enabled]

            if active_links:
                active_links.sort(key=lambda l: l.priority or 0, reverse=True)
                resolved_npc_id = active_links[0].npc_id
                npc = await self.db.get(GameNPC, resolved_npc_id)
            else:
                # 2. Try generic ObjectLink
                try:
                    from services.links.link_service import LinkService
                    link_service = LinkService(self.db)

                    # Get active link for this character template
                    object_links = await link_service.get_links_for_template(
                        'character',
                        str(instance_id)
                    )

                    # Filter to NPC links only
                    npc_links = [l for l in object_links if l.runtime_kind == 'npc' and l.sync_enabled]

                    if npc_links:
                        # Sort by priority, pick highest
                        npc_links.sort(key=lambda l: l.priority or 0, reverse=True)
                        resolved_npc_id = npc_links[0].runtime_id
                        npc = await self.db.get(GameNPC, resolved_npc_id)
                except ImportError:
                    # ObjectLink system not available yet, skip
                    pass

        if npc:
            npc_state = await self.db.get(NPCState, npc.id)

        # 3. Build snapshot via generic field mapping
        snapshot_data: Dict[str, Any] = {}

        # Apply field mappings using generic setter
        for field_key, mapping in self.field_mapping.items():
            value = await self._resolve_field(
                mapping,
                instance,
                merged_traits,
                npc,
                npc_state,
                request.prefer_live
            )

            if value is not None:
                # Apply transform if provided
                if mapping.transform:
                    context = {
                        "instance": instance,
                        "npc": npc,
                        "npc_state": npc_state,
                        "prefer_live": request.prefer_live,
                    }
                    value = mapping.transform(value, context)

                # Set value at target path (entity-agnostic)
                set_nested_value(snapshot_data, mapping.target_path, value)

        # 4. Normalize personality via StatEngine
        traits = snapshot_data.get("traits", {})
        if traits:
            personality_stats = await self._normalize_personality(traits)
            # Merge normalized stats back into traits
            traits.update(personality_stats)
            snapshot_data["traits"] = traits

        # 5. Determine source
        if npc and request.prefer_live:
            source: Literal["live", "snapshot", "merged"] = "live"
        elif npc:
            source = "merged"
        else:
            source = "snapshot"

        # 6. Build snapshot from accumulator
        return PromptContextSnapshot(
            entity_type="npc",
            template_id=str(instance_id),
            runtime_id=str(npc.id) if npc else None,
            name=snapshot_data.get("name", instance.name),
            traits=snapshot_data.get("traits", {}),
            state=snapshot_data.get("state", {}),
            location_id=snapshot_data.get("location_id"),
            source=source,
            world_id=getattr(instance, "world_id", None),
        )

    async def _resolve_field(
        self,
        mapping: FieldMapping,
        instance: Any,
        merged_traits: Dict[str, Any],
        npc: Optional[GameNPC],
        npc_state: Optional[NPCState],
        prefer_live: bool,
    ) -> Any:
        """Resolve a single field using mapping authority and fallback."""

        # Determine primary and fallback sources based on mapping
        if mapping.source == "instance":
            primary_source = "instance"
            fallback_source = mapping.fallback
        elif mapping.source == "npc":
            primary_source = "npc"
            fallback_source = mapping.fallback
        else:  # "both"
            primary_source = "npc" if (npc and prefer_live) else "instance"
            fallback_source = "npc" if primary_source == "instance" else "instance"

        # Try primary source
        value = None
        if primary_source == "instance" and mapping.instance_path:
            value = get_nested_value(merged_traits, mapping.instance_path)
        elif primary_source == "npc" and mapping.npc_path:
            if npc:
                if mapping.npc_path == "current_location_id" and npc_state:
                    value = getattr(npc_state, "current_location_id", None)
                elif mapping.npc_path.startswith("state.") and npc_state:
                    state_key = mapping.npc_path.split(".", 1)[1]
                    value = get_nested_value(npc_state.state or {}, state_key)
                elif mapping.npc_path == "name":
                    value = getattr(npc, "name", None)
                else:
                    value = get_nested_value(npc.personality or {}, mapping.npc_path)

        # Try fallback if primary failed
        if value is None and fallback_source != "none":
            if fallback_source == "instance" and mapping.instance_path:
                value = get_nested_value(merged_traits, mapping.instance_path)
            elif fallback_source == "npc" and mapping.npc_path and npc:
                if mapping.npc_path == "current_location_id" and npc_state:
                    value = getattr(npc_state, "current_location_id", None)
                elif mapping.npc_path.startswith("state.") and npc_state:
                    state_key = mapping.npc_path.split(".", 1)[1]
                    value = get_nested_value(npc_state.state or {}, state_key)
                elif mapping.npc_path == "name":
                    value = getattr(npc, "name", None)
                else:
                    value = get_nested_value(npc.personality or {}, mapping.npc_path)

        return value

    async def _normalize_personality(self, traits: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize personality traits via StatEngine using package registry."""
        from pixsim7.backend.main.domain.game.stats import get_stat_package

        # Collect stat axes that need normalization
        axes_by_package: Dict[str, List[str]] = {}

        for field_key, mapping in self.field_mapping.items():
            if mapping.stat_axis and mapping.stat_package_id:
                if mapping.stat_package_id not in axes_by_package:
                    axes_by_package[mapping.stat_package_id] = []
                axes_by_package[mapping.stat_package_id].append(mapping.stat_axis)

        # Normalize per package
        normalized_results = {}

        for package_id, axes in axes_by_package.items():
            # Resolve package via registry
            stat_package = get_stat_package(package_id)
            if not stat_package:
                # Handle missing package gracefully - skip normalization
                continue

            # Get the stat definition from the package
            # For personality package, the definition id is "personality"
            stat_def_id = package_id.split(".")[-1]  # e.g., "core.personality" -> "personality"
            stat_definition = stat_package.definitions.get(stat_def_id)
            if not stat_definition:
                continue

            # Extract raw axis values for this package
            raw_stats = {
                axis: traits[axis]
                for axis in axes
                if axis in traits and isinstance(traits[axis], (int, float))
            }

            if not raw_stats:
                continue

            # Normalize via StatEngine
            normalized = self.stat_engine.normalize_entity_stats(raw_stats, stat_definition)

            # Collect computed tier IDs (e.g., opennessTierId: "openness_high")
            normalized_results.update({
                k: v for k, v in normalized.items()
                if k.endswith("TierId") or k == "levelId"
            })

        return normalized_results


# -------------------------------------------------------------------------------------------------
# Generic service with registry
# -------------------------------------------------------------------------------------------------


class PromptContextService:
    """Generic prompt-context service with per-entity resolvers and enrichers.

    - Registry-driven: each entity type registers a resolver implementing EntityContextResolver.
    - Enricher pipeline: optional middleware functions that augment snapshots after resolution.
    - NPCs are registered by default; other types (props/locations/buildings) can be added later by
      calling register_resolver().
    """

    def __init__(
        self,
        db: AsyncSession,
        *,
        instance_service: Optional[CharacterInstanceService] = None,
        sync_service: Optional[CharacterNPCSyncService] = None,
        stat_engine: Optional[StatEngine] = None,
    ):
        """
        Initialize prompt context service with optional dependency injection.

        Args:
            db: Database session (required)
            instance_service: Character instance service (created if not provided)
            sync_service: NPC sync service (created if not provided)
            stat_engine: Stat computation engine (created if not provided)

        Why DI is optional:
        - Backward compatible with existing code
        - Tests can inject mocks for isolation
        - Allows future configuration (e.g., custom stat engine)
        """
        self.db = db
        self._resolvers: Dict[str, EntityContextResolver] = {}
        self._enrichers: Dict[str, List[EnricherFn]] = {}

        # Store injected or default dependencies
        self._instance_service = instance_service or CharacterInstanceService(db)
        self._sync_service = sync_service or CharacterNPCSyncService(db)
        self._stat_engine = stat_engine or create_stat_engine()

        # Link resolver for generic link resolution
        from pixsim7.backend.main.services.links.object_link_resolver import ObjectLinkResolver
        self.link_resolver = ObjectLinkResolver(db, self._stat_engine)

        # Register built-in resolver for NPCs with DI
        self._register_default_npc_resolver()

    def _register_default_npc_resolver(self):
        """Register NPC resolver using injected dependencies."""
        field_mapping = get_npc_field_mapping()

        npc_resolver = _NpcContextResolver(
            db=self.db,
            instance_service=self._instance_service,
            sync_service=self._sync_service,
            stat_engine=self._stat_engine,
            field_mapping=field_mapping,
        )

        self.register_resolver("npc", npc_resolver)

    def register_resolver(self, entity_type: str, resolver: EntityContextResolver) -> None:
        """Register or override a resolver for an entity type."""
        self._resolvers[entity_type] = resolver

    def register_enricher(self, entity_type: str, enricher: EnricherFn) -> None:
        """Register an enricher for an entity type. Enrichers run after the resolver."""
        if entity_type not in self._enrichers:
            self._enrichers[entity_type] = []
        self._enrichers[entity_type].append(enricher)

    async def get_prompt_context(self, request: PromptContextRequest) -> PromptContextSnapshot:
        """
        Resolve prompt context for any entity type.

        Flow:
        1. Look up resolver for entity_type
        2. Call resolver to get base snapshot
        3. Apply enrichers in order
        4. Return final snapshot
        """
        resolver = self._resolvers.get(request.entity_type)
        if not resolver:
            raise ValueError(f"No prompt context resolver registered for entity type '{request.entity_type}'")

        # 1. Resolve base snapshot
        snapshot = await resolver.resolve(request)

        # 2. Apply enrichers
        enrichers = self._enrichers.get(request.entity_type, [])
        for enricher in enrichers:
            snapshot = await enricher(snapshot, request)

        return snapshot

    # Backward-compatible NPC helper
    async def get_npc_prompt_context(
        self,
        instance_id: UUID,
        npc_id: Optional[int] = None,
        *,
        prefer_live: bool = True,
    ) -> PromptContextSnapshot:
        return await self.get_prompt_context(
            PromptContextRequest(
                entity_type="npc",
                template_id=str(instance_id),
                runtime_id=str(npc_id) if npc_id is not None else None,
                prefer_live=prefer_live,
            )
        )

    async def get_prompt_context_from_template(
        self,
        template_kind: str,
        template_id: str,
        *,
        runtime_id: Optional[str] = None,
        link_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        prefer_live: bool = True,
    ) -> PromptContextSnapshot:
        """
        Resolve prompt context from a template reference using ObjectLink.

        This method resolves template→runtime via ObjectLink and produces a snapshot
        using the generic resolver. Supports context-based link activation.

        Args:
            template_kind: Template entity kind (e.g., 'character', 'itemTemplate')
            template_id: Template entity ID (usually UUID)
            runtime_id: Optional explicit runtime ID (bypasses link resolution)
            link_id: Optional explicit link ID to use
            context: Runtime context for link activation (e.g., location, time)
            prefer_live: Prefer runtime values over template values

        Returns:
            PromptContextSnapshot with link-resolved data

        Example:
            # Resolve character template to active NPC
            snapshot = await service.get_prompt_context_from_template(
                template_kind='character',
                template_id='abc-123-uuid',
                context={'location': {'zone': 'downtown'}}
            )
        """
        try:
            from services.links.link_service import LinkService
            from services.links.mapping_registry import get_mapping_registry

            link_service = LinkService(self.db)
            mapping_registry = get_mapping_registry()

            # 1. Determine runtime entity kind from mapping ID
            # Try to find a registered mapping for this template kind
            runtime_kind = None
            for mapping_id in mapping_registry.list_mappings().keys():
                if mapping_id.startswith(f"{template_kind}->"):
                    # Extract runtime kind from "templateKind->runtimeKind"
                    runtime_kind = mapping_id.split('->')[-1]
                    break

            if not runtime_kind:
                raise ValueError(
                    f"No mapping found for template kind '{template_kind}'. "
                    f"Available mappings: {list(mapping_registry.list_mappings().keys())}"
                )

            # 2. Resolve runtime ID via ObjectLink (if not explicitly provided)
            resolved_runtime_id = runtime_id

            if not resolved_runtime_id:
                if link_id:
                    # Use explicit link ID
                    from uuid import UUID as UUIDType
                    link = await link_service.get_link(UUIDType(link_id))
                    if link:
                        resolved_runtime_id = str(link.runtime_id)
                else:
                    # Find active link for this template
                    if context:
                        # Context-aware resolution
                        # Get all links for template, filter by activation
                        links = await link_service.get_links_for_template(
                            template_kind,
                            template_id
                        )
                        # TODO: Use activation.filter_active_links once imported
                        # For now, just pick highest priority link
                        active_links = [l for l in links if l.sync_enabled]
                        if active_links:
                            active_links.sort(key=lambda l: l.priority or 0, reverse=True)
                            resolved_runtime_id = str(active_links[0].runtime_id)
                    else:
                        # Simple highest-priority resolution
                        links = await link_service.get_links_for_template(
                            template_kind,
                            template_id
                        )
                        active_links = [l for l in links if l.sync_enabled]
                        if active_links:
                            active_links.sort(key=lambda l: l.priority or 0, reverse=True)
                            resolved_runtime_id = str(active_links[0].runtime_id)

            # 3. Build request for generic resolver
            request = PromptContextRequest(
                entity_type=runtime_kind,
                template_id=template_id,
                runtime_id=resolved_runtime_id,
                prefer_live=prefer_live,
            )

            # 4. Resolve via registered resolver
            return await self.get_prompt_context(request)

        except ImportError:
            raise ValueError(
                "Generic ObjectLink system not available. "
                "Use get_npc_prompt_context() for NPC resolution."
            )

    async def get_prompt_context_from_link(
        self,
        template_kind: str,
        template_id: str,
        context: Optional[Dict] = None
    ) -> PromptContextSnapshot:
        """Get prompt context via generic ObjectLink resolution (NEW API)

        This is the new generic API that uses ObjectLinkResolver.
        Use for any entity type with cleaner, simpler implementation.

        For backward compatibility, use get_npc_prompt_context() for NPCs.

        Args:
            template_kind: Template entity type (e.g., 'character', 'itemTemplate')
            template_id: Template entity ID
            context: Optional context for link activation

        Returns:
            PromptContextSnapshot with resolved data

        Example:
            snapshot = await service.get_prompt_context_from_link(
                'character',
                'abc-123-uuid',
                context={'location.zone': 'downtown'}
            )
        """
        resolved_data = await self.link_resolver.resolve_prompt_context(
            template_kind,
            template_id,
            context
        )

        # Convert to PromptContextSnapshot
        return PromptContextSnapshot(
            entity_type=template_kind,
            template_id=template_id,
            name=resolved_data.get('name', 'Unknown'),
            traits=resolved_data.get('traits', {}),
            state=resolved_data.get('state', {}),
            location_id=resolved_data.get('location_id'),
        )
