"""
World Simulation Worker

ARQ cron task that ticks all active worlds on a schedule.
This enables NPCs to autonomously choose activities, apply effects,
and progress their behavior based on world time.

Usage:
    This module is imported by arq_worker.py and registered as a cron job.
    It runs every 5 seconds by default (configurable via SIMULATION_TICK_INTERVAL).
    Runtime enable/disable is controlled primarily per world via:
    - world.meta.simulation.enabled
    - world.meta.simulation.pauseSimulation
    - world.meta.gameProfile.simulationMode
    Env vars act only as optional global fallbacks/kill-switches.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any, Iterable

from sqlalchemy import select

from pixsim_logging import configure_logging
from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.simulation import WorldScheduler
from pixsim7.backend.game import GameWorld, GameWorldState

logger = configure_logging("worker.world_sim").bind(channel="cron")

# Configuration
def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _coerce_positive_float(value: Any, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


SIMULATION_GLOBAL_ENABLED = _coerce_bool(
    os.getenv("SIMULATION_GLOBAL_ENABLED", os.getenv("SIMULATION_ENABLED", "true"))
)
# Backward-compatible alias used by worker bootstrap/imports.
SIMULATION_ENABLED = SIMULATION_GLOBAL_ENABLED
SIMULATION_TICK_INTERVAL = _coerce_positive_float(
    os.getenv("SIMULATION_TICK_INTERVAL", "5.0"),
    default=5.0,
)

# Track last tick times per world
_last_tick_times: Dict[int, datetime] = {}


def _coerce_meta(meta: Any) -> Dict[str, Any]:
    return meta if isinstance(meta, dict) else {}


def _coerce_world_time(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@dataclass(frozen=True, slots=True)
class WorldTickSnapshot:
    world_id: int
    meta: Dict[str, Any]

    @classmethod
    def from_row(cls, row: tuple[Any, Any]) -> "WorldTickSnapshot | None":
        world_id, meta = row
        if world_id is None:
            return None
        return cls(world_id=int(world_id), meta=_coerce_meta(meta))


@dataclass(frozen=True, slots=True)
class WorldStatusSnapshot:
    world_id: int
    name: str
    meta: Dict[str, Any]
    world_time: float

    @classmethod
    def from_row(cls, row: tuple[Any, Any, Any, Any]) -> "WorldStatusSnapshot | None":
        world_id, name, meta, world_time = row
        if world_id is None:
            return None
        if isinstance(name, str) and name.strip():
            world_name = name
        else:
            world_name = f"World {world_id}"
        return cls(
            world_id=int(world_id),
            name=world_name,
            meta=_coerce_meta(meta),
            world_time=_coerce_world_time(world_time),
        )


def _to_tick_snapshots(rows: Iterable[tuple[Any, Any]]) -> list[WorldTickSnapshot]:
    snapshots: list[WorldTickSnapshot] = []
    for row in rows:
        snapshot = WorldTickSnapshot.from_row(row)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def _to_status_snapshots(rows: Iterable[tuple[Any, Any, Any, Any]]) -> list[WorldStatusSnapshot]:
    snapshots: list[WorldStatusSnapshot] = []
    for row in rows:
        snapshot = WorldStatusSnapshot.from_row(row)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def _get_meta(source: Any) -> Dict[str, Any]:
    if isinstance(source, dict):
        return source
    meta = getattr(source, "meta", None)
    return _coerce_meta(meta)


def _get_simulation_config(source: Any) -> Dict[str, Any]:
    meta = _get_meta(source)
    config = meta.get("simulation")
    return config if isinstance(config, dict) else {}


def _get_game_profile(source: Any) -> Dict[str, Any]:
    meta = _get_meta(source)
    profile = meta.get("gameProfile")
    return profile if isinstance(profile, dict) else {}


def _is_world_paused(simulation_config: Dict[str, Any]) -> bool:
    return _coerce_bool(simulation_config.get("pauseSimulation", False))


def _get_simulation_mode(game_profile: Dict[str, Any]) -> str:
    raw = game_profile.get("simulationMode", "real_time")
    if not isinstance(raw, str):
        return "real_time"
    mode = raw.strip().lower()
    if mode not in {"real_time", "turn_based", "paused"}:
        return "real_time"
    return mode


def _is_world_auto_tick_enabled(
    simulation_config: Dict[str, Any],
    game_profile: Dict[str, Any],
) -> bool:
    if "enabled" in simulation_config and not _coerce_bool(simulation_config.get("enabled")):
        return False
    if _is_world_paused(simulation_config):
        return False
    simulation_mode = _get_simulation_mode(game_profile)
    if simulation_mode in {"paused", "turn_based"}:
        return False
    return True


def _get_world_tick_interval(simulation_config: Dict[str, Any]) -> float:
    return _coerce_positive_float(
        simulation_config.get("tickIntervalSeconds", SIMULATION_TICK_INTERVAL),
        default=SIMULATION_TICK_INTERVAL,
    )


def _prune_stale_last_tick_cache(world_ids: list[int]) -> None:
    world_id_set = set(world_ids)
    for world_id in list(_last_tick_times.keys()):
        if world_id not in world_id_set:
            _last_tick_times.pop(world_id, None)


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
    if not SIMULATION_GLOBAL_ENABLED:
        return {"skipped": True, "reason": "SIMULATION_GLOBAL_ENABLED=false"}

    now = datetime.now(timezone.utc)
    results = {
        "worlds_seen": 0,
        "worlds_ticked": 0,
        "worlds_disabled": 0,
        "worlds_paused": 0,
        "worlds_not_due": 0,
        "npcs_simulated": 0,
        "errors": [],
        "timestamp": now.isoformat(),
    }

    # Snapshot world IDs + meta as plain scalars first; do not carry ORM instances
    # across per-world rollback paths (avoids expired-attribute lazy-load in async).
    worlds: list[WorldTickSnapshot] = []
    try:
        async with get_async_session() as db:
            query = select(GameWorld.id, GameWorld.meta)
            result = await db.execute(query)
            worlds = _to_tick_snapshots(result.all())
    except Exception as e:
        results["errors"].append(f"Database error: {str(e)}")
        logger.error(f"tick_active_worlds database error: {e}", exc_info=True)
        return results

    results["worlds_seen"] = len(worlds)
    if not worlds:
        logger.debug("tick_active_worlds: No worlds found")
        return results

    _prune_stale_last_tick_cache([world.world_id for world in worlds])

    for world in worlds:
        world_id = world.world_id
        try:
            simulation_config = _get_simulation_config(world.meta)
            game_profile = _get_game_profile(world.meta)
            tick_interval = _get_world_tick_interval(simulation_config)

            if _is_world_paused(simulation_config):
                results["worlds_paused"] += 1
                logger.debug(f"World {world_id} simulation is paused, skipping")
                continue

            if not _is_world_auto_tick_enabled(simulation_config, game_profile):
                results["worlds_disabled"] += 1
                logger.debug(f"World {world_id} auto-tick disabled, skipping")
                continue

            # Calculate delta time since last tick
            last_tick = _last_tick_times.get(world_id)
            if last_tick:
                delta_seconds = (now - last_tick).total_seconds()
                if delta_seconds < tick_interval:
                    results["worlds_not_due"] += 1
                    continue
            else:
                delta_seconds = tick_interval

            async with get_async_session() as world_db:
                scheduler = WorldScheduler(world_db)
                await scheduler.register_world(world_id)
                await scheduler.tick_world(world_id, delta_seconds)
                await world_db.commit()
                context = scheduler.get_context(world_id)

            _last_tick_times[world_id] = now

            # Collect stats
            if context:
                results["npcs_simulated"] += context.npcs_simulated_this_tick

            results["worlds_ticked"] += 1

            logger.debug(
                f"tick_active_worlds: World {world_id} ticked, "
                f"delta={delta_seconds:.2f}s, interval={tick_interval:.2f}s, "
                f"NPCs simulated: {context.npcs_simulated_this_tick if context else 0}"
            )

        except Exception as e:
            error_msg = f"World {world_id}: {str(e)}"
            results["errors"].append(error_msg)
            logger.error(f"tick_active_worlds error: {error_msg}", exc_info=True)

    if results["worlds_ticked"] > 0 or results["errors"]:
        logger.info(
            "tick_active_worlds_complete",
            worlds_seen=results["worlds_seen"],
            worlds=results["worlds_ticked"],
            disabled=results["worlds_disabled"],
            paused=results["worlds_paused"],
            not_due=results["worlds_not_due"],
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
        "enabled": SIMULATION_GLOBAL_ENABLED,
        "tick_interval": SIMULATION_TICK_INTERVAL,
        "worlds": {},
    }

    if not SIMULATION_GLOBAL_ENABLED:
        return status

    async with get_async_session() as db:
        try:
            query = select(
                GameWorld.id,
                GameWorld.name,
                GameWorld.meta,
                GameWorldState.world_time,
            ).outerjoin(
                GameWorldState, GameWorld.id == GameWorldState.world_id
            )
            result = await db.execute(query)
            worlds = _to_status_snapshots(result.all())

            for world in worlds:
                simulation_config = _get_simulation_config(world.meta)
                game_profile = _get_game_profile(world.meta)
                simulation_mode = _get_simulation_mode(game_profile)
                last_tick = _last_tick_times.get(world.world_id)
                tick_interval = _get_world_tick_interval(simulation_config)

                status["worlds"][world.world_id] = {
                    "name": world.name,
                    "world_time": world.world_time,
                    "auto_tick_enabled": _is_world_auto_tick_enabled(simulation_config, game_profile),
                    "paused": _is_world_paused(simulation_config),
                    "simulation_mode": simulation_mode,
                    "time_scale": simulation_config.get("timeScale", 60),
                    "tick_interval_seconds": tick_interval,
                    "last_tick": last_tick.isoformat() if last_tick else None,
                }

        except Exception as e:
            logger.error(f"get_simulation_status error: {e}", exc_info=True)

    return status
