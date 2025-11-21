# World Simulation Scheduler - Deployment Guide

**Status:** ✅ Complete (Task 21)
**Branch:** `claude/world-time-scheduler-unification-01S3qtR5yngbWBUKaxvAXAFY`

## Overview

The World Simulation Scheduler is a unified system for managing game world time, NPC simulation, and background job scheduling. It replaces ad-hoc time management with a centralized, configurable scheduler that respects work budgets and provides comprehensive observability.

## Architecture

### Core Components

1. **WorldSimulationContext** (`pixsim7/backend/main/services/simulation/context.py`)
   - Runtime context for each world
   - Tracks world_time, config, performance metrics
   - Methods: `advance_time()`, `get_stats()`, `can_simulate_more_npcs()`

2. **WorldScheduler** (`pixsim7/backend/main/services/simulation/scheduler.py`)
   - Central orchestrator for simulation ticks
   - Methods: `register_world()`, `tick_world()`, `unregister_world()`
   - Per-world isolation (errors don't cascade)

3. **SchedulerLoopRunner** (`pixsim7/backend/main/services/simulation/scheduler.py`)
   - Runs the scheduler loop for all registered worlds
   - Methods: `run_once()`, `start()`

4. **Admin APIs** (`pixsim7/backend/main/api/v1/game_worlds.py`)
   - `GET /worlds/{id}/scheduler/config`
   - `PUT /worlds/{id}/scheduler/config`
   - `POST /worlds/{id}/scheduler/pause`
   - `POST /worlds/{id}/scheduler/resume`

### Configuration

Scheduler config is stored in `GameWorld.meta.simulation`:

```json
{
  "simulation": {
    "timeScale": 60,              // 1 real second = 60 game seconds
    "maxNpcTicksPerStep": 50,     // Max NPCs simulated per tick
    "maxJobOpsPerStep": 10,       // Max generation jobs per tick
    "tickIntervalSeconds": 1.0,   // Real-time tick interval
    "pauseSimulation": false,     // Pause flag
    "tiers": {
      "detailed": {"maxNpcs": 20, "description": "Near player"},
      "active": {"maxNpcs": 100, "description": "Current session"},
      "ambient": {"maxNpcs": 500, "description": "Same world"},
      "dormant": {"maxNpcs": 5000, "description": "Inactive"}
    }
  }
}
```

## Deployment Options

### Option 1: ARQ Cron Job (Recommended)

Add to `pixsim7/backend/main/workers/arq_worker.py`:

```python
from pixsim7.backend.main.services.simulation import WorldScheduler

async def tick_all_worlds(ctx: dict) -> dict:
    """
    Tick all registered worlds.
    Runs every 1 second as ARQ cron job.
    """
    from pixsim7.backend.main.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        scheduler = WorldScheduler(db)

        # Get active worlds (worlds with active sessions)
        active_worlds = await get_active_worlds(db)

        for world_id in active_worlds:
            try:
                await scheduler.register_world(world_id)
            except Exception as e:
                logger.error(f"Failed to register world {world_id}: {e}")

        # Run one tick iteration
        from pixsim7.backend.main.services.simulation import SchedulerLoopRunner
        runner = SchedulerLoopRunner(scheduler)
        await runner.run_once()

        return {
            "ticked_worlds": len(active_worlds),
            "stats": scheduler.get_stats()
        }

# Register cron job
async def startup(ctx):
    await ctx["redis"].set("scheduler_enabled", "1")

async def shutdown(ctx):
    await ctx["redis"].set("scheduler_enabled", "0")

class WorkerSettings:
    cron_jobs = [
        cron(tick_all_worlds, hour=None, minute=None, second="*/1"),  # Every second
        # ... existing cron jobs
    ]
```

### Option 2: Dedicated Worker Process

Create `pixsim7/backend/main/workers/scheduler_worker.py`:

```python
import asyncio
import logging
from pixsim7.backend.main.database import AsyncSessionLocal
from pixsim7.backend.main.services.simulation import WorldScheduler, SchedulerLoopRunner

logger = logging.getLogger(__name__)

async def main():
    """Run the scheduler loop continuously."""
    async with AsyncSessionLocal() as db:
        scheduler = WorldScheduler(db)
        runner = SchedulerLoopRunner(scheduler)

        # Register active worlds
        active_worlds = await get_active_worlds(db)
        for world_id in active_worlds:
            await scheduler.register_world(world_id)

        logger.info(f"Scheduler worker started for {len(active_worlds)} worlds")

        # Run forever
        await runner.start()

if __name__ == "__main__":
    asyncio.run(main())
```

Run with systemd or Docker:

```bash
# Systemd service
sudo systemctl start pixsim7-scheduler

# Docker
docker run pixsim7 python -m pixsim7.backend.main.workers.scheduler_worker
```

### Option 3: Background Task in Main App (Dev Only)

Add to FastAPI app startup:

```python
from pixsim7.backend.main.services.simulation import WorldScheduler, SchedulerLoopRunner

@app.on_event("startup")
async def start_scheduler():
    """Start scheduler as background task (dev only)."""
    async with AsyncSessionLocal() as db:
        scheduler = WorldScheduler(db)
        runner = SchedulerLoopRunner(scheduler)

        # Register worlds
        active_worlds = await get_active_worlds(db)
        for world_id in active_worlds:
            await scheduler.register_world(world_id)

        # Run in background
        asyncio.create_task(runner.start())
```

## Usage Examples

### Runtime Config Adjustment

```bash
# Get current config
curl -X GET http://localhost:8000/api/v1/worlds/1/scheduler/config

# Speed up time (2x faster)
curl -X PUT http://localhost:8000/api/v1/worlds/1/scheduler/config \
  -H "Content-Type: application/json" \
  -d '{"timeScale": 120}'

# Increase NPC simulation budget
curl -X PUT http://localhost:8000/api/v1/worlds/1/scheduler/config \
  -H "Content-Type: application/json" \
  -d '{"maxNpcTicksPerStep": 100}'

# Pause simulation
curl -X POST http://localhost:8000/api/v1/worlds/1/scheduler/pause

# Resume simulation
curl -X POST http://localhost:8000/api/v1/worlds/1/scheduler/resume
```

### Programmatic Access

```python
from pixsim7.backend.main.services.simulation import WorldScheduler

async def example(db: AsyncSession):
    scheduler = WorldScheduler(db)

    # Register world
    await scheduler.register_world(world_id=1)

    # Tick manually (for testing)
    await scheduler.tick_world(world_id=1, delta_real_seconds=1.0)

    # Get stats
    context = scheduler.get_context(world_id=1)
    stats = context.get_stats()
    print(f"World time: {stats['current_world_time']}")
    print(f"NPCs simulated: {stats['npcs_simulated_last_tick']}")
    print(f"Tick duration: {stats['last_tick_duration_ms']}ms")

    # Unregister world
    await scheduler.unregister_world(world_id=1)
```

## Monitoring & Observability

### Logs

Scheduler emits structured logs at DEBUG and INFO levels:

```python
# DEBUG: Detailed tick information
logger.debug(
    f"World {world_id} time advanced by {delta_game_seconds:.2f}s "
    f"(real: {delta_real_seconds:.2f}s, scale: {timeScale})"
)

# DEBUG: NPC selection
logger.debug(
    f"Selected {total} NPCs for simulation in world {world_id}: "
    f"detailed=5, active=15, ambient=30"
)

# DEBUG: Budget exhaustion
logger.debug(
    f"Reached max NPC ticks ({maxNpcTicksPerStep}) for world {world_id}"
)

# INFO: World registration
logger.info(
    f"Registered world {world_id} for simulation "
    f"(current time: {world_time:.2f}s, timeScale: {timeScale})"
)

# ERROR: Tick failures
logger.error(f"Error ticking world {world_id}: {error}", exc_info=True)
```

### Metrics

Access via `get_stats()` methods:

```python
# Per-world stats
context_stats = context.get_stats()
{
    "world_id": 1,
    "current_world_time": 86400.0,  # 1 game day
    "ticks_processed": 1000,
    "npcs_simulated_last_tick": 45,
    "jobs_enqueued_last_tick": 3,
    "npcs_per_tier": {
        "detailed": 5,
        "active": 15,
        "ambient": 20,
        "dormant": 5
    },
    "last_tick_duration_ms": 12.5,
    "average_tick_duration_ms": 10.8,
    "config": { ... }
}

# All worlds
scheduler_stats = scheduler.get_stats()
{
    "registered_worlds": 3,
    "worlds": {
        1: { ... },
        2: { ... },
        3: { ... }
    }
}
```

### Prometheus Integration (Future)

Add metrics endpoint:

```python
from prometheus_client import Counter, Gauge, Histogram

npc_ticks = Counter('pixsim_npc_ticks_total', 'NPCs simulated', ['world_id', 'tier'])
tick_duration = Histogram('pixsim_tick_duration_seconds', 'Tick duration', ['world_id'])
world_time = Gauge('pixsim_world_time', 'Current world time', ['world_id'])

# In tick_world():
npc_ticks.labels(world_id=world_id, tier=tier).inc()
tick_duration.labels(world_id=world_id).observe(duration_seconds)
world_time.labels(world_id=world_id).set(context.current_world_time)
```

## Performance Tuning

### Adjust Tick Budgets

If ticks are slow:
- Reduce `maxNpcTicksPerStep` (default: 50)
- Reduce `maxJobOpsPerStep` (default: 10)
- Increase `tickIntervalSeconds` (default: 1.0)

```bash
curl -X PUT /api/v1/worlds/1/scheduler/config \
  -d '{"maxNpcTicksPerStep": 25, "tickIntervalSeconds": 2.0}'
```

### Adjust Time Scale

Speed up/slow down game time:
- `timeScale: 1` - Real-time (1 real second = 1 game second)
- `timeScale: 60` - Default (1 real second = 1 game minute)
- `timeScale: 3600` - Fast (1 real second = 1 game hour)

### Tier Limits

Adjust per-tier NPC limits in config:

```json
{
  "tiers": {
    "detailed": {"maxNpcs": 10},   // Reduce for better performance
    "active": {"maxNpcs": 50},     // Fewer active NPCs
    "ambient": {"maxNpcs": 200},   // Reduce background simulation
    "dormant": {"maxNpcs": 10000}  // Increase dormant capacity
  }
}
```

## Troubleshooting

### Ticks are slow

1. Check tick duration: `context.get_stats()['average_tick_duration_ms']`
2. Reduce work budgets (maxNpcTicksPerStep, maxJobOpsPerStep)
3. Check NPC count per tier: `context.get_stats()['npcs_per_tier']`
4. Increase tickIntervalSeconds to reduce tick frequency

### World time not advancing

1. Check if simulation is paused: `GET /worlds/{id}/scheduler/config`
2. Check scheduler logs for errors
3. Verify world is registered: `scheduler.get_all_contexts()`

### NPCs not being simulated

1. Check behavior component has `nextDecisionAt` set
2. Verify NPCs are in sessions for the world
3. Check tier assignments with simulation.determine_simulation_tier()
4. Review logs: `logger.debug(f"Selected {n} NPCs for simulation")`

### High CPU usage

1. Reduce tick frequency: increase `tickIntervalSeconds`
2. Lower work budgets: `maxNpcTicksPerStep`, `maxJobOpsPerStep`
3. Check for NPC tier distribution (too many in detailed/active tiers)
4. Profile tick duration and optimize slow operations

## Migration Guide

### Existing Games

For games with existing sessions:

1. **World state initialization**:
   ```python
   # Create GameWorldState if missing
   world_state = GameWorldState(world_id=world_id, world_time=0.0)
   db.add(world_state)
   await db.commit()
   ```

2. **Session world_time**:
   - Sessions can keep independent world_time or use world-level time
   - Default: use `GameWorldState.world_time`

3. **NPC behavior state**:
   ```python
   # Initialize behavior component for NPCs
   from pixsim7.backend.main.domain.game.ecs import set_npc_component

   for npc_id in npc_ids:
       set_npc_component(session, npc_id, "behavior", {
           "nextDecisionAt": 0,  # Ready for first decision
           "simulationTier": "active",
           "currentActivity": None
       })
   ```

4. **Scheduler config**:
   ```python
   # Add to GameWorld.meta
   from pixsim7.backend.main.domain.game.schemas import get_default_world_scheduler_config

   world.meta = world.meta or {}
   world.meta["simulation"] = get_default_world_scheduler_config()
   await db.commit()
   ```

## Future Enhancements

### Phase 21.5: Generation Backpressure (Deferred)

Integration points exist but need implementation:
- `_get_pending_generation_requests()` - Query session flags
- Integrate with GenerationService to enqueue jobs
- Respect per-world and per-user quotas

### Phase 21.6: Chain Timing (Deferred)

Requires interaction system updates:
- Fix `lastInteractionAt` to use world_time
- Add chain progression in `tick_world()`
- Implement waitSeconds/Minutes/Hours/Days helpers

### Behavior System Integration

Full activity selection and effects:
- Call behavior system to choose activities
- Apply effects (energy, mood, relationships)
- Update locations based on activities
- Routine graph traversal

## References

- Task Document: `claude-tasks/21-world-time-and-simulation-scheduler-unification.md`
- Implementation: `pixsim7/backend/main/services/simulation/`
- Admin APIs: `pixsim7/backend/main/api/v1/game_worlds.py`
- Schemas: `pixsim7/backend/main/domain/game/schemas.py` (WorldSchedulerConfigSchema)
- Frontend Types: `frontend/src/types/game.ts`

## Support

For issues or questions:
1. Check logs: `docker logs pixsim7-backend | grep scheduler`
2. Review metrics: `GET /api/v1/worlds/{id}/scheduler/config`
3. Consult task document for architecture details
