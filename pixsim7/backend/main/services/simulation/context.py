"""
World Simulation Context

Runtime context for world simulation scheduling.
Holds current world time, config, and transient scheduling state.

Task 21 Phase 21.2: World Simulation Context & Config Schema
"""

from __future__ import annotations
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

from pixsim7.backend.main.domain.game.schemas import (
    WorldSchedulerConfigSchema,
    get_default_world_scheduler_config,
)


@dataclass
class WorldSimulationContext:
    """
    Runtime context for world simulation.

    Holds the current state needed for scheduling NPC simulation,
    generation jobs, and world time advancement.

    This is an in-memory structure that gets created/updated by the scheduler.
    Persistent state (world_time) is stored in GameWorldState table.
    """

    world_id: int
    current_world_time: float = 0.0
    config: WorldSchedulerConfigSchema = field(
        default_factory=lambda: WorldSchedulerConfigSchema(
            **get_default_world_scheduler_config()
        )
    )

    # Transient scheduling state (not persisted)
    last_tick_at: Optional[datetime] = None
    ticks_processed: int = 0
    npcs_simulated_this_tick: int = 0
    jobs_enqueued_this_tick: int = 0

    # Performance tracking
    last_tick_duration_ms: float = 0.0
    average_tick_duration_ms: float = 0.0

    # Tier distribution (updated each tick)
    npcs_per_tier: Dict[str, int] = field(default_factory=dict)

    # Additional context
    shard_id: Optional[str] = None  # For future sharding support
    meta: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Initialize derived state"""
        if not self.npcs_per_tier:
            self.npcs_per_tier = {
                "detailed": 0,
                "active": 0,
                "ambient": 0,
                "dormant": 0,
            }

    def advance_time(self, delta_real_seconds: float) -> float:
        """
        Advance world time based on real-time delta and timeScale.

        Args:
            delta_real_seconds: Real-time seconds elapsed since last tick

        Returns:
            Delta game-time seconds (delta_real_seconds * timeScale)
        """
        if self.config.pauseSimulation:
            return 0.0

        delta_game_seconds = delta_real_seconds * self.config.timeScale
        self.current_world_time += delta_game_seconds
        return delta_game_seconds

    def reset_tick_counters(self):
        """Reset per-tick counters at start of tick"""
        self.npcs_simulated_this_tick = 0
        self.jobs_enqueued_this_tick = 0

    def can_simulate_more_npcs(self) -> bool:
        """Check if we can simulate more NPCs this tick"""
        return (
            self.npcs_simulated_this_tick < self.config.maxNpcTicksPerStep
        )

    def can_enqueue_more_jobs(self) -> bool:
        """Check if we can enqueue more generation jobs this tick"""
        return (
            self.jobs_enqueued_this_tick < self.config.maxJobOpsPerStep
        )

    def record_npc_simulated(self, tier: str):
        """Record that an NPC was simulated"""
        self.npcs_simulated_this_tick += 1
        self.npcs_per_tier[tier] = self.npcs_per_tier.get(tier, 0) + 1

    def record_job_enqueued(self):
        """Record that a generation job was enqueued"""
        self.jobs_enqueued_this_tick += 1

    def update_tick_stats(self, duration_ms: float):
        """
        Update tick performance statistics.

        Args:
            duration_ms: Duration of the tick in milliseconds
        """
        self.last_tick_duration_ms = duration_ms
        self.ticks_processed += 1

        # Update rolling average (weighted towards recent ticks)
        alpha = 0.2  # Weight for new samples
        if self.average_tick_duration_ms == 0:
            self.average_tick_duration_ms = duration_ms
        else:
            self.average_tick_duration_ms = (
                alpha * duration_ms
                + (1 - alpha) * self.average_tick_duration_ms
            )

    def get_stats(self) -> Dict[str, Any]:
        """
        Get current context stats for observability.

        Returns:
            Dict of statistics about current simulation state
        """
        return {
            "world_id": self.world_id,
            "current_world_time": self.current_world_time,
            "ticks_processed": self.ticks_processed,
            "npcs_simulated_last_tick": self.npcs_simulated_this_tick,
            "jobs_enqueued_last_tick": self.jobs_enqueued_this_tick,
            "npcs_per_tier": self.npcs_per_tier.copy(),
            "last_tick_duration_ms": self.last_tick_duration_ms,
            "average_tick_duration_ms": self.average_tick_duration_ms,
            "config": {
                "timeScale": self.config.timeScale,
                "maxNpcTicksPerStep": self.config.maxNpcTicksPerStep,
                "maxJobOpsPerStep": self.config.maxJobOpsPerStep,
                "tickIntervalSeconds": self.config.tickIntervalSeconds,
                "pauseSimulation": self.config.pauseSimulation,
            },
        }

    @classmethod
    def from_world_state(
        cls,
        world_id: int,
        world_time: float,
        config_dict: Optional[Dict[str, Any]] = None,
    ) -> WorldSimulationContext:
        """
        Create context from world state.

        Args:
            world_id: World ID
            world_time: Current world time from GameWorldState
            config_dict: Simulation config from GameWorld.meta.simulation

        Returns:
            Initialized WorldSimulationContext
        """
        # Parse config or use default
        if config_dict:
            try:
                config = WorldSchedulerConfigSchema(**config_dict)
            except Exception as e:
                # Log error and fall back to default
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Failed to parse simulation config for world {world_id}: {e}. "
                    "Using default config."
                )
                config = WorldSchedulerConfigSchema(
                    **get_default_world_scheduler_config()
                )
        else:
            config = WorldSchedulerConfigSchema(
                **get_default_world_scheduler_config()
            )

        return cls(
            world_id=world_id,
            current_world_time=world_time,
            config=config,
        )
