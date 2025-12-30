"""
World Simulation Scheduler

Central scheduler that orchestrates:
- World time advancement
- NPC simulation (via behavior system)
- Generation job scheduling (with backpressure)
- Periodic tasks

Task 21 Phase 21.3: Central Scheduler Design & API
"""

from __future__ import annotations
from typing import Dict, Optional, List, Any
from datetime import datetime
import time
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# Use domain entry modules for cross-domain imports
from pixsim7.backend.game import (
    GameWorld,
    GameWorldState,
    GameSession,
    GameNPC,
    get_default_world_scheduler_config,
    get_npc_component,
    update_npc_component,
)
# Import behavior system functions directly to avoid circular import
# (pixsim7.backend.simulation re-exports these but also imports this module)
from pixsim7.backend.main.domain.game.behavior import (
    get_npcs_to_simulate,
    determine_simulation_tier,
    choose_npc_activity,
    apply_activity_to_npc,
    finish_activity,
)
from pixsim7.backend.main.services.simulation.context import WorldSimulationContext

logger = logging.getLogger(__name__)


class WorldScheduler:
    """
    Central scheduler for world simulation.

    Responsibilities:
    - Advance world_time for each active world
    - Decide which NPCs to simulate per tier
    - Enqueue generation jobs with quotas
    - Run periodic tasks in controlled manner

    The scheduler doesn't do heavy work directly - it computes a work plan
    and calls into specialized services (behavior system, generation service, etc.)
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize scheduler.

        Args:
            db: Database session
        """
        self.db = db
        self._contexts: Dict[int, WorldSimulationContext] = {}  # world_id -> context

    async def register_world(self, world_id: int) -> None:
        """
        Register a world for simulation.

        Loads world state and creates a simulation context.

        Args:
            world_id: World ID to register
        """
        # Load world and world state
        world = await self.db.get(GameWorld, world_id)
        if not world:
            raise ValueError(f"World {world_id} not found")

        world_state = await self.db.get(GameWorldState, world_id)
        if not world_state:
            # Create world state if missing
            world_state = GameWorldState(world_id=world_id, world_time=0.0)
            self.db.add(world_state)
            await self.db.commit()
            await self.db.refresh(world_state)

        # Get simulation config from world meta
        simulation_config = None
        if world.meta and "simulation" in world.meta:
            simulation_config = world.meta["simulation"]

        # Create context
        context = WorldSimulationContext.from_world_state(
            world_id=world_id,
            world_time=world_state.world_time,
            config_dict=simulation_config,
        )

        self._contexts[world_id] = context
        logger.info(
            f"Registered world {world_id} for simulation "
            f"(current time: {world_state.world_time:.2f}s, "
            f"timeScale: {context.config.timeScale})"
        )

    async def unregister_world(self, world_id: int) -> None:
        """
        Unregister a world from simulation.

        Persists final world state before removing from active contexts.

        Args:
            world_id: World ID to unregister
        """
        if world_id in self._contexts:
            context = self._contexts[world_id]

            # Persist final world time
            await self._persist_world_time(world_id, context.current_world_time)

            del self._contexts[world_id]
            logger.info(f"Unregistered world {world_id} from simulation")

    async def tick_world(self, world_id: int, delta_real_seconds: float) -> None:
        """
        Process one simulation tick for a world.

        This is the main entry point called by the scheduler loop.
        It:
        1. Advances world time
        2. Computes which NPCs to simulate
        3. Calls behavior system to simulate NPCs
        4. Enqueues generation jobs (if budget allows)
        5. Updates context stats

        Args:
            world_id: World ID to tick
            delta_real_seconds: Real-time seconds elapsed since last tick
        """
        start_time = time.perf_counter()

        # Get or create context
        if world_id not in self._contexts:
            await self.register_world(world_id)

        context = self._contexts[world_id]

        # Check if simulation is paused
        if context.config.pauseSimulation:
            logger.debug(f"World {world_id} simulation is paused, skipping tick")
            return

        # Reset per-tick counters
        context.reset_tick_counters()

        # 1. Advance world time
        delta_game_seconds = context.advance_time(delta_real_seconds)
        logger.debug(
            f"World {world_id} time advanced by {delta_game_seconds:.2f}s "
            f"(real: {delta_real_seconds:.2f}s, scale: {context.config.timeScale})"
        )

        # 2. Build work plan: which NPCs to simulate
        npcs_by_tier = await self._select_npcs_for_simulation(
            world_id, context
        )

        # 3. Simulate selected NPCs (grouped by tier)
        for tier, npcs in npcs_by_tier.items():
            for npc_data in npcs:
                if not context.can_simulate_more_npcs():
                    logger.debug(
                        f"Reached max NPC ticks ({context.config.maxNpcTicksPerStep}) "
                        f"for world {world_id}"
                    )
                    break

                # Simulate NPC
                await self._simulate_npc(
                    npc_data["npc"],
                    npc_data["session"],
                    npc_data["world"],
                    tier,
                    context
                )
                context.record_npc_simulated(tier)

        # 4. Enqueue generation jobs (with backpressure)
        # (Phase 21.5 will implement this)
        pending_jobs = await self._get_pending_generation_requests(world_id)
        for job_req in pending_jobs:
            if not context.can_enqueue_more_jobs():
                break
            # TODO: Enqueue job
            # await self._enqueue_generation_job(job_req, context)
            context.record_job_enqueued()

        # 5. Progress interaction chains
        # (Phase 21.6 will implement this)
        # await self._progress_interaction_chains(world_id, context)

        # 6. Persist world time to DB (periodically, not every tick)
        context.last_tick_at = datetime.utcnow()
        if context.ticks_processed % 10 == 0:  # Persist every 10 ticks
            await self._persist_world_time(world_id, context.current_world_time)

        # Update performance stats
        duration_ms = (time.perf_counter() - start_time) * 1000
        context.update_tick_stats(duration_ms)

        logger.debug(
            f"World {world_id} tick completed in {duration_ms:.2f}ms "
            f"(NPCs: {context.npcs_simulated_this_tick}, "
            f"Jobs: {context.jobs_enqueued_this_tick})"
        )

    async def _persist_world_time(self, world_id: int, world_time: float) -> None:
        """
        Persist world time to database.

        Args:
            world_id: World ID
            world_time: Current world time to persist
        """
        world_state = await self.db.get(GameWorldState, world_id)
        if world_state:
            world_state.world_time = world_time
            world_state.last_advanced_at = datetime.utcnow()
            await self.db.commit()

    async def _select_npcs_for_simulation(
        self,
        world_id: int,
        context: WorldSimulationContext
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Select which NPCs should be simulated this tick.

        Uses behavior system's tier-based selection and respects work budgets.

        Args:
            world_id: World ID
            context: Simulation context

        Returns:
            Dict mapping tier ID to list of NPC data dicts with keys:
            - "npc": GameNPC instance
            - "session": GameSession instance
            - "world": GameWorld instance
            - "tier": tier ID string
        """
        # Get all sessions for this world
        result = await self.db.execute(
            select(GameSession)
            .where(GameSession.world_id == world_id)
        )
        sessions = list(result.scalars().all())

        if not sessions:
            logger.debug(f"No sessions found for world {world_id}")
            return {}

        # Get world and world state
        world = await self.db.get(GameWorld, world_id)
        world_state = await self.db.get(GameWorldState, world_id)

        if not world or not world_state:
            logger.warning(f"World or world state not found for {world_id}")
            return {}

        # Get simulation config from canonical location: world.meta["simulation"]
        # This is the single source of truth for scheduler config, including NPC tier selection.
        # Previously also read from world.meta["behavior"]["simulationConfig"] - that path is now deprecated.
        simulation_config = None
        if world.meta and "simulation" in world.meta:
            simulation_config = world.meta["simulation"]

        # Collect all NPCs that might need simulation
        # For now, we'll query NPCs and check them against all sessions
        # In a more optimized version, we'd track which NPCs are relevant per session
        result = await self.db.execute(select(GameNPC))
        all_npcs = list(result.scalars().all())

        if not all_npcs:
            logger.debug(f"No NPCs found in database")
            return {}

        # Group NPCs to simulate by tier (across all sessions)
        npcs_by_tier: Dict[str, List[Dict[str, Any]]] = {}
        total_selected = 0

        # For each session, determine which NPCs need simulation
        for session in sessions:
            if total_selected >= context.config.maxNpcTicksPerStep:
                break

            # Use behavior system to select NPCs for this session
            session_npcs_by_tier = get_npcs_to_simulate(
                npcs=all_npcs,
                world=world,
                session=session,
                world_time=context.current_world_time,
                simulation_config=simulation_config,
            )

            # Add selected NPCs to our result (with session context)
            for tier, npc_list in session_npcs_by_tier.items():
                if tier not in npcs_by_tier:
                    npcs_by_tier[tier] = []

                for npc in npc_list:
                    if total_selected >= context.config.maxNpcTicksPerStep:
                        break

                    npcs_by_tier[tier].append({
                        "npc": npc,
                        "session": session,
                        "world": world,
                        "tier": tier,
                    })
                    total_selected += 1

        logger.debug(
            f"Selected {total_selected} NPCs for simulation in world {world_id}: "
            f"{', '.join(f'{tier}={len(npcs)}' for tier, npcs in npcs_by_tier.items())}"
        )

        return npcs_by_tier

    async def _simulate_npc(
        self,
        npc: GameNPC,
        session: GameSession,
        world: GameWorld,
        tier: str,
        context: WorldSimulationContext
    ) -> None:
        """
        Simulate one NPC tick using behavior system and ECS.

        Uses the full behavior system to:
        1. Check if current activity is finished
        2. Choose new activity based on routine graphs and scoring
        3. Apply activity effects (stats, mood, relationships)

        Args:
            npc: NPC to simulate
            session: Game session
            world: Game world (contains behavior config)
            tier: Simulation tier
            context: Simulation context
        """
        world_time = context.current_world_time

        # Get behavior component
        behavior_comp = get_npc_component(session, npc.id, "behavior", default={})

        # Check if it's time for a new decision
        next_decision_at = behavior_comp.get("nextDecisionAt", 0)
        current_activity_id = behavior_comp.get("currentActivityId")

        if world_time >= next_decision_at:
            # Time for a new activity decision

            # If there was a previous activity, finish it
            if current_activity_id:
                finish_activity(npc, session, world_time)
                logger.debug(
                    f"NPC {npc.id} ({npc.name}) finished activity '{current_activity_id}'"
                )

            # Choose a new activity using the behavior system
            # This uses routine graphs, preferences, conditions, and scoring
            activity = choose_npc_activity(npc, world, session, world_time)

            if activity:
                # Apply the activity - updates NPC state and applies effects
                apply_activity_to_npc(npc, session, activity, world_time)

                activity_id = activity.get("id", "unknown")
                logger.debug(
                    f"NPC {npc.id} ({npc.name}) started activity '{activity_id}' "
                    f"(tier: {tier})"
                )

                # Update behavior component with simulation metadata
                update_npc_component(session, npc.id, "behavior", {
                    "simulationTier": tier,
                    "lastSimulatedAt": world_time,
                })
            else:
                # No activity chosen (no routine, or no valid activities)
                # Schedule next decision based on tier
                decision_interval_map = {
                    "detailed": 60,      # 1 minute
                    "active": 300,       # 5 minutes
                    "ambient": 1800,     # 30 minutes
                    "dormant": 7200,     # 2 hours
                }
                interval = decision_interval_map.get(tier, 300)

                update_npc_component(session, npc.id, "behavior", {
                    "nextDecisionAt": world_time + interval,
                    "simulationTier": tier,
                    "lastSimulatedAt": world_time,
                })

                logger.debug(
                    f"NPC {npc.id} ({npc.name}) has no activity, "
                    f"next decision in {interval}s (tier: {tier})"
                )

            # Mark session as modified (will trigger DB update)
            session.flags = session.flags  # Trigger SQLAlchemy dirty tracking

        else:
            # Not time for decision yet, just update last simulated time
            update_npc_component(session, npc.id, "behavior", {
                "lastSimulatedAt": world_time,
                "simulationTier": tier,
            })
            session.flags = session.flags

    async def _get_pending_generation_requests(
        self,
        world_id: int
    ) -> List[Any]:
        """
        Get pending generation requests for a world.

        Phase 21.5 will implement the full logic.

        Args:
            world_id: World ID

        Returns:
            List of pending generation requests
        """
        # Placeholder - Phase 21.5 will implement
        # TODO: Query session flags for pending generation requests
        # TODO: Check user/world generation quotas
        return []

    def get_context(self, world_id: int) -> Optional[WorldSimulationContext]:
        """
        Get simulation context for a world.

        Args:
            world_id: World ID

        Returns:
            WorldSimulationContext if world is registered, None otherwise
        """
        return self._contexts.get(world_id)

    def get_all_contexts(self) -> Dict[int, WorldSimulationContext]:
        """
        Get all registered simulation contexts.

        Returns:
            Dict mapping world_id to WorldSimulationContext
        """
        return self._contexts.copy()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get overall scheduler statistics.

        Returns:
            Dict of scheduler stats
        """
        return {
            "registered_worlds": len(self._contexts),
            "worlds": {
                world_id: context.get_stats()
                for world_id, context in self._contexts.items()
            },
        }


# ===================
# Scheduler Loop Runner
# ===================

class SchedulerLoopRunner:
    """
    Runs the scheduler loop for registered worlds.

    This can be deployed as:
    - A simple background task in the main app (for dev/small deployments)
    - A dedicated worker process (for production)
    - An ARQ cron job (for distributed deployments)
    """

    def __init__(self, scheduler: WorldScheduler):
        """
        Initialize runner.

        Args:
            scheduler: WorldScheduler instance
        """
        self.scheduler = scheduler
        self._running = False
        self._last_tick_times: Dict[int, datetime] = {}

    async def run_once(self) -> None:
        """
        Run one iteration of the scheduler loop.

        Ticks all registered worlds that are due for a tick.
        """
        now = datetime.utcnow()

        for world_id, context in self.scheduler.get_all_contexts().items():
            # Calculate delta time since last tick
            last_tick = self._last_tick_times.get(world_id)
            if last_tick:
                delta_seconds = (now - last_tick).total_seconds()
            else:
                # First tick, use configured interval
                delta_seconds = context.config.tickIntervalSeconds

            # Check if it's time to tick this world
            min_interval = context.config.tickIntervalSeconds
            if last_tick and delta_seconds < min_interval:
                continue  # Not time yet

            # Tick the world
            try:
                await self.scheduler.tick_world(world_id, delta_seconds)
                self._last_tick_times[world_id] = now
            except Exception as e:
                logger.error(
                    f"Error ticking world {world_id}: {e}",
                    exc_info=True
                )

    async def start(self) -> None:
        """
        Start the scheduler loop (runs indefinitely).

        Note: This is a simple implementation for dev/testing.
        Production should use a more robust approach (ARQ, systemd service, etc.)
        """
        self._running = True
        logger.info("Scheduler loop started")

        while self._running:
            try:
                await self.run_once()
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}", exc_info=True)

            # Sleep briefly to avoid busy-looping
            await asyncio.sleep(0.1)  # 100ms

        logger.info("Scheduler loop stopped")

    def stop(self) -> None:
        """Stop the scheduler loop."""
        self._running = False


# For ARQ integration
async def tick_all_worlds(ctx: dict) -> dict:
    """
    ARQ task to tick all registered worlds.

    This can be scheduled as a cron job in ARQ worker.

    Args:
        ctx: ARQ context

    Returns:
        Dict with tick results
    """
    # This will be implemented when we add ARQ integration
    # For now, it's a placeholder
    pass
