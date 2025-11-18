# NPC Persona Architecture

## Overview

This document describes the architecture for NPC persona data management in PixSim7, including where persona data lives, how it's accessed, and how different data sources are merged.

## Truth Sources

### 1. Base Persona (Backend Authoritative)

**Location:** `GameNPC.personality` (PostgreSQL JSON column)

**Contains:**
- `traits`: Personality traits using the Big Five model (openness, conscientiousness, extraversion, agreeableness, neuroticism)
- `tags`: Descriptive persona tags (e.g., "playful", "romantic", "adventurous", "shy")
- `conversation_style`: How the NPC communicates (e.g., "warm", "distant", "playful", "formal")
- Additional custom fields as needed

**Updated via:**
- Admin/editor tools
- Backend API endpoints
- Direct database modifications (for development/testing)

**Example:**
```json
{
  "traits": {
    "openness": 75,
    "conscientiousness": 60,
    "extraversion": 80,
    "agreeableness": 70,
    "neuroticism": 40
  },
  "tags": ["playful", "romantic", "curious"],
  "conversation_style": "warm"
}
```

### 2. Session Overrides (Per-Session, Temporary)

**Location:** `GameSession.flags.npcs["npc:${id}"]`

**Contains:**
- Temporary trait modifiers (from drugs, spells, mood effects)
- Temporary persona tag additions
- Temporary conversation style overrides
- Event-based personality changes

**Updated via:**
- Scene effects (e.g., "drunk" status adds traits, tags)
- Game events (e.g., story moments that temporarily change personality)
- Relationship milestones
- Spell/drug effects

**Lifetime:** Session duration only (cleared when session ends)

**Example:**
```json
{
  "npcs": {
    "npc:12": {
      "personality": {
        "traits": {
          "extraversion": 90  // Boosted by "confidence potion"
        },
        "tags": ["energetic", "bold"]  // Added by scene effect
      },
      "memories": [...],
      "preferences": {...}
    }
  }
}
```

### 3. Runtime State (Client-Side Cache)

**Location:** `PixSim7Core.personaCache` (in-memory Map)

**Contains:**
- Merged persona (base + session overrides)
- Pre-fetched persona data for quick access

**Updated via:**
- `core.preloadNpcPersona(npcId)` - Fetches and caches
- `core.invalidatePersona(npcId)` - Clears cache

**Lifetime:** Until explicitly invalidated or session changes

**Purpose:**
- Performance optimization (avoid repeated API calls)
- Enables synchronous access to persona data via `getNpcBrainState()`

## Data Flow & Merge Priority

When building NPC brain state, data is merged in this priority order:

1. **Session overrides** (highest priority) - `GameSession.flags.npcs["npc:ID"].personality`
2. **Base personality** - `GameNPC.personality`
3. **Default values** (lowest priority) - Hardcoded defaults if neither source provides data

### Merge Behavior

**Traits:**
- Session traits override base traits
- Unspecified traits use base values
- If both are empty, use defaults (50 for each Big Five trait)

**Tags:**
- Session tags are **added** to base tags (not replaced)
- Duplicates are removed
- If both are empty, use defaults (["friendly", "curious"])

**Conversation Style:**
- Session style completely replaces base style
- If neither is set, derive from traits + relationship state

## API Usage

### Fetching Persona

```typescript
import { createPixSim7Core } from '@pixsim7/game-core';

// 1. Configure persona provider
const core = createPixSim7Core({
  npcPersonaProvider: {
    async getNpcPersona(npcId: number) {
      const npc = await fetchNpcFromBackend(npcId);
      return npc.personality; // Returns GameNPC.personality field
    }
  }
});

// 2. Preload persona (async, caches result)
await core.preloadNpcPersona(12);

// 3. Build brain state (sync, uses cached persona)
const brain = core.getNpcBrainState(12);
```

### Invalidating Cache

```typescript
// When NPC personality is updated (e.g., via admin UI)
core.invalidatePersona(npcId);

// Next call to getNpcBrainState will rebuild without cached persona
// (unless preloadNpcPersona is called again)
const updatedBrain = core.getNpcBrainState(npcId);
```

### Event Handling

```typescript
// Listen for persona cache events
core.on('persona:loaded', ({ npcId, persona }) => {
  console.log(`Persona loaded for NPC ${npcId}`, persona);
});

core.on('persona:invalidated', ({ npcId }) => {
  console.log(`Persona cache cleared for NPC ${npcId}`);
});
```

## Implementation Details

### buildNpcBrainState Function

The `buildNpcBrainState` function (in `packages/game-core/src/npcs/brain.ts`) handles merging:

```typescript
export function buildNpcBrainState(params: {
  npcId: number;
  session: GameSessionDTO;
  relationship: NpcRelationshipState;
  persona?: NpcPersona;  // Optional base persona
}): NpcBrainState {
  // 1. Merge base persona with session overrides
  const mergedPersona = mergeNpcPersona(
    params.persona,
    params.npcId,
    params.session
  );

  // 2. Extract relationship state
  // 3. Compute mood from relationship
  // 4. Build complete brain state
  // ...
}
```

### PixSim7Core Integration

The `PixSim7Core` class provides:

- **Persona cache** (`personaCache: Map<number, NpcPersona>`)
- **Preload method** (`preloadNpcPersona(npcId)`)
- **Cache access** (`getCachedPersona(npcId)`)
- **Invalidation** (`invalidatePersona(npcId)`)
- **Auto-clear on session load** (cache is cleared when new session loads)

## Schema Notes

**No new database columns needed!** All persona data uses existing JSON fields:

- `GameNPC.personality` (already exists)
- `GameSession.flags` (already exists)
- `GameSession.relationships` (already exists)

This architecture is **schema-stable** and requires no migrations.

## Use Cases

### Use Case 1: NPC Editor (Admin UI)

```typescript
// 1. Fetch NPC from backend
const npc = await fetchNpc(12);

// 2. Update personality
npc.personality = {
  traits: { openness: 80, extraversion: 90, ... },
  tags: ["playful", "romantic"],
  conversation_style: "warm"
};

// 3. Save to backend
await saveNpc(npc);

// 4. Invalidate cache so next brain state uses new data
core.invalidatePersona(12);
```

### Use Case 2: Temporary Scene Effect

```typescript
// Scene applies "drunk" effect
await applySceneEffect(sessionId, npcId, {
  type: 'status_effect',
  effect: 'drunk',
  modifiers: {
    personality: {
      traits: {
        extraversion: 95,  // Boosted
        conscientiousness: 20  // Lowered
      },
      tags: ['reckless', 'uninhibited']
    }
  }
});

// Invalidate to rebuild brain state with new session data
core.invalidatePersona(npcId);
```

### Use Case 3: Live Preview in NPC Preferences Editor

```typescript
// User edits preferences in UI
const updatedPreferences = { ...preferences, sensitivity: { overall: 2.0 } };

// Build preview brain state with updated preferences
const mockSession = createMockSession(npc, updatedPreferences);
const previewBrain = buildNpcBrainState({
  npcId: npc.id,
  session: mockSession,
  relationship: mockRelationshipState,
  persona: basePersona
});

// Render BrainShape with preview state
<BrainShape brainState={previewBrain} />
```

## Best Practices

1. **Always preload personas before rendering UI** - Call `preloadNpcPersona()` in useEffect hooks
2. **Invalidate cache when data changes** - Call `invalidatePersona()` after updates
3. **Use session overrides for temporary effects** - Don't modify base personality for temporary changes
4. **Keep base persona authoritative** - Session overrides should be cleared when session ends
5. **Listen to events for reactivity** - Subscribe to `persona:loaded` and `persona:invalidated` events

## Future Considerations

- **Persona versioning** - Track when personality was last updated
- **Diff tracking** - Log changes to personality over time
- **Undo/redo** - Support reverting personality changes
- **Preset library** - Reusable personality archetypes
- **A/B testing** - Compare different personality configurations
