"""
NPC stat service for managing entity-owned stats with hybrid approach.

Handles:
- Base stats (from GameNPC)
- Runtime overrides (from NPCState)
- Merging and normalization
- Equipment/buff modifiers
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain.game.models import GameNPC, NPCState, GameWorld
from pixsim7.backend.main.domain.stats import StatEngine, WorldStatsConfig
from pixsim7.backend.main.services.game.stat_service import StatService


class NPCStatService:
    """
    Service for managing NPC stats with hybrid approach.

    Combines base stats (GameNPC) with runtime overrides (NPCState)
    and applies equipment/buff modifiers.
    """

    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis if REDIS_AVAILABLE else None
        self.stat_service = StatService(db, redis)

    async def _get_npc_world_id(self, npc: GameNPC) -> Optional[int]:
        """
        Determine which world an NPC belongs to.

        For now, returns None since NPCs aren't directly linked to worlds.
        In the future, this could be determined by:
        - NPC's home location's world
        - Current session context
        - NPC metadata
        """
        # TODO: Implement world determination logic
        # For now, we'll need the caller to provide world_id
        return None

    async def get_npc_effective_stats(
        self,
        npc_id: int,
        stat_definition_id: str,
        world_id: Optional[int] = None,
        modifiers_by_axis: Optional[Dict[str, list[Dict[str, Any]]]] = None
    ) -> Dict[str, Any]:
        """
        Get NPC's effective stats (base + runtime overrides + modifiers).

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type (e.g., "combat_skills", "attributes")
            world_id: Optional world ID for stat definition lookup
            modifiers_by_axis: Optional equipment/buff modifiers

        Returns:
            Merged and normalized stats with computed tiers/levels

        Example:
            Base (GameNPC): {"strength": 90, "agility": 60}
            Override (NPCState): {"health": 65}
            Modifiers: {"strength": [{"type": "additive", "value": 10}]}
            Result: {"strength": 100, "strengthTierId": "expert", "agility": 60, "health": 65}
        """
        # Get base stats from NPC
        npc = await self.db.get(GameNPC, npc_id)
        if not npc:
            raise ValueError("npc_not_found")

        base_stats = npc.stats.get(stat_definition_id, {}) if npc.stats else {}

        # Get runtime overrides from NPCState
        npc_state = await self.db.get(NPCState, npc_id)
        override_stats = {}
        if npc_state and npc_state.stats:
            override_stats = npc_state.stats.get(stat_definition_id, {})

        # Merge base + overrides
        merged_stats = StatEngine.merge_entity_stats(base_stats, override_stats)

        # If no world_id provided, try to determine it
        if world_id is None:
            world_id = await self._get_npc_world_id(npc)

        # Get stat definition and apply modifiers + normalization
        if world_id:
            stats_config = await self.stat_service._get_world_stats_config(world_id)
            if stats_config and stat_definition_id in stats_config.definitions:
                stat_definition = stats_config.definitions[stat_definition_id]

                # Apply modifiers if provided
                if modifiers_by_axis:
                    return StatEngine.resolve_entity_stats_with_modifiers(
                        merged_stats,
                        stat_definition,
                        modifiers_by_axis
                    )
                else:
                    # Just normalize (clamp + compute tiers/levels)
                    return StatEngine.normalize_entity_stats(merged_stats, stat_definition)

        # No stat definition available, return raw merged stats
        return merged_stats

    async def update_npc_base_stats(
        self,
        npc_id: int,
        stat_definition_id: str,
        stat_updates: Dict[str, Any]
    ) -> None:
        """
        Update NPC's base stats (stored in GameNPC).

        This modifies the NPC template/base values.

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type
            stat_updates: Stat values to update

        Example:
            # Permanently increase NPC strength (level up)
            await update_npc_base_stats(
                npc_id=1,
                stat_definition_id="combat_skills",
                stat_updates={"strength": 95}
            )
        """
        npc = await self.db.get(GameNPC, npc_id)
        if not npc:
            raise ValueError("npc_not_found")

        # Initialize stats if needed
        if not npc.stats:
            npc.stats = {}

        if stat_definition_id not in npc.stats:
            npc.stats[stat_definition_id] = {}

        # Update base stats
        npc.stats[stat_definition_id].update(stat_updates)

        self.db.add(npc)
        await self.db.commit()
        await self.db.refresh(npc)

    async def update_npc_runtime_stats(
        self,
        npc_id: int,
        stat_definition_id: str,
        stat_updates: Dict[str, Any]
    ) -> None:
        """
        Update NPC's runtime stats (stored in NPCState).

        This creates session-specific overrides without modifying the base NPC.

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type
            stat_updates: Stat values to update

        Example:
            # NPC takes damage (temporary)
            await update_npc_runtime_stats(
                npc_id=1,
                stat_definition_id="attributes",
                stat_updates={"health": 65}
            )
        """
        npc_state = await self.db.get(NPCState, npc_id)
        if not npc_state:
            # Create new state
            npc_state = NPCState(npc_id=npc_id)
            self.db.add(npc_state)

        # Initialize stats if needed
        if not npc_state.stats:
            npc_state.stats = {}

        if stat_definition_id not in npc_state.stats:
            npc_state.stats[stat_definition_id] = {}

        # Update runtime stats
        npc_state.stats[stat_definition_id].update(stat_updates)
        npc_state.version += 1
        npc_state.updated_at = datetime.utcnow()

        logger.info(
            f"Updated NPC runtime stats",
            extra={"npc_id": npc_id, "stat_definition_id": stat_definition_id}
        )

        await self.db.commit()
        await self.db.refresh(npc_state)

    async def reset_npc_runtime_stats(
        self,
        npc_id: int,
        stat_definition_id: Optional[str] = None
    ) -> None:
        """
        Reset NPC's runtime stats (clear overrides).

        Args:
            npc_id: The NPC ID
            stat_definition_id: Specific stat type to reset, or None for all

        Example:
            # Heal NPC (remove health override, back to base)
            await reset_npc_runtime_stats(npc_id=1, stat_definition_id="attributes")

            # Full reset (remove all overrides)
            await reset_npc_runtime_stats(npc_id=1)
        """
        npc_state = await self.db.get(NPCState, npc_id)
        if not npc_state or not npc_state.stats:
            return  # Nothing to reset

        if stat_definition_id:
            # Reset specific stat type
            if stat_definition_id in npc_state.stats:
                del npc_state.stats[stat_definition_id]
                npc_state.version += 1
        else:
            # Reset all stats
            npc_state.stats = {}
            npc_state.version += 1

        self.db.add(npc_state)
        await self.db.commit()
        await self.db.refresh(npc_state)

    async def apply_stat_modifier_to_npc(
        self,
        npc_id: int,
        stat_definition_id: str,
        axis_name: str,
        modifier: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply a stat modifier to an NPC and return the result.

        This is a convenience method for temporary effects (buffs, equipment).
        The modifier is applied on-the-fly without persisting to the database.

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type
            axis_name: Which axis to modify
            modifier: Modifier dict with type and value

        Returns:
            Effective stats with modifier applied

        Example:
            # Apply battle rage buff (+50% strength)
            result = await apply_stat_modifier_to_npc(
                npc_id=1,
                stat_definition_id="combat_skills",
                axis_name="strength",
                modifier={"type": "multiplicative", "value": 1.5}
            )
        """
        modifiers_by_axis = {axis_name: [modifier]}

        return await self.get_npc_effective_stats(
            npc_id,
            stat_definition_id,
            modifiers_by_axis=modifiers_by_axis
        )
