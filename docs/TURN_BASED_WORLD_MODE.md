# Turn-Based World Mode

Turn-based world mode is a first-class feature in PixSim7 that allows you to create single-player life-sim experiences where time only advances when the player explicitly takes a turn.

## Overview

The system supports two distinct world modes:
- **Turn-Based Mode**: Time only advances when the player clicks "End Turn"
- **Real-Time Mode**: Time advances continuously (traditional approach)

Both modes leverage the same underlying systems:
- World time tracking (`GameWorldState.world_time`)
- NPC schedules and presence
- Location-based gameplay
- Relationship management

## Session Flags Structure

World mode is controlled via `GameSession.flags`:

```typescript
interface SessionFlags {
  sessionKind: 'world' | 'scene';
  world?: {
    id: string;                    // Conceptual world identifier
    mode: 'turn_based' | 'real_time';
    currentLocationId?: number;
    turnDeltaSeconds?: number;     // For turn-based: seconds per turn (default: 3600 = 1 hour)
  };
}
```

## Backend

### Session Service

`GameSessionService` (pixsim7/backend/main/services/game/game_session_service.py) respects session flags:

- `update_session()` accepts `flags` parameter and stores it in JSON
- Backend is passive - time only advances when frontend explicitly calls APIs
- No automatic time progression

### API Endpoints

**Update Session:**
```http
PATCH /api/v1/game/sessions/{session_id}
Content-Type: application/json

{
  "world_time": 7200.0,
  "flags": {
    "sessionKind": "world",
    "world": {
      "id": "my-world",
      "mode": "turn_based",
      "turnDeltaSeconds": 3600
    }
  }
}
```

**Advance World Time:**
```http
POST /api/v1/game/worlds/{world_id}/advance
Content-Type: application/json

{
  "delta_seconds": 3600
}
```

## Frontend

### Game2D Component

The main world UI (`frontend/src/routes/Game2D.tsx`) includes:

**Helper Functions:**
```typescript
// Check if session is in turn-based mode
function isTurnBasedMode(sessionFlags?: Record<string, unknown>): boolean

// Get configured turn delta (default: 3600)
function getTurnDelta(sessionFlags?: Record<string, unknown>): number
```

**Time Advancement:**
- `advanceTime()` function uses `getTurnDelta()` to respect session configuration
- UI button text changes based on mode:
  - Turn-based: "End Turn (1h)" / "End Turn (4h)" etc.
  - Real-time: "Next Hour"

### Session Helpers

Use `createTurnBasedSessionFlags()` to initialize sessions:

```typescript
import { createTurnBasedSessionFlags } from '@/lib/game/session';
import { createGameSession, updateGameSession } from '@/lib/api/game';

// Create a turn-based session with 4-hour turns
const flags = createTurnBasedSessionFlags(
  'my-world-slug',
  14400,  // 4 hours = 4 * 3600 seconds
  locationId
);

const session = await createGameSession(userId, sceneId);
await updateGameSession(session.id, { flags });
```

## NPC Integration

Turn-based mode works seamlessly with the NPC presence/schedule system:

1. **NPCSchedule** defines when NPCs are at locations (day_of_week, start_time, end_time)
2. When time advances, the frontend fetches updated NPC presence
3. NPCs appear/disappear based on the new world_time
4. Players see the world "change" between turns

### Example Flow

```
Turn 1: Monday 08:00
- Player is at Cafe
- Sarah (barista) is present (schedule: Mon 07:00-15:00)
- Player talks to Sarah, advances relationship

Player clicks "End Turn (4h)"

Turn 2: Monday 12:00
- Sarah is still present (still within her schedule)
- New dialogue options may be available based on relationship progress

Player clicks "End Turn (4h)"

Turn 3: Monday 16:00
- Sarah is gone (schedule ended at 15:00)
- Michael (evening shift) is now present (schedule: Mon 15:00-23:00)
```

## Usage Examples

### Example 1: Standard Turn-Based (1 hour turns)

```typescript
const flags = createTurnBasedSessionFlags('city-life', 3600);
// Player advances time 1 hour per turn
```

### Example 2: Long Turn-Based (4 hour turns)

```typescript
const flags = createTurnBasedSessionFlags('mystery-game', 14400);
// Larger time jumps, good for investigation games
```

### Example 3: Real-Time Mode

```typescript
const flags = createRealTimeSessionFlags('open-world');
// Time advances continuously (if implemented with timers)
```

## Testing Turn-Based Mode

1. **Create a test world** with NPCs and schedules
2. **Set session flags** to turn-based mode:
   ```typescript
   await updateGameSession(sessionId, {
     flags: createTurnBasedSessionFlags('test-world', 3600)
   });
   ```
3. **Open Game2D** (`/game2d`)
4. **Verify UI** shows "End Turn (1h)" button
5. **Click "End Turn"** and verify:
   - World time advances by configured delta
   - NPCs appear/disappear based on schedules
   - Relationships persist
   - World state is saved

## Architecture Benefits

### Separation of Concerns
- **Backend**: Passive storage, relationship normalization
- **Frontend**: Active time management, UI controls
- **Game Core**: Shared logic (NPC assignment, schedules)

### Flexibility
- Easy to add new world modes (e.g., `'daily_turns'`, `'action_points'`)
- Turn delta can be changed mid-session
- No database migrations needed (uses JSON flags)

### Consistency
- Same NPC presence/schedule system for both modes
- Same relationship tracking
- Same event system (ready for future event triggering)

## Future Enhancements

### Potential Additions
1. **Action Points**: Limit player actions per turn
2. **Event System**: Trigger events between turns
3. **Auto-advance**: Optional time auto-advancement after N seconds
4. **Turn History**: Track what happened each turn
5. **Turn-based Quests**: Objectives that progress over turns

### Example: Action Points

```typescript
interface WorldSessionFlags {
  mode: 'turn_based';
  turnDeltaSeconds: number;
  actionsPerTurn?: number;        // New: action point system
  currentActionPoints?: number;   // Tracked separately
}
```

## Related Files

| Component | File | Purpose |
|-----------|------|---------|
| **Type Definitions** | `packages/types/src/game.ts` | SessionFlags, WorldMode types |
| **Session Helpers** | `frontend/src/lib/game/session.ts` | Flag creation utilities |
| **Game UI** | `frontend/src/routes/Game2D.tsx` | Turn-based controls |
| **Session Service** | `pixsim7/backend/main/services/game/game_session_service.py` | Session management |
| **World Service** | `pixsim7/backend/main/services/game/game_world_service.py` | Time advancement |
| **NPC Schedules** | `pixsim7/backend/main/domain/game/models.py` | NPCSchedule model |
| **This Doc** | `docs/TURN_BASED_WORLD_MODE.md` | Usage guide |

## Summary

Turn-based world mode provides:
- ✅ Clear session semantics (`sessionKind`, `world.mode`)
- ✅ Configurable turn delta
- ✅ Explicit "End Turn" UI controls
- ✅ Integration with NPC presence/schedules
- ✅ No database migrations required
- ✅ Easy to extend with new features

The system is production-ready and can be used immediately for turn-based life-sim games.
