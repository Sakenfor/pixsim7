# Social Metrics System

**Last Updated:** 2025-11-19

This document describes the social metrics system for PixSim7, which provides a unified framework for computing, previewing, and displaying derived social values like relationship tiers, NPC moods, and reputation bands.

> **For Agents**
> - Backend evaluators in `pixsim7/backend/main/domain/metrics/*` and the preview APIs are **authoritative** for metric values; TS helpers mirror them for tools and UI.
> - When adding or changing a metric, update **both**: Python evaluators + TypeScript types (`packages/types/src/game.ts`) and game engine helpers.
> - Do not compute relationship tiers/intimacy in arbitrary frontend code; use preview APIs or backend‑normalized session data.
> - Related tasks (roadmap/status):  
>   - `claude-tasks/07-relationship-preview-api-and-metrics.md`  
>   - `claude-tasks/08-social-metrics-and-npc-systems.md`

## Overview

The social metrics system consists of:

1. **Backend Evaluators**: Python functions that compute metrics from session state and world schemas
2. **Preview API**: REST endpoints for stateless metric computation ("what-if" scenarios)
3. **TypeScript Types**: Shared type definitions in `@pixsim7/types`
4. **Game Engine Helpers**: Client-side computation and API client functions
5. **World Schemas**: JSON configuration in `GameWorld.meta` defining metric thresholds and bands

The system is designed to be:
- **Schema-driven**: Worlds can customize metric bands and thresholds
- **Stateless**: Preview endpoints don't mutate game state
- **Type-safe**: Full TypeScript types from backend to frontend
- **Extensible**: Easy to add new metric types

---

## Supported Metrics

### 1. Relationship Tier

**Purpose**: Categorize player-NPC relationships based on affinity

**Metric ID**: `relationship_tier`

**Input**: Affinity value (0-100)

**Output**: Tier ID (e.g., "stranger", "friend", "lover")

**Default Tiers**:
- `stranger` (0-20)
- `acquaintance` (20-40)
- `friend` (40-60)
- `close_friend` (60-80)
- `lover` (80-100)

**Schema Location**: `GameWorld.meta.relationship_schemas[schema_key]`

**Backend Evaluator**: Use the generic stat preview API in `pixsim7/backend/main/api/v1/stat_preview.py` (statDefinitionId = "relationships").

**Preview Endpoint**: `POST /api/v1/game/relationships/preview-tier`

**Game Engine Helper**: `previewRelationshipTier(args)`

---

### 2. Intimacy Level

**Purpose**: Determine romantic/physical intimacy level based on multiple relationship axes

**Metric ID**: `relationship_intimacy`

**Input**: Relationship values (affinity, trust, chemistry, tension)

**Output**: Intimacy level ID (e.g., "light_flirt", "deep_flirt", "intimate") or null

**Default Behavior**: Returns null if no match (no hardcoded fallback)

**Schema Location**: `GameWorld.meta.intimacy_schema`

**Backend Evaluator**: Use the generic stat preview API in `pixsim7/backend/main/api/v1/stat_preview.py` (statDefinitionId = "relationships").

**Preview Endpoint**: `POST /api/v1/game/relationships/preview-intimacy`

**Game Engine Helper**: `previewIntimacyLevel(args)`

---

### 3. NPC Mood

**Purpose**: Compute NPC emotional state using valence-arousal model

**Metric ID**: `npc_mood`

**Input**:
- Relationship values (affinity, trust, chemistry, tension)
- Optional: Emotional state from NPCEmotionalState table
- Optional: Session ID for automatic relationship lookup

**Output**:
- `mood_id`: Mood quadrant label (e.g., "excited", "content", "anxious", "calm")
- `valence`: Pleasure axis (0-100)
- `arousal`: Energy/activation axis (0-100)
- Optional: `emotion_type` and `emotion_intensity` from EmotionalState system

**Computation**:
```python
valence = affinity * 0.6 + chemistry * 0.4
arousal = chemistry * 0.5 + tension * 0.5
```

**Default Mood Quadrants**:
- `excited`: High valence (50+), high arousal (50+)
- `content`: High valence (50+), low arousal (<50)
- `anxious`: Low valence (<50), high arousal (50+)
- `calm`: Low valence (<50), low arousal (<50)

**Schema Location**: `GameWorld.meta.npc_mood_schema`

**Backend Evaluator**: `pixsim7/backend/main/domain/metrics/mood_evaluators.py::evaluate_npc_mood`

**Preview Endpoint**: `POST /api/v1/game/npc/preview-mood`

**Game Engine Helper**: `previewNpcMood(args)`

**Client-Side Computation**: `getNpcBrainState()` from `@pixsim7/game.engine`

---

### 3b. Unified NPC Mood

**Purpose**: Compute comprehensive NPC mood state combining general mood, intimacy mood, and active emotions

**Metric ID**: `unified_npc_mood`

**Input**:
- Relationship values (affinity, trust, chemistry, tension)
- Optional: Intimacy level ID
- Optional: Session ID for automatic relationship and emotion lookup

**Output**:
- **General Mood**: Valence/arousal-based mood (same as NPC Mood above)
  - `mood_id`: General mood ID (e.g., "excited", "content")
  - `valence`, `arousal`: Emotional axes (0-100)
- **Intimacy Mood** (optional): Romantic/intimate mood when relationship context is intimate
  - `mood_id`: Intimacy mood ID (e.g., "playful", "tender", "passionate")
  - `intensity`: Intimacy mood strength (0-1)
- **Active Emotion** (optional): Event-driven discrete emotion from EmotionalState system
  - `emotion_type`: Emotion type (e.g., "happy", "anxious")
  - `intensity`: Emotion intensity (0-1)
  - `trigger`: Optional trigger description
  - `expires_at`: Optional expiration timestamp

**Mood Domains**:

1. **General Mood** (always computed):
   - Based on valence/arousal model
   - Driven by affinity, chemistry, tension
   - Default quadrants: excited, content, anxious, calm

2. **Intimate Mood** (computed when intimate context detected):
   - Based on chemistry, trust, tension axes
   - Only computed for non-platonic intimacy levels or high chemistry
   - Default moods: playful, tender, passionate, conflicted, shy, eager

3. **Active Emotion** (computed when available):
   - Event-driven discrete emotions from NPCEmotionalState table
   - Represents temporary emotional state from specific triggers
   - Uses EmotionType enum (happy, sad, angry, curious, etc.)

**Intimacy Mood Computation**:

Intimacy mood is computed when:
- `intimacy_level_id` is non-platonic (not "platonic" or null)
- Chemistry > 20

Default heuristics:
```python
# High chemistry + low trust = conflicted
if chemistry > 60 and trust < 40:
    mood_id = "conflicted"

# High chemistry + high tension = passionate
if chemistry > 70 and tension > 50:
    mood_id = "passionate"

# High trust + moderate chemistry = tender
if trust > 60 and chemistry > 40:
    mood_id = "tender"

# Early stage flirting = playful
if chemistry < 60 and intimacy_level_id in ("light_flirt", "deep_flirt"):
    mood_id = "playful"

# Default = shy
else:
    mood_id = "shy"
```

**Schema Location**: `GameWorld.meta.npc_mood_schema`

**Schema Format** (extended domain-based format):
```json
{
  "npc_mood_schema": {
    "general": {
      "moods": [
        {
          "id": "excited",
          "valence_min": 50,
          "valence_max": 100,
          "arousal_min": 50,
          "arousal_max": 100
        }
      ]
    },
    "intimate": {
      "moods": [
        {
          "id": "playful",
          "chemistry_min": 0,
          "chemistry_max": 60,
          "trust_min": 0,
          "trust_max": 100,
          "tension_min": 0,
          "tension_max": 100
        },
        {
          "id": "passionate",
          "chemistry_min": 70,
          "chemistry_max": 100,
          "trust_min": 0,
          "trust_max": 100,
          "tension_min": 50,
          "tension_max": 100
        }
      ]
    }
  }
}
```

**Legacy Schema Support**: For backward compatibility, the old flat format is still supported:
```json
{
  "npc_mood_schema": {
    "moods": [...]  // Treated as "general" domain
  }
}
```

**Backend Evaluator**: `pixsim7/backend/main/domain/metrics/mood_evaluators.py::evaluate_unified_npc_mood`

**Preview Endpoint**: `POST /api/v1/game/npc/preview-unified-mood`

**Game Engine Helper**: `previewUnifiedMood(args)` from `@pixsim7/game.engine`

**NPC Brain Integration**: `getNpcBrainState({ unifiedMood })` accepts optional unified mood parameter

**Mood Debug Tool**: `apps/main/src/plugins/worldTools/moodDebug.tsx` displays unified mood when available

**Related Documentation**:
- `docs/INTIMACY_AND_GENERATION.md` - How intimacy mood flows into generation
- `docs/RELATIONSHIPS_AND_ARCS.md` - Relationship and intimacy context
- `claude-tasks/14-unified-mood-and-brain-integration.md` - Implementation roadmap

---

### 4. Reputation Band

**Purpose**: Categorize reputation between entities (player-NPC, NPC-NPC, faction)

**Metric ID**: `reputation_band`

**Input**:
- `subject_id`, `subject_type` (player or npc)
- Optional: `target_id`, `target_type` (npc, faction, group)
- Optional: `reputation_score` (explicit override)
- Optional: `session_id` (for relationship lookup)
- Optional: `faction_membership` (dict of faction standings)

**Output**:
- `reputation_band`: Band ID (e.g., "enemy", "neutral", "ally")
- `reputation_score`: Numeric score (0-100)

**Default Bands**:
- `enemy` (0-20)
- `hostile` (20-40)
- `neutral` (40-60)
- `friendly` (60-80)
- `ally` (80-100)

**Schema Location**: `GameWorld.meta.reputation_schemas[target_type]`

**Target-Type-Specific Schemas**: Can define different bands for "npc", "faction", "group"

**Backend Evaluator**: `pixsim7/backend/main/domain/metrics/reputation_evaluators.py::evaluate_reputation_band`

**Preview Endpoint**: `POST /api/v1/game/reputation/preview-reputation`

**Game Engine Helper**: `previewReputationBand(args)`

---

## Architecture

### Backend Layer

**Location**: `pixsim7/backend/main/domain/metrics/`

**Components**:
- `types.py`: MetricType enum and MetricEvaluator protocol
- `registry.py`: Metric evaluator registration (future)
- `stat_preview.py`: Generic stat preview API (relationships, skills, reputation, etc.)
- `mood_evaluators.py`: NPC mood evaluator
- `reputation_evaluators.py`: Reputation band evaluator

**Evaluator Pattern**:
```python
async def evaluate_metric(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    """
    Args:
        world_id: World ID for schema lookup
        payload: Metric-specific input data
        db: Database session

    Returns:
        Metric-specific result dictionary

    Raises:
        ValueError: Invalid input or world not found
    """
```

### API Layer

**Locations**: `pixsim7/backend/main/api/v1/game_*.py`

**Endpoints**:
- `POST /api/v1/game/relationships/preview-tier`
- `POST /api/v1/game/relationships/preview-intimacy`
- `POST /api/v1/game/npc/preview-mood`
- `POST /api/v1/game/reputation/preview-reputation`

**Route Plugins**: `pixsim7/backend/main/routes/game_*_preview/manifest.py`

All endpoints:
- Are **stateless** (no session mutations)
- Use Pydantic models for request/response validation
- Return 400 for invalid input, 404 for missing world
- Support CORS for frontend access

### Type Layer

**Location**: `packages/types/src/game.ts`

**Types**:
- `MetricId`: Union type of all metric IDs
- `MetricPreviewRequest<M>`: Generic preview request
- `MetricPreviewResponse<M>`: Generic preview response
- Specific request/response types for each metric

**Design**: Generic types with type parameter `M` for metric-specific constraints

### Game Engine Layer

**Location**: `packages/game/engine/src/`

**Modules**:
- `metrics/preview.ts`: API client for metric preview
- `relationships/preview.ts`: Relationship-specific preview helpers (legacy)
- `npcs/brain.ts`: Client-side mood computation

**Functions**:
- `previewNpcMood(args)`: Calls mood preview API
- `previewReputationBand(args)`: Calls reputation preview API
- `previewRelationshipTier(args)`: Calls tier preview API
- `previewIntimacyLevel(args)`: Calls intimacy preview API
- `getNpcBrainState(params)`: Client-side mood computation (no API call)

**Configuration**:
```typescript
configureMetricPreviewApi({
  baseUrl: '/api/v1',
  fetch: customFetch
});
```

---

## World Schema Configuration

All metrics use `GameWorld.meta` for world-specific configuration.

### Relationship Tier Schema

```json
{
  "relationship_schemas": {
    "default": {
      "tiers": [
        {
          "id": "stranger",
          "label": "Stranger",
          "affinity_min": 0,
          "affinity_max": 20
        },
        {
          "id": "friend",
          "label": "Friend",
          "affinity_min": 40,
          "affinity_max": 60
        }
      ]
    },
    "romantic": {
      "tiers": [
        {
          "id": "crush",
          "label": "Crush",
          "affinity_min": 60,
          "affinity_max": 80
        }
      ]
    }
  }
}
```

**Multiple Schemas**: Use `schema_key` parameter to select specific schema

### Intimacy Level Schema

```json
{
  "intimacy_schema": {
    "levels": [
      {
        "id": "light_flirt",
        "label": "Light Flirt",
        "affinity_min": 40,
        "chemistry_min": 30,
        "trust_min": 20,
        "tension_max": 40
      },
      {
        "id": "intimate",
        "label": "Intimate",
        "affinity_min": 70,
        "chemistry_min": 70,
        "trust_min": 60,
        "tension_max": 40
      }
    ]
  }
}
```

**Multi-Axis Matching**: All conditions must be satisfied for a match

### NPC Mood Schema

```json
{
  "npc_mood_schema": {
    "moods": [
      {
        "id": "excited",
        "label": "Excited",
        "valence_min": 50,
        "valence_max": 100,
        "arousal_min": 50,
        "arousal_max": 100
      },
      {
        "id": "content",
        "label": "Content",
        "valence_min": 50,
        "valence_max": 100,
        "arousal_min": 0,
        "arousal_max": 50
      }
    ]
  }
}
```

**Valence/Arousal Quadrants**: Define mood regions in 2D emotional space

### Reputation Band Schema

```json
{
  "reputation_schemas": {
    "default": {
      "bands": [
        {"id": "enemy", "min": 0, "max": 20},
        {"id": "neutral", "min": 40, "max": 60},
        {"id": "ally", "min": 80, "max": 100}
      ]
    },
    "faction": {
      "bands": [
        {"id": "hated", "min": 0, "max": 25},
        {"id": "honored", "min": 75, "max": 100}
      ]
    }
  }
}
```

**Target-Type-Specific**: Different bands for player-NPC vs faction reputation

---

## Session Data

Metrics read from `GameSession` for runtime data.

### Relationships

**Location**: `GameSession.stats["relationships"]`

```json
{
  "npc:12": {
    "affinity": 75.0,
    "trust": 60.0,
    "chemistry": 80.0,
    "tension": 20.0,
    "tierId": "close_friend",
    "intimacyLevelId": "deep_flirt",
    "flags": {"first_date": true}
  },
  "npcPair:12:15": {
    "friendship": 0.8,
    "rivalry": 0.2
  }
}
```

**Key Formats**:
- `npc:{id}` - Player-NPC relationship
- `npcPair:{id1}:{id2}` - NPC-NPC relationship

### Emotional States

**Location**: `npc_emotional_states` table (database)

**Fields**:
- `npc_id`, `session_id`
- `emotion`: EmotionType enum (happy, sad, angry, etc.)
- `intensity`: 0.0-1.0
- `duration_seconds`, `decay_rate`
- `triggered_by`, `context`
- `is_active`, `expires_at`

**Query**: By `npc_id` and `session_id`, ordered by intensity

### NPC Flags

**Location**: `GameSession.flags.npcs["npc:{id}"]`

```json
{
  "npcs": {
    "npc:12": {
      "personality": {
        "traits": {"openness": 75, "extraversion": 80},
        "tags": ["playful", "romantic"],
        "conversation_style": "warm"
      },
      "memories": [
        {
          "id": "mem1",
          "timestamp": "2024-01-15T10:00:00Z",
          "summary": "Player helped with quest",
          "tags": ["helpful", "quest"]
        }
      ]
    }
  }
}
```

---

## Usage Patterns

### When to Use Preview API vs Client-Side

**Use Preview API** (`previewNpcMood`, `previewReputationBand`):
- ✅ Editor tools showing "what-if" scenarios
- ✅ Relationship sliders with live mood preview
- ✅ Scenario planning tools
- ✅ World schema editors testing threshold changes
- ✅ Dialogue/action composition showing outcomes

**Use Client-Side** (`getNpcBrainState`):
- ✅ Runtime display of current mood (like moodDebug tool)
- ✅ Real-time updates during gameplay
- ✅ Performance-critical UI (avoid API roundtrips)
- ✅ Offline/local-only scenarios

**Rule of Thumb**: Use preview API for hypothetical/planning scenarios, client-side for live gameplay display.

### Example: Relationship Schema Editor

```typescript
import { previewRelationshipTier } from '@pixsim7/game.engine';

// User adjusts affinity slider
const handleAffinityChange = async (newAffinity: number) => {
  const preview = await previewRelationshipTier({
    worldId: currentWorld.id,
    affinity: newAffinity,
    schemaKey: 'default'
  });

  setPreviewTier(preview.tierId);
  // Show: "At affinity 75, relationship would be 'close_friend'"
};
```

### Example: NPC Mood Preview in Dialogue Editor

```typescript
import { previewNpcMood } from '@pixsim7/game.engine';

// Show mood after dialogue choice applies relationship changes
const previewChoiceOutcome = async (choice: DialogueChoice) => {
  const currentRel = getCurrentRelationship(npcId);

  // Apply choice effects
  const newRel = {
    affinity: currentRel.affinity + choice.effects.affinityChange,
    trust: currentRel.trust + choice.effects.trustChange,
    chemistry: currentRel.chemistry + choice.effects.chemistryChange,
    tension: currentRel.tension + choice.effects.tensionChange,
  };

  const newMood = await previewNpcMood({
    worldId: currentWorld.id,
    npcId: npcId,
    relationshipValues: newRel
  });

  // Display: "This choice would make NPC 'excited' (valence: 85, arousal: 60)"
};
```

### Example: Live Mood Display

```typescript
import { getNpcBrainState, getNpcRelationshipState } from '@pixsim7/game.engine';

// Runtime mood display (no API call)
const DisplayNpcMood = ({ npcId, session }) => {
  const relState = getNpcRelationshipState(session, npcId);
  const brainState = getNpcBrainState({
    npcId,
    session,
    relationship: relState
  });

  return (
    <div>
      <Badge color={getMoodColor(brainState.mood.label)}>
        {brainState.mood.label}
      </Badge>
      <span>Valence: {brainState.mood.valence.toFixed(1)}</span>
      <span>Arousal: {brainState.mood.arousal.toFixed(1)}</span>
    </div>
  );
};
```

---

## Schema Editing Guidelines

### Safe Schema Edits

✅ **Adding new tiers/levels/moods/bands**:
- Append to existing lists
- Does not break existing session data
- Example: Adding "best_friend" tier between "close_friend" and "lover"

✅ **Adjusting thresholds**:
- Change min/max values
- Affects future computations only
- Example: Changing "friend" from (40-60) to (45-65)

✅ **Changing labels**:
- Display text only
- Does not affect logic
- Example: "lover" → "romantic_partner"

✅ **Adding target-type-specific schemas**:
- Extend reputation_schemas with new target types
- Example: Adding "guild" reputation schema

### Unsafe Schema Edits

❌ **Removing tiers/bands**:
- Breaks session data referencing those IDs
- Must migrate session data first
- Example: Removing "acquaintance" tier

❌ **Changing IDs**:
- Breaks session references
- Must migrate all affected sessions
- Example: Changing "stranger" → "unknown"

❌ **Creating overlapping ranges**:
- Causes ambiguous matches
- First match wins, but unpredictable
- Example: "friend" (40-60) and "good_friend" (50-70)

❌ **Invalid min/max values**:
- Max < min causes no matches
- Values outside 0-100 never match
- Example: min=70, max=60

### Migration Best Practices

1. **Test in dev world first**: Create test world with new schema
2. **Export/backup session data**: Before making breaking changes
3. **Write migration script**: Update session data if changing IDs
4. **Document custom schemas**: Add description to world meta
5. **Keep default as fallback**: Don't remove default schema

### Schema Validation (Phase 9)

Future validation features:
- Check for overlapping ranges
- Ensure min < max for all ranges
- Validate all values in 0-100 bounds
- Warn on gaps in coverage
- Preview impact on existing sessions

---

## Integration with Existing Systems

### Relationship System

**Files**:
- `docs/RELATIONSHIPS_AND_ARCS.md`
- `packages/game/engine/src/relationships/`

**Integration**: Metrics read from `GameSession.stats["relationships"]`, compute derived values

### NPC Brain System

**Files**:
- `packages/game/engine/src/npcs/brain.ts`
- `docs/architecture/subsystems/npc-architecture.md`

**Integration**: `getNpcBrainState()` includes mood computation, can optionally call preview API

### Emotional State System

**Files**:
- `pixsim7/backend/main/domain/npc_memory.py`
- `pixsim7/backend/main/services/npc/emotional_state_service.py`

**Integration**: Mood evaluator reads from NPCEmotionalState table, returns dominant emotion

### Action Block System

**Files**:
- `pixsim7/backend/main/domain/narrative/action_blocks/types.py`
- `docs/ACTION_BLOCKS_UNIFIED_SYSTEM.md`

**Integration**: Action blocks have separate mood tags (playful, tender, passionate) describing the action, not the NPC state

### Mood Debug Tool

**File**: `apps/main/src/plugins/worldTools/moodDebug.tsx`

**Integration**: Uses `getNpcBrainState()` for live mood display

---

## Extension Points

### Adding New Metrics

1. **Add metric type to enum**: `MetricType` in `pixsim7/backend/main/domain/metrics/types.py`
2. **Create evaluator**: New file in `pixsim7/backend/main/domain/metrics/`
3. **Register evaluator**: Add to `__init__.py` exports
4. **Create API endpoint**: New file in `pixsim7/backend/main/api/v1/`
5. **Create route plugin**: New manifest in `pixsim7/backend/main/routes/`
6. **Add TypeScript types**: Extend `packages/types/src/game.ts`
7. **Add game engine helper**: Extend `packages/game/engine/src/metrics/preview.ts`
8. **Export from game engine**: Add to `packages/game/engine/src/index.ts`
9. **Document schema location**: Update this doc and Phase 7 summary
10. **Update APP_MAP.md**: Add to social metrics section

### Example: Skill Level Metric

Potential future metric for skill progression:

```python
# Backend
class MetricType(str, Enum):
    SKILL_LEVEL = "skill_level"

async def evaluate_skill_level(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    skill_xp = payload["skill_xp"]
    skill_type = payload["skill_type"]

    # Load skill progression schema
    world = await get_world(db, world_id)
    skill_schema = world.meta.get("skill_schemas", {}).get(skill_type)

    # Compute skill level from XP
    skill_level = compute_level_from_xp(skill_xp, skill_schema)

    return {
        "skill_level": skill_level,
        "skill_xp": skill_xp,
        "skill_type": skill_type
    }
```

```typescript
// Frontend
interface SkillLevelPreviewRequest {
  worldId: number;
  skillXp: number;
  skillType: string;
}

interface SkillLevelPreviewResponse {
  skillLevel: number;
  skillXp: number;
  skillType: string;
}

export async function previewSkillLevel(
  args: SkillLevelPreviewRequest
): Promise<SkillLevelPreviewResponse> {
  // Call POST /api/v1/game/skills/preview-level
}
```

---

## Testing

### Backend Tests

Location: `pixsim7/backend/main/tests/domain/metrics/`

Test cases:
- Schema loading and fallback behavior
- Range matching and boundary conditions
- Invalid input handling
- Multi-axis matching (intimacy)
- Valence/arousal computation (mood)

### Frontend Tests

Location: `packages/game/engine/src/metrics/__tests__/`

Test cases:
- API client calls with correct payloads
- Error handling and retries
- Configuration management
- Type safety validation

### Integration Tests

Test scenarios:
- End-to-end metric preview workflow
- Schema changes affecting computations
- Session data migration
- Client-side vs API result consistency

---

## Performance Considerations

### Caching

**Current**: No caching (stateless endpoints)

**Future**: Consider caching for:
- World schema lookups (rarely change)
- Dominant emotion queries (session-scoped)

### Batching

**Current**: One metric per API call

**Future**: Batch preview endpoint for multiple metrics

### Client-Side Optimization

**Current**: `getNpcBrainState()` is synchronous and fast

**Recommendation**: Use client-side for runtime display, API for planning

---

## See Also

- [RELATIONSHIPS_AND_ARCS.md](./RELATIONSHIPS_AND_ARCS.md) - Relationship mechanics and session data
- [NPC Architecture](./architecture/subsystems/npc-architecture.md) - NPC personality and brain state
- [APP_MAP.md](./APP_MAP.md) - System architecture overview
- Task 07: [07-relationship-preview-api-and-metrics.md](../claude-tasks/07-relationship-preview-api-and-metrics.md) - Relationship metrics implementation
- Task 08: [08-social-metrics-and-npc-systems.md](../claude-tasks/08-social-metrics-and-npc-systems.md) - Social metrics implementation (this system)

---

## Changelog

- **2025-11-19**: Added Unified NPC Mood System (Task 14)
  - New metric: Unified NPC Mood combining general, intimate, and emotion domains
  - Extended mood schema format to support domain-based configuration
  - Backward compatible with legacy mood schemas
  - NPC Brain integration with unified mood support
  - Mood Debug tool displays intimacy moods and active emotions

- **2025-11-19**: Initial documentation (Phase 8 of Task 08)
  - All 4 metrics documented
  - Schema locations defined
  - Usage patterns established
  - Integration points identified
