"""
Location interaction target adapter.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union, TYPE_CHECKING
import time

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.domain.game.interactions.interactions import (
    InteractionContext,
    InteractionParticipant,
    StatDelta,
    TargetEffects,
    format_entity_ref,
)
from pixsim7.backend.main.domain.game.interactions.target_adapters import InteractionTargetAdapter

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from pixsim7.backend.main.infrastructure.plugins.context import PluginContext
    from pixsim7.backend.main.domain.game.interactions.target_adapters import (
        InteractionTargetAdapterRegistry,
    )


class LocationInteractionTargetAdapter(InteractionTargetAdapter):
    """Location-specific interaction behavior."""

    supports_cooldown_tracking = True
    supports_target_effects = True

    @property
    def kind(self) -> str:
        return "location"

    def normalize_target_id(self, target_id: Union[int, str]) -> int:
        if isinstance(target_id, int):
            return target_id
        if isinstance(target_id, str) and target_id.isdigit():
            return int(target_id)
        raise ValueError("Location target_id must be a numeric string or int")

    async def load_target(
        self,
        ctx: "PluginContext",
        target_id: Union[int, str],
    ) -> Optional[Dict[str, Any]]:
        location_id = self.normalize_target_id(target_id)
        location = await ctx.world.get_location(location_id)
        if not location:
            return None
        return location

    def get_target_roles(self, world: Dict[str, Any], target_id: Union[int, str]) -> List[str]:
        """Return world role bindings for this location."""
        location_id = self.normalize_target_id(target_id)
        role_bindings = world.get("role_bindings", {})
        roles = []
        for role, binding in role_bindings.items():
            if binding.get("kind") == "location" and binding.get("id") == location_id:
                roles.append(role)
        return roles

    def build_context(
        self,
        session: Dict[str, Any],
        target_id: Union[int, str],
        location_id: Optional[int] = None,
        participants: Optional[List["InteractionParticipant"]] = None,
        primary_role: Optional[str] = None,
    ) -> InteractionContext:
        context = super().build_context(
            session,
            target_id,
            location_id,
            participants,
            primary_role,
        )
        flags = session.get("flags", {})
        target_ref = format_entity_ref("location", self.normalize_target_id(target_id)).to_string()
        interaction_state = flags.get("interactions", {}).get(target_ref, {})
        context.last_used_at = interaction_state.get("lastUsedAt", {})
        return context

    def normalize_stat_deltas(
        self,
        deltas: List[StatDelta],
        target_id: Union[int, str],
    ) -> List[StatDelta]:
        return deltas

    async def apply_target_effects(
        self,
        db: "AsyncSession",
        session: GameSession,
        target_id: Union[int, str],
        effects: TargetEffects,
        world_time: Optional[float] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> None:
        """Apply location-specific effects (e.g., environmental state changes)."""
        location_id = self.normalize_target_id(target_id)

        for effect in effects.effects:
            if effect.type == "location.mark_visited":
                visited = session.flags.get("visited_locations", {})
                if not isinstance(visited, dict):
                    visited = {}
                visited[str(location_id)] = True
                session.flags["visited_locations"] = visited
            elif effect.type == "location.set_flag":
                # Set arbitrary location-specific flags
                payload = effect.payload or {}
                flag_key = payload.get("key")
                flag_value = payload.get("value", True)
                if flag_key:
                    location_flags = session.flags.get("location_flags", {})
                    if not isinstance(location_flags, dict):
                        location_flags = {}
                    loc_key = str(location_id)
                    if loc_key not in location_flags:
                        location_flags[loc_key] = {}
                    location_flags[loc_key][flag_key] = flag_value
                    session.flags["location_flags"] = location_flags

    async def track_interaction_cooldown(
        self,
        session: GameSession,
        target_id: Union[int, str],
        interaction_id: str,
        world_time: Optional[float] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> None:
        timestamp = int(world_time) if world_time is not None else int(time.time())
        target_ref = format_entity_ref("location", self.normalize_target_id(target_id)).to_string()

        interactions = session.flags.get("interactions", {})
        if not isinstance(interactions, dict):
            interactions = {}
        target_state = interactions.get(target_ref, {})
        if not isinstance(target_state, dict):
            target_state = {}
        last_used = target_state.get("lastUsedAt", {})
        last_used[interaction_id] = timestamp
        target_state["lastUsedAt"] = last_used
        interactions[target_ref] = target_state
        session.flags["interactions"] = interactions


def register_adapters(registry: "InteractionTargetAdapterRegistry") -> None:
    registry.register_item(LocationInteractionTargetAdapter())
