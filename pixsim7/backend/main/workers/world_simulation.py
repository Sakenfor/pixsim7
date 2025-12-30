"""
World Simulation Worker

ARQ cron task that ticks all active worlds on a schedule.
This enables NPCs to autonomously choose activities, apply effects,
and progress their behavior based on world time.

Usage:
    This module is imported by arq_worker.py and registered as a cron job.
    It runs every 5 seconds by default (configurable via SIMULATION_TICK_INTERVAL).
"""

import os
import logging
from datetime import datetime
from typing import Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.simulation import WorldScheduler
from pixsim7.backend.game import GameWorld, GameWorldState

logger = logging.getLogger(__name__)

# Configuration
SIMULATION_ENABLED = os.getenv("SIMULATION_ENABLED", "false").lower() == "true"
SIMULATION_TICK_INTERVAL = float(os.getenv("SIMULATION_TICK_INTERVAL", "5.0"))

# Track last tick times per world
_last_tick_times: Dict[int, datetime] = {}


async def tick_active_worlds(ctx: dict) -> Dict[str, Any]:
    """
    ARQ cron task: Tick all active (non-paused) worlds.

    This function:
    1. Queries all worlds that have simulation enabled (not paused)
    2. For each world, runs one tick of the WorldScheduler
    3. Tracks performance metrics and errors

    Returns:
        Dict with tick results summary
    """
    if not SIMULATION_ENABLED:
        return {"skipped": True, "reason": "SIMULATION_ENABLED=false"}

    now = datetime.utcnow()
    results = {
        "worlds_ticked": 0,
        "npcs_simulated": 0,
        "errors": [],
        "timestamp": now.isoformat(),
    }

    async for db in get_async_session():
        try:
            # Query active worlds (not paused)
            query = select(GameWorld).where(GameWorld.meta.isnot(None))
            result = await db.execute(query)
            worlds = list(result.scalars().all())

            if not worlds:
                logger.debug("tick_active_worlds: No worlds found")
                return results

            # Create scheduler
            scheduler = WorldScheduler(db)

            for world in worlds:
                try:
                    # Check if simulation is paused for this world
                    simulation_config = world.meta.get("simulation", {}) if world.meta else {}
                    if simulation_config.get("pauseSimulation", False):
                        logger.debug(f"World {world.id} simulation is paused, skipping")
                        continue

                    # Calculate delta time since last tick
                    last_tick = _last_tick_times.get(world.id)
                    if last_tick:
                        delta_seconds = (now - last_tick).total_seconds()
                    else:
                        delta_seconds = SIMULATION_TICK_INTERVAL

                    # Register world if not already registered
                    await scheduler.register_world(world.id)

                    # Run tick
                    await scheduler.tick_world(world.id, delta_seconds)
                    _last_tick_times[world.id] = now

                    # Collect stats
                    context = scheduler.get_context(world.id)
                    if context:
                        results["npcs_simulated"] += context.npcs_simulated_this_tick

                    results["worlds_ticked"] += 1

                    logger.debug(
                        f"tick_active_worlds: World {world.id} ticked, "
                        f"NPCs simulated: {context.npcs_simulated_this_tick if context else 0}"
                    )

                except Exception as e:
                    error_msg = f"World {world.id}: {str(e)}"
                    results["errors"].append(error_msg)
                    logger.error(f"tick_active_worlds error: {error_msg}", exc_info=True)

            # Commit any changes
            await db.commit()

        except Exception as e:
            results["errors"].append(f"Database error: {str(e)}")
            logger.error(f"tick_active_worlds database error: {e}", exc_info=True)

    if results["worlds_ticked"] > 0:
        logger.info(
            "tick_active_worlds_complete",
            worlds=results["worlds_ticked"],
            npcs=results["npcs_simulated"],
            errors=len(results["errors"]),
        )

    return results


async def get_simulation_status(ctx: dict) -> Dict[str, Any]:
    """
    Get current simulation status across all worlds.

    Returns:
        Dict with simulation status for each world
    """
    status = {
        "enabled": SIMULATION_ENABLED,
        "tick_interval": SIMULATION_TICK_INTERVAL,
        "worlds": {},
    }

    if not SIMULATION_ENABLED:
        return status

    async for db in get_async_session():
        try:
            query = select(GameWorld, GameWorldState).outerjoin(
                GameWorldState, GameWorld.id == GameWorldState.world_id
            )
            result = await db.execute(query)
            rows = result.all()

            for world, world_state in rows:
                simulation_config = world.meta.get("simulation", {}) if world.meta else {}
                world_time = world_state.world_time if world_state else 0.0
                last_tick = _last_tick_times.get(world.id)

                status["worlds"][world.id] = {
                    "name": world.name,
                    "world_time": world_time,
                    "paused": simulation_config.get("pauseSimulation", False),
                    "time_scale": simulation_config.get("timeScale", 60),
                    "last_tick": last_tick.isoformat() if last_tick else None,
                }

        except Exception as e:
            logger.error(f"get_simulation_status error: {e}", exc_info=True)

    return status
