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

from pixsim7.backend.game import GameNPC, NPCState
from pixsim7.backend.main.services.characters.instance_service import (
    CharacterInstanceService,
)
from pixsim7.backend.main.services.characters.npc_sync_service import (
    CharacterNPCSyncService,
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
    """Resolve prompt context for NPCs by combining CharacterInstance + GameNPC state."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.instance_service = CharacterInstanceService(db)
        self.sync_service = CharacterNPCSyncService(db)

    async def resolve(self, request: PromptContextRequest) -> PromptContextSnapshot:
        instance_id: Optional[UUID] = (
            UUID(request.template_id) if request.template_id else None
        )
        npc_id: Optional[int] = int(request.runtime_id) if request.runtime_id else None

        if not instance_id:
            raise ValueError("NPC prompt context requires template_id (CharacterInstance id)")

        # 1) Load instance + merged traits (authoring authority / snapshot)
        instance = await self.instance_service.get_instance(instance_id)
        if not instance:
            raise ValueError(f"CharacterInstance {instance_id} not found")

        merged_traits = await self.instance_service.get_merged_traits(instance_id)

        # 2) Resolve NPC (explicit ID or highest-priority active link)
        npc: Optional[GameNPC] = None
        npc_state: Optional[NPCState] = None

        resolved_npc_id = npc_id
        if resolved_npc_id:
            npc = await self.db.get(GameNPC, resolved_npc_id)
        else:
            links = await self.sync_service.get_links_for_instance(instance_id)
            active_links = [l for l in links if l.sync_enabled]
            if active_links:
                active_links.sort(key=lambda l: l.priority or 0, reverse=True)
                resolved_npc_id = active_links[0].npc_id
                npc = await self.db.get(GameNPC, resolved_npc_id)

        # 3) Pull runtime state from NPCState when we have an NPC
        if npc:
            npc_state = await self.db.get(NPCState, npc.id)

        # 4) Build snapshot with authoritative sources
        traits: Dict[str, Any] = {}
        if merged_traits:
            traits = merged_traits
        elif npc and npc.personality:
            traits = npc.personality

        name = npc.name if npc and getattr(npc, "name", None) else instance.name

        state: Dict[str, Any] = {}
        location_id: Optional[int] = None
        if npc_state:
            state = npc_state.state or {}
            location_id = getattr(npc_state, "current_location_id", None)

        if npc and request.prefer_live:
            source: Literal["live", "snapshot", "merged"] = "live"
        elif npc:
            source = "merged"
        else:
            source = "snapshot"

        return PromptContextSnapshot(
            entity_type="npc",
            template_id=str(instance_id),
            runtime_id=str(npc.id) if npc else None,
            name=name,
            traits=traits,
            state=state,
            location_id=location_id,
            source=source,
            world_id=getattr(instance, "world_id", None),
        )


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

    def __init__(self, db: AsyncSession):
        self.db = db
        self._resolvers: Dict[str, EntityContextResolver] = {}
        self._enrichers: Dict[str, List[EnricherFn]] = {}

        # Register built-in resolver for NPCs
        self.register_resolver("npc", _NpcContextResolver(db))

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
