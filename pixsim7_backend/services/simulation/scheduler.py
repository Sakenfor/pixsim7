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

from pixsim7_backend.domain.game.models import GameWorld, GameWorldState, GameSession
from pixsim7_backend.services.simulation.context import WorldSimulationContext
from pixsim7_backend.domain.game.schemas import get_default_world_scheduler_config

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
        # (Phase 21.4 will implement this)
        # For now, this is a placeholder
        npcs_to_simulate = await self._select_npcs_for_simulation(
            world_id, context
        )

        # 3. Simulate selected NPCs
        # (Phase 21.4 will implement this)
        for npc in npcs_to_simulate:
            if not context.can_simulate_more_npcs():
                break
            # TODO: Call behavior system to simulate NPC
            # await self._simulate_npc(npc, context)
            context.record_npc_simulated(tier="active")  # Placeholder

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
    ) -> List[Any]:
        """
        Select which NPCs should be simulated this tick.

        Phase 21.4 will implement the full logic using behavior system's
        tier-based selection and ECS queries.

        Args:
            world_id: World ID
            context: Simulation context

        Returns:
            List of NPCs to simulate
        """
        # Placeholder - Phase 21.4 will implement full logic
        # TODO: Query NPCs from world
        # TODO: Use behavior simulation.get_npcs_to_simulate()
        # TODO: Respect tier configs and maxNpcTicksPerStep
        return []

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
