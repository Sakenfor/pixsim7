"""
Brain computation engine.

Computes NPC brain state from stat packages using semantic derivations.
Fully data-driven - no hardcoded stat names or formulas.

Semantic Derivation System:
- Packages declare semantic types for their axes (e.g., "positive_sentiment")
- Packages declare derivation capabilities with formulas and transforms
- The engine automatically resolves which derivations can run
- Transforms convert numeric values to labels/categories

Example flow:
1. Relationships package provides affinity (positive_sentiment) = 75
2. Mood package declares it can derive from positive_sentiment
3. Engine computes: valence = 75, then applies transform -> label = "happy"
"""

from typing import Dict, List, Optional, Any, Set
import time
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.stats import (
    StatEngine,
    WorldStatsConfig,
    StatDefinition,
    get_derivation_engine,
)
from pixsim7.backend.main.domain.game.models import GameSession, GameWorld, GameNPC
from .types import BrainState, BrainStatSnapshot

logger = logging.getLogger(__name__)


class BrainEngine:
    """
    Computes NPC brain state from stat packages using semantic derivations.

    Fully data-driven:
    - Reads whatever stat definitions the world has configured
    - Runs semantic derivations declared in stat packages
    - Respects world-level derivation allowlists
    - No hardcoded stat names or formulas

    Usage:
        engine = BrainEngine(db)
        brain = await engine.compute_brain_state(npc_id, session, world, npc)

        # Result adapts to world's stat configuration:
        # - brain.stats["mood"] exists if world has mood package OR derived
        # - brain.stats["mood"].axes["valence"] = 75
        # - brain.derived["mood"]["label"] = "happy" (from transforms)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.stat_engine = StatEngine()
        self.derivation_engine = get_derivation_engine()

    async def compute_brain_state(
        self,
        npc_id: int,
        session: GameSession,
        world: GameWorld,
        npc: Optional[GameNPC] = None,
    ) -> BrainState:
        """
        Compute complete brain state for an NPC.

        Steps:
        1. Load world's stat definitions from meta.stats_config
        2. Extract NPC's stat values from session + NPC base data
        3. Normalize (compute tiers/levels) for each stat definition
        4. Run semantic derivations (formulas + transforms)
        5. Return combined brain state

        Args:
            npc_id: NPC ID to compute brain for
            session: Current game session with stat overrides
            world: Game world with stat configuration
            npc: Optional NPC model with base stats

        Returns:
            BrainState with stats and derived values
        """
        world_meta = world.meta or {}
        stats_config = self._get_stats_config(world_meta)
        brain_cfg = world_meta.get("brain_config", {})

        # Get active package IDs from world config
        active_packages = brain_cfg.get("active_packages", [])
        if not active_packages:
            # Default: infer from stats_config definitions
            active_packages = list(stats_config.definitions.keys())

        # Collect stat snapshots for each definition
        stat_snapshots: Dict[str, BrainStatSnapshot] = {}
        stat_values: Dict[str, Dict[str, float]] = {}

        for stat_def_id, stat_def in stats_config.definitions.items():
            snapshot = self._compute_stat_snapshot(
                stat_def_id=stat_def_id,
                stat_def=stat_def,
                npc_id=npc_id,
                session=session,
                npc=npc,
            )
            if snapshot:
                stat_snapshots[stat_def_id] = snapshot
                stat_values[stat_def_id] = snapshot.axes

        # Run semantic derivations (formulas compute axes, transforms compute labels)
        derived_results = self._compute_semantic_derivations(
            stat_values=stat_values,
            active_packages=active_packages,
            excluded_derivation_ids=self._get_disabled_derivations(brain_cfg),
        )

        # Separate axis values (go to stats) from transformed values (go to derived)
        derived: Dict[str, Any] = {}

        for stat_def_id, result_dict in derived_results.items():
            # Extract numeric axis values for stat snapshot
            axis_values = {k: v for k, v in result_dict.items() if isinstance(v, (int, float))}
            # Extract non-numeric values (labels, etc.) for derived
            transformed_values = {k: v for k, v in result_dict.items() if not isinstance(v, (int, float))}

            if axis_values and stat_def_id not in stat_snapshots:
                # Create snapshot for derived stat axes
                stat_def = self._find_stat_definition(stat_def_id, active_packages)
                if stat_def:
                    snapshot = self._create_snapshot_from_values(axis_values, stat_def)
                    stat_snapshots[stat_def_id] = snapshot

            if transformed_values:
                # Store transformed values (labels, etc.) in derived
                derived[stat_def_id] = {
                    **axis_values,  # Include axes for convenience
                    **transformed_values,
                }

        return BrainState(
            npc_id=npc_id,
            world_id=world.id,
            stats=stat_snapshots,
            derived=derived,
            computed_at=time.time(),
            source_packages=list(stat_snapshots.keys()),
        )

    def _compute_semantic_derivations(
        self,
        stat_values: Dict[str, Dict[str, float]],
        active_packages: List[str],
        excluded_derivation_ids: Optional[Set[str]] = None,
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute semantic derivations using DerivationEngine.

        These are data-driven derivations declared in stat packages using
        semantic types. The engine automatically resolves which derivations
        can run based on available semantic types.
        """
        return self.derivation_engine.compute_derivations(
            stat_values=stat_values,
            package_ids=active_packages,
            excluded_derivation_ids=excluded_derivation_ids,
            already_computed=set(stat_values.keys()),
        )

    def _get_disabled_derivations(self, brain_cfg: Dict[str, Any]) -> Optional[Set[str]]:
        """Get set of disabled derivation IDs from config."""
        disabled = brain_cfg.get("disabled_derivations", [])
        return set(disabled) if disabled else None

    def _find_stat_definition(
        self,
        stat_def_id: str,
        package_ids: List[str],
    ) -> Optional[StatDefinition]:
        """Find a stat definition by ID across active packages."""
        from pixsim7.backend.main.domain.stats import get_stat_package

        for pkg_id in package_ids:
            pkg = get_stat_package(pkg_id)
            if pkg and stat_def_id in pkg.definitions:
                return pkg.definitions[stat_def_id]
        return None

    def _create_snapshot_from_values(
        self,
        axis_values: Dict[str, float],
        stat_def: StatDefinition,
    ) -> BrainStatSnapshot:
        """Create a BrainStatSnapshot from axis values."""
        # Clamp values
        clamped = self.stat_engine.clamp_stat_values(axis_values, stat_def)

        # Compute tiers
        tiers: Dict[str, str] = {}
        for axis in stat_def.axes:
            tier_id = self.stat_engine.compute_tier(
                axis.name,
                clamped.get(axis.name, axis.default_value),
                stat_def.tiers,
            )
            if tier_id:
                tiers[axis.name] = tier_id

        # Compute levels
        level_id, level_ids = self._compute_levels(clamped, stat_def)

        return BrainStatSnapshot(
            axes=clamped,
            tiers=tiers,
            level_id=level_id,
            level_ids=level_ids,
        )

    def _get_stats_config(self, world_meta: Dict[str, Any]) -> WorldStatsConfig:
        """Extract or build WorldStatsConfig from world meta."""
        if "stats_config" in world_meta:
            return WorldStatsConfig(**world_meta["stats_config"])
        return WorldStatsConfig(version=1, definitions={})

    def _compute_stat_snapshot(
        self,
        stat_def_id: str,
        stat_def: StatDefinition,
        npc_id: int,
        session: Optional[GameSession],
        npc: Optional[GameNPC],
    ) -> Optional[BrainStatSnapshot]:
        """
        Compute snapshot for one stat definition.

        Merges:
        - NPC base stats (from GameNPC.meta or stats field)
        - Session overrides (from session.flags.npcs[npc_id].stats)

        Session values take precedence over NPC base values.
        """
        # Get base values from NPC
        base_values = self._get_npc_base_stats(npc, stat_def_id) if npc else {}

        # Get session overrides
        session_values = self._get_session_stats(session, npc_id, stat_def_id)

        # Merge (session wins)
        merged = {**base_values, **session_values}

        if not merged:
            # Use defaults from stat definition
            merged = {axis.name: axis.default_value for axis in stat_def.axes}

        # Clamp values to axis ranges
        clamped = self.stat_engine.clamp_stat_values(merged, stat_def)

        # Compute tiers for each axis
        tiers: Dict[str, str] = {}
        for axis in stat_def.axes:
            tier_id = self.stat_engine.compute_tier(
                axis.name,
                clamped.get(axis.name, axis.default_value),
                stat_def.tiers,
            )
            if tier_id:
                tiers[axis.name] = tier_id

        # Compute levels (multi-axis)
        level_id, level_ids = self._compute_levels(clamped, stat_def)

        return BrainStatSnapshot(
            axes=clamped,
            tiers=tiers,
            level_id=level_id,
            level_ids=level_ids,
        )

    def _compute_levels(
        self,
        stat_values: Dict[str, float],
        stat_def: StatDefinition,
    ) -> tuple[Optional[str], List[str]]:
        """
        Compute matching levels for stat values.

        Returns (highest_priority_level_id, all_matching_level_ids).
        """
        if not stat_def.levels:
            return None, []

        matching: List[tuple[int, str]] = []  # (priority, level_id)

        for level in stat_def.levels:
            if level.matches(stat_values):
                matching.append((level.priority, level.id))

        if not matching:
            return None, []

        # Sort by priority descending
        matching.sort(key=lambda x: -x[0])

        level_ids = [level_id for _, level_id in matching]
        highest_level_id = level_ids[0] if level_ids else None

        return highest_level_id, level_ids

    def _get_npc_base_stats(self, npc: GameNPC, stat_def_id: str) -> Dict[str, float]:
        """Extract base stats for a definition from NPC model."""
        if not npc.meta:
            return {}

        # Try npc.meta.stats[stat_def_id]
        stats = npc.meta.get("stats", {})
        if stat_def_id in stats:
            return {k: float(v) for k, v in stats[stat_def_id].items() if isinstance(v, (int, float))}

        # Legacy: for personality, try npc.meta.personality.traits
        if stat_def_id == "personality":
            traits = npc.meta.get("personality", {}).get("traits", {})
            if traits:
                return {k: float(v) for k, v in traits.items() if isinstance(v, (int, float))}

        return {}

    def _get_session_stats(
        self,
        session: Optional[GameSession],
        npc_id: int,
        stat_def_id: str,
    ) -> Dict[str, float]:
        """Extract session-level stat overrides for an NPC."""
        if not session or not session.flags:
            return {}

        npc_key = f"npc:{npc_id}"
        npc_data = session.flags.get("npcs", {}).get(npc_key, {})

        # Try npc_data.stats[stat_def_id]
        stats = npc_data.get("stats", {})
        if stat_def_id in stats:
            return {k: float(v) for k, v in stats[stat_def_id].items() if isinstance(v, (int, float))}

        # Legacy: for relationships, try session.relationships
        if stat_def_id == "relationships":
            relationships = getattr(session, "relationships", None) or {}
            rel = relationships.get(npc_key, {})
            if rel:
                return {k: float(v) for k, v in rel.items() if isinstance(v, (int, float))}

        return {}
