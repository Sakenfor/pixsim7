"""
Item interaction target adapter.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union, TYPE_CHECKING
import time

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.domain.game.interactions.interactions import (
    InteractionContext,
    InteractionParticipant,
    StatDelta,
    format_entity_ref,
)
from pixsim7.backend.main.domain.game.interactions.target_adapters import InteractionTargetAdapter

if TYPE_CHECKING:
    from pixsim7.backend.main.infrastructure.plugins.context import PluginContext
    from pixsim7.backend.main.domain.game.interactions.target_adapters import (
        InteractionTargetAdapterRegistry,
    )


class ItemInteractionTargetAdapter(InteractionTargetAdapter):
    """Item-specific interaction behavior (minimal)."""

    supports_cooldown_tracking = True

    @property
    def kind(self) -> str:
        return "item"

    def normalize_target_id(self, target_id: Union[int, str]) -> int:
        if isinstance(target_id, int):
            return target_id
        if isinstance(target_id, str) and target_id.isdigit():
            return int(target_id)
        raise ValueError("Item target_id must be a numeric string or int")

    async def load_target(
        self,
        ctx: "PluginContext",
        target_id: Union[int, str],
    ) -> Optional[Dict[str, Any]]:
        item_id = self.normalize_target_id(target_id)
        item = await ctx.world.get_item(item_id)
        if not item:
            return None
        return item

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
        target_ref = format_entity_ref("item", self.normalize_target_id(target_id)).to_string()
        interaction_state = flags.get("interactions", {}).get(target_ref, {})
        context.last_used_at = interaction_state.get("lastUsedAt", {})
        return context

    def normalize_stat_deltas(
        self,
        deltas: List[StatDelta],
        target_id: Union[int, str],
    ) -> List[StatDelta]:
        return deltas

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
        target_ref = format_entity_ref("item", self.normalize_target_id(target_id)).to_string()

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
    registry.register_item(ItemInteractionTargetAdapter())
