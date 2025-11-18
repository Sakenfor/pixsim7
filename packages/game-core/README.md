# @pixsim7/game-core

Core game session state management for Pixsim7. Provides immutable and mutable APIs for working with game sessions, relationships, inventory, quests, and events.

## Session Helpers: Immutable vs Mutable

### Immutable API (`session/state.ts`)

**Use for:** Tools, transformations, offline processing, pure functions

The immutable API returns **new session objects** without modifying the input.

```typescript
import { setNpcRelationshipState } from '@pixsim7/game-core';

// Returns NEW session object
const updatedSession = setNpcRelationshipState(session, npcId, { affinity: 50 });

// Original session is unchanged
console.log(session === updatedSession); // false
```

**Benefits:**
- Predictable, pure functions
- Easy to test and reason about
- Safe for concurrent operations
- Enables undo/redo and time-travel debugging

**Use cases:**
- Editor tools and previews
- Batch transformations
- Testing and validation
- Offline processing pipelines

### Mutable API (`session/helpers.ts`)

**Use for:** React state updates, live editing, performance-critical code

The mutable API **modifies session objects in place** and returns void.

```typescript
import { updateArcStage } from '@pixsim7/game-core';

// Mutates session.flags in place
updateArcStage(session, 'prologue', 3);
// No return value, session is modified

console.log(session.flags.arcs.prologue.stage); // 3
```

**Benefits:**
- Zero-copy performance
- Natural for React state updates
- Lower memory overhead
- Direct manipulation

**Use cases:**
- Game2D runtime state
- UI component local state
- High-frequency updates
- Memory-constrained environments

### Recommendation by Layer

| Layer | API Style | Reason |
|-------|-----------|--------|
| **Editor/Tools** | Immutable | Pipeline transformations, previews |
| **Game2D/UI** | Mutable | Local React state → diff → backend |
| **Backend Sync** | Immutable | Always treat backend response as immutable |
| **Tests** | Immutable | Predictable, isolated tests |

## Authority Boundaries

This package contains **client-side helpers** that perform computations for convenience. However, the **backend is always authoritative** for game state.

### Client Fallback Functions

Functions marked with `@authority CLIENT_FALLBACK` compute values locally but should **always defer to backend responses** at runtime.

```typescript
/**
 * @authority CLIENT_FALLBACK
 * @backend_authoritative Use session.relationships["npc:X"].tierId at runtime
 * @use_cases Editor previews, offline tools, tests
 */
export function compute_relationship_tier(affinity: number): string {
  // Client-side approximation
  if (affinity >= 80) return 'romance';
  if (affinity >= 60) return 'close_friend';
  // ...
}
```

**What this means:**
- ✅ Use in editor previews and offline tools
- ✅ Use in tests to validate logic
- ❌ Do NOT use in runtime game code (Game2D, UI)
- ✅ Always use `session.relationships["npc:123"].tierId` from backend response

### Backend Authoritative

The backend computes and caches these values:
- **Relationship tiers** (`tierId`) - Computed from affinity + custom schemas
- **Intimacy levels** (`intimacyLevelId`) - Computed from trust/chemistry/tension
- **Quest state** - Validated against world rules
- **Event triggers** - Checked against conditions and cooldowns

**Flow:**
1. Client applies optimistic update using mutable helpers
2. Client sends update to backend
3. Backend validates, computes derived values, caches in Redis
4. Client receives authoritative response and applies it

## Optimistic Updates Pattern

The `sessionAdapter.ts` wrapper implements optimistic updates for instant UI feedback:

```typescript
import { createSessionHelpers } from './sessionAdapter';

const helpers = createSessionHelpers(
  gameSession,
  (updated) => setGameSession(updated), // React state updater
  api // Backend API client
);

// This will:
// 1. Update local state immediately (optimistic)
// 2. Send update to backend
// 3. Apply server truth or rollback on error
await helpers.updateNpcRelationship(npcId, { affinity: 75 });
```

### Conflict Resolution

Version conflicts are automatically handled:

```typescript
// If server session is newer, the adapter will:
// 1. Detect version mismatch
// 2. Re-apply local changes on top of server state
// 3. Retry update with new version
// 4. Apply final server truth
```

## File Organization

```
packages/game-core/src/
├── relationships/
│   ├── computation.ts    # @authority CLIENT_FALLBACK
│   └── schemas.ts        # Type definitions
├── session/
│   ├── state.ts          # Immutable helpers
│   └── helpers.ts        # Mutable helpers
├── inventory/
│   └── inventory.ts      # Item management
├── quests/
│   └── quests.ts         # Quest state helpers
└── index.ts              # Public API
```

## Best Practices

### ✅ Do

- Use immutable helpers in editor tools
- Use mutable helpers for React state
- Always trust backend responses
- Use optimistic updates for UX
- Mark authority boundaries clearly

### ❌ Don't

- Don't use client fallback functions at runtime
- Don't ignore backend validation errors
- Don't mix immutable/mutable in same function
- Don't bypass optimistic update adapter
- Don't assume client computations match server

## Example: Full Update Flow

```typescript
// 1. User clicks "Gift Flowers" in UI
const handleGiftFlowers = async () => {
  try {
    // 2. Optimistic update (instant UI)
    const updated = await sessionHelpers.updateNpcRelationship(npcId, {
      affinity: currentAffinity + 10
    });

    // 3. Backend validates:
    //    - Checks player has item
    //    - Applies affinity formula
    //    - Computes new tier (e.g., "close_friend" → "romance")
    //    - Caches in Redis
    //    - Returns authoritative session

    // 4. Client receives and applies server truth
    console.log(updated.relationships[`npc:${npcId}`].tierId); // "romance"

  } catch (err) {
    // 5. On error, optimistic update is rolled back
    console.error('Gift failed:', err);
  }
};
```

## Version History

- **v0.2.0** - Added optimistic updates and conflict resolution
- **v0.1.0** - Initial release with immutable/mutable helpers

## License

MIT
