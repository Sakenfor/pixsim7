# NPC Behavior System Documentation

The NPC Behavior System provides a comprehensive, data-driven framework for simulating NPC daily routines, activities, and decision-making in PixSim7.

## 📋 Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Advanced Topics](#advanced-topics)

## 🎯 Overview

The behavior system enables:

- **Graph-based routines** - Visual routine graphs define when NPCs do things
- **Emergent behavior** - NPCs make choices based on preferences, mood, relationships, and context
- **Flexible simulation** - Game-agnostic prioritization works for 2D, 3D, text, or visual novel games
- **Complete extensibility** - Custom conditions, effects, and scoring without code changes
- **Schema versioning** - Forward-compatible schema evolution

### Key Features

✅ **JSON-only storage** - No new database tables
✅ **User-defined categories** - Not limited to hardcoded activity types
✅ **Configurable scoring** - Tune activity selection per world
✅ **Multi-factor decision-making** - Preferences, traits, mood, relationships, urgency, inertia
✅ **World-agnostic** - Same system works for any game type
✅ **Comprehensive validation** - Pydantic schemas catch errors early

## 🧩 Core Concepts

### 1. Activities

**Activities** are reusable templates for "things NPCs can do."

```typescript
{
  "version": 1,
  "id": "activity:work_office",
  "name": "Work at Office",
  "category": "work",

  "requirements": {
    "minEnergy": 30,
    "timeOfDay": ["morning", "afternoon"],
    "conditions": [...]
  },

  "effects": {
    "energyDeltaPerHour": -15,
    "moodImpact": { "valence": -10, "arousal": 5 },
    "relationshipChanges": {
      "role:boss": { "affinity": 1 }
    }
  },

  "minDurationSeconds": 3600,
  "cooldownSeconds": 0,
  "priority": 1.0
}
```

**Key Fields:**
- `requirements` - Gates when activity is available
- `effects` - What happens when NPC performs activity
- `minDurationSeconds` - Prevents rapid activity switching
- `cooldownSeconds` - Prevents repeating too often
- `priority` - Base weight for scoring

### 2. Activity Categories

Categories are **user-defined** (not hardcoded enums):

```json
{
  "activityCategories": {
    "work": {
      "id": "work",
      "label": "Work",
      "icon": "💼",
      "defaultWeight": 0.6
    },
    "magic": {
      "id": "magic",
      "label": "Magic Casting",
      "icon": "🔮",
      "defaultWeight": 0.7
    }
  }
}
```

This allows any world to define custom categories without code changes.

### 3. Routine Graphs

**Routine graphs** control **when** activities are considered using:
- **Time slots** - Activities available during time windows
- **Decision nodes** - Activities available when conditions met
- **Activity nodes** - Direct activity assignments

```typescript
{
  "version": 1,
  "id": "routine:shopkeeper_daily",
  "name": "Shopkeeper Daily Routine",

  "nodes": [
    {
      "id": "morning_work",
      "nodeType": "time_slot",
      "timeRangeSeconds": { "start": 28800, "end": 43200 },
      "preferredActivities": [
        { "activityId": "activity:work_shop", "weight": 2.0 },
        { "activityId": "activity:eat_meal", "weight": 1.5, "conditions": [...] }
      ]
    }
  ],

  "edges": [],

  "defaultPreferences": {
    "categoryWeights": { "work": 0.8, "social": 0.5 }
  }
}
```

### 4. NPC Preferences

NPCs have **preferences** that modulate activity selection:

```typescript
{
  "activityWeights": {
    "activity:work_office": 0.9,  // Loves working
    "activity:socialize": 0.3      // Dislikes socializing
  },

  "categoryWeights": {
    "work": 0.85,
    "leisure": 0.4
  },

  "traitModifiers": {
    "extraversion": 20,            // Introverted
    "conscientiousness": 90        // Very organized
  },

  "favoriteLocations": ["location:office"],
  "preferredNpcIdsOrRoles": ["role:boss"]
}
```

**Preference Cascade (override order):**
```
Routine defaults → NPC defaults → Session overrides
```

### 5. Condition DSL

Conditions gate activities and routine transitions:

```typescript
// Built-in conditions
{ "type": "relationship_gt", "npcIdOrRole": "npc:5", "metric": "affinity", "threshold": 50 }
{ "type": "flag_equals", "key": "arc.romance.stage", "value": 2 }
{ "type": "energy_between", "min": 30, "max": 80 }
{ "type": "mood_in", "moodTags": ["playful", "excited"] }
{ "type": "time_of_day_in", "times": ["morning", "afternoon"] }
{ "type": "random_chance", "probability": 0.3 }

// Custom conditions (extensible!)
{
  "type": "custom",
  "evaluatorId": "evaluator:is_raining",
  "params": {}
}
```

### 6. Scoring System

Activity scores determine selection probability.

**8 Configurable Factors:**

```typescript
{
  "scoringConfig": {
    "version": 1,
    "weights": {
      "baseWeight": 1.0,              // From routine graph
      "activityPreference": 1.0,      // Per-activity NPC preference
      "categoryPreference": 0.8,      // Per-category NPC preference
      "traitModifier": 0.6,           // Personality trait effects
      "moodCompatibility": 0.7,       // Mood tag matching
      "relationshipBonus": 0.5,       // Boost for activities with liked NPCs
      "urgency": 1.2,                 // Needs-based (low energy → boost rest)
      "inertia": 0.3                  // Prefer current activity
    }
  }
}
```

**Tuning Examples:**

| Game Type | Key Weights |
|-----------|-------------|
| Life Sim | High `urgency` (1.5), moderate `categoryPreference` (1.0) |
| Romance | High `relationshipBonus` (1.5), high `moodCompatibility` (0.9) |
| RPG | Balanced across all factors |

### 7. Simulation Prioritization

**Game-agnostic** tier system based on **relevance**, not just distance:

```typescript
{
  "simulationConfig": {
    "tiers": [
      { "id": "high_priority", "tickFrequencySeconds": 1, "detailLevel": "full" },
      { "id": "medium_priority", "tickFrequencySeconds": 60, "detailLevel": "simplified" },
      { "id": "background", "tickFrequencySeconds": 3600, "detailLevel": "schedule_only" }
    ],

    "priorityRules": [
      {
        "condition": { "type": "flag_equals", "key": "current_scene_npcs", "value": "{npc.id}" },
        "tier": "high_priority",
        "priority": 100
      }
    ],

    "defaultTier": "background",
    "maxNpcsPerTick": 50
  }
}
```

**Priority criteria can be:**
- Location-based (2D games)
- Distance-based (3D games with coords)
- Scene participation (visual novels)
- Quest involvement (RPGs)
- Recent interaction (any game)
- Custom world logic

## 🏗️ Architecture

### Data Flow

```
1. World Time Advances
   ↓
2. Simulation System determines which NPCs to tick
   ↓
3. For each NPC:
   - Load routine graph from NPC.meta.behavior.routineId
   - Find active node based on world time
   - Collect candidate activities from node
   ↓
4. Activity Resolution:
   - Merge preferences (routine → NPC → session)
   - Filter activities by requirements
   - Score each activity using 8-factor system
   - Choose via weighted random selection
   ↓
5. Apply Effects:
   - Update NPC energy
   - Update mood (valence/arousal)
   - Update relationships
   - Set flags
   - Apply custom effects
   ↓
6. Update State:
   - Set currentActivityId
   - Schedule next decision time
   - Add to activity history
```

### Storage Locations

All data stored in **existing JSON fields** (no new DB tables):

| Data | Location |
|------|----------|
| Behavior Config | `GameWorld.meta.behavior` |
| Activity Catalog | `GameWorld.meta.behavior.activities` |
| Routine Graphs | `GameWorld.meta.behavior.routines` |
| NPC Routine Assignment | `GameNPC.meta.behavior.routineId` |
| NPC Preferences | `GameNPC.meta.behavior.preferences` |
| NPC Session State | `GameSession.flags.npcs["npc:{id}"].state` |
| Relationship Metrics | `GameSession.relationships["npc:{id}"]` |

### Key Modules

**Backend Domain (`pixsim7/backend/main/domain/behavior/`):**
- `conditions.py` - Condition DSL evaluator
- `effects.py` - Effect handler system
- `scoring.py` - Activity scoring & selection
- `simulation.py` - Simulation prioritization
- `routine_resolver.py` - Routine graph traversal

**Backend API (`pixsim7/backend/main/api/v1/game_behavior.py`):**
- 10 REST endpoints for behavior config CRUD
- Comprehensive validation
- Preview/simulation endpoints

**Schemas (`pixsim7/backend/main/domain/game/schemas.py`):**
- 20+ Pydantic schemas
- Cross-reference validation
- Migration system

**Types (`packages/types/src/game.ts`):**
- Complete TypeScript type definitions
- 400+ lines of behavior types

## 🚀 Getting Started

### 1. Create Activity Categories

```bash
PUT /api/v1/game/worlds/{world_id}/behavior
```

```json
{
  "config": {
    "version": 1,
    "activityCategories": {
      "work": {
        "id": "work",
        "label": "Work",
        "icon": "💼",
        "defaultWeight": 0.6
      },
      "social": {
        "id": "social",
        "label": "Social",
        "icon": "👥",
        "defaultWeight": 0.7
      }
    }
  }
}
```

### 2. Create Activities

```bash
POST /api/v1/game/worlds/{world_id}/behavior/activities
```

```json
{
  "activity": {
    "version": 1,
    "id": "activity:work_office",
    "name": "Work at Office",
    "category": "work",
    "requirements": {
      "minEnergy": 30
    },
    "effects": {
      "energyDeltaPerHour": -15,
      "moodImpact": { "valence": -10, "arousal": 5 }
    },
    "minDurationSeconds": 3600
  }
}
```

### 3. Create Routine Graph

```bash
POST /api/v1/game/worlds/{world_id}/behavior/routines
```

```json
{
  "routine": {
    "version": 1,
    "id": "routine:daily_worker",
    "name": "Daily Worker Routine",
    "nodes": [
      {
        "id": "work_hours",
        "nodeType": "time_slot",
        "timeRangeSeconds": { "start": 28800, "end": 61200 },
        "preferredActivities": [
          { "activityId": "activity:work_office", "weight": 2.0 }
        ]
      }
    ],
    "edges": []
  }
}
```

### 4. Assign Routine to NPC

Update NPC's `meta.behavior`:

```json
{
  "meta": {
    "behavior": {
      "routineId": "routine:daily_worker",
      "preferences": {
        "categoryWeights": {
          "work": 0.8
        }
      }
    }
  }
}
```

### 5. Simulate

Call routine resolver in your world tick handler:

```python
from pixsim7.backend.main.domain.behavior import choose_npc_activity, apply_activity_to_npc

# Choose activity for NPC
activity = choose_npc_activity(npc, world, session, world_time)

if activity:
    # Apply activity effects
    apply_activity_to_npc(npc, session, activity, world_time, delta_seconds)
```

## 📚 API Reference

### Behavior Config

#### Get Behavior Config
```
GET /api/v1/game/worlds/{world_id}/behavior
```

Returns complete behavior configuration including activities, routines, scoring, and simulation config.

#### Update Behavior Config
```
PUT /api/v1/game/worlds/{world_id}/behavior
```

Updates entire behavior config with validation.

#### Validate Config
```
POST /api/v1/game/worlds/{world_id}/behavior/validate
```

Validates config without saving (useful for editors).

### Activities

#### Create Activity
```
POST /api/v1/game/worlds/{world_id}/behavior/activities
```

#### Update Activity
```
PUT /api/v1/game/worlds/{world_id}/behavior/activities/{activity_id}
```

#### Delete Activity
```
DELETE /api/v1/game/worlds/{world_id}/behavior/activities/{activity_id}
```

### Routines

#### Create Routine
```
POST /api/v1/game/worlds/{world_id}/behavior/routines
```

#### Update Routine
```
PUT /api/v1/game/worlds/{world_id}/behavior/routines/{routine_id}
```

#### Delete Routine
```
DELETE /api/v1/game/worlds/{world_id}/behavior/routines/{routine_id}
```

### Simulation

#### Preview Activity Selection
```
POST /api/v1/game/worlds/{world_id}/behavior/preview-activity
```

Preview which activity an NPC would choose (for debugging/tuning).

## 📖 Examples

### Example Configs

See example configurations for different game types:

- **[2D Life Sim](./example_2d_life_sim.json)** - Stardew Valley style
- **[Visual Novel](./example_visual_novel.json)** - Romance game

### Common Patterns

#### 1. Energy-Based Rest Activities

```json
{
  "requirements": {
    "maxEnergy": 30
  },
  "effects": {
    "energyDeltaPerHour": 40
  }
}
```

#### 2. Relationship-Gated Activities

```json
{
  "requirements": {
    "conditions": [
      {
        "type": "relationship_gt",
        "npcIdOrRole": "role:friend",
        "metric": "affinity",
        "threshold": 50
      }
    ]
  }
}
```

#### 3. Story-Driven Activities

```json
{
  "requirements": {
    "conditions": [
      {
        "type": "flag_equals",
        "key": "quest.main.chapter",
        "value": 3
      }
    ]
  },
  "effects": {
    "flagsSet": {
      "quest.main.chapter": 4
    }
  }
}
```

#### 4. Mood-Based Activity Filtering

```json
{
  "requirements": {
    "moodTags": ["playful", "energetic"]
  }
}
```

## 🔧 Advanced Topics

### Custom Conditions

Register custom evaluators in Python:

```python
from pixsim7.backend.main.domain.behavior import register_condition_evaluator

def evaluate_is_raining(params, context):
    world = context.get("world")
    return getattr(world, "weather", "clear") == "rain"

register_condition_evaluator("evaluator:is_raining", evaluate_is_raining)
```

Use in configs:

```json
{
  "type": "custom",
  "evaluatorId": "evaluator:is_raining",
  "params": {}
}
```

### Custom Effects

Register custom effect handlers:

```python
from pixsim7.backend.main.domain.behavior import register_effect_handler

def handle_give_item(params, context):
    item_id = params["itemId"]
    quantity = params.get("quantity", 1)

    inventory = context["flags"].get("inventory", {})
    inventory[item_id] = inventory.get(item_id, 0) + quantity
    context["flags"]["inventory"] = inventory

register_effect_handler("effect:give_item", handle_give_item)
```

Use in activities:

```json
{
  "effects": {
    "customEffects": [
      {
        "type": "effect:give_item",
        "params": { "itemId": "gold_coin", "quantity": 10 }
      }
    ]
  }
}
```

### Schema Migration

When schemas evolve, use versioning:

```python
def migrate_behavior_to_v2(config):
    # Add new fields, transform old data
    config["newField"] = default_value
    config["version"] = 2
    return config
```

## 🎯 Best Practices

### Activity Design

1. **Keep activities focused** - One clear purpose per activity
2. **Use minDurationSeconds** - Prevent rapid switching
3. **Set cooldowns wisely** - Balance variety vs repetition
4. **Gate carefully** - Don't over-constrain (NPCs get stuck)

### Routine Design

1. **Cover all time periods** - Avoid gaps where NPCs have nothing to do
2. **Provide fallbacks** - Always have low-requirement activities
3. **Use decision nodes for state** - Time slots for schedule
4. **Test with different NPCs** - Preferences should matter

### Preference Tuning

1. **Start with defaults** - Override only when needed
2. **Use presets** - Create reusable personality types
3. **Test extremes** - Try 0 and 1 weight values
4. **Balance variety** - Too many high weights = predictable NPCs

### Scoring Tuning

1. **Start with defaults** - Adjust per world type
2. **Boost key factors** - Romance games → high relationshipBonus
3. **Test with debug tools** - Use preview endpoint
4. **Iterate based on observation** - Watch NPC behavior

### Performance

1. **Use simulation tiers** - Don't tick all NPCs every frame
2. **Set maxNpcsPerTick** - Hard cap for safety
3. **Use schedule_only for distant NPCs** - Skip full simulation
4. **Profile and adjust** - Monitor tick times

## 🐛 Troubleshooting

### NPCs Not Choosing Activities

1. Check routine assignment: `NPC.meta.behavior.routineId`
2. Verify routine exists in `GameWorld.meta.behavior.routines`
3. Check time coverage: Does routine have nodes for current world time?
4. Check requirements: Are activities too restrictive?
5. Check energy: NPC may not have energy for any activity

### Activities Never Chosen

1. Check category is defined in `activityCategories`
2. Check activity is referenced in routine nodes
3. Check conditions aren't always false
4. Check scoring weights (too low = never chosen)
5. Use preview endpoint to see scores

### Validation Errors

1. Read error messages carefully (Pydantic is detailed)
2. Check cross-references (activities → categories, routines → activities)
3. Check ranges (energy 0-100, etc.)
4. Verify graph structure (edges reference existing nodes)
5. Use `/validate` endpoint before saving

## 🎮 GameProfile Integration (Task 23)

**GameProfile** provides world-level configuration that unifies life-sim and visual novel gameplay styles under one engine.

### What is GameProfile?

GameProfile is stored in `GameWorld.meta.gameProfile` and defines:

- **Game Style** - Overall gameplay emphasis (`life_sim`, `visual_novel`, or `hybrid`)
- **Simulation Mode** - How time progresses (`real_time`, `turn_based`, or `paused`)
- **Behavior Profile** - Default behavior scoring weights (`work_focused`, `relationship_focused`, or `balanced`)
- **Narrative Profile** - Narrative program emphasis (`light`, `moderate`, or `heavy`)

### Example GameProfile

```json
{
  "meta": {
    "gameProfile": {
      "style": "life_sim",
      "simulationMode": "turn_based",
      "turnConfig": {
        "turnDeltaSeconds": 3600
      },
      "behaviorProfile": "work_focused",
      "narrativeProfile": "light"
    }
  }
}
```

### How GameProfile Affects Behavior

#### 1. Scoring Weights

The `behaviorProfile` influences default scoring weights:

**work_focused:**
- Higher `categoryPreference` (1.0 vs 0.8)
- Higher `urgency` (1.5 vs 1.2)
- Lower `relationshipBonus` (0.3 vs 0.5)
- Lower `moodCompatibility` (0.5 vs 0.7)

**relationship_focused:**
- Lower `categoryPreference` (0.6)
- Lower `urgency` (0.8)
- Higher `relationshipBonus` (0.9)
- Higher `moodCompatibility` (0.9)

**balanced:**
- Default weights (as defined in ScoringConfig)

**Priority:** Explicit `scoringConfig` > `behaviorProfile` defaults

#### 2. Simulation Tiers

The `style` influences default tier limits:

**life_sim:**
- More NPCs in `active` tier (150 vs 100)
- Large ambient population (800 vs 500)
- Emphasis on world liveliness

**visual_novel:**
- More NPCs in `detailed` tier (20 vs 15)
- Fewer but more detailed NPCs (50 active vs 150)
- Focus on narrative-relevant NPCs

**hybrid:**
- Balanced tier distribution

#### 3. Interaction Suggestions

The `narrativeProfile` affects interaction suggestion scoring:

**light narrative:**
- Boosts everyday/casual interactions (+15 score)
- Sparse narrative programs (0.5 per hour)
- Min 2 hours between programs

**heavy narrative:**
- Boosts chain continuation (+10 score)
- Boosts relationship milestones (+10 score)
- Reduces everyday interaction priority (-10 score)
- Frequent narrative programs (3 per hour)
- Min 20 minutes between programs

### Using GameProfile in Code

```typescript
import {
  getDefaultScoringWeights,
  getBehaviorScoringConfig,
  getSimulationConfig,
  getNarrativeEmphasisWeight,
  shouldFavorNarrativeProgram,
  getNarrativeFrequency,
} from '@pixsim7/game-core';

// Get scoring weights from profile
const weights = getDefaultScoringWeights('work_focused');

// Get complete scoring config (with fallback to behaviorProfile)
const scoringConfig = getBehaviorScoringConfig(gameProfile, explicitConfig);

// Get narrative emphasis (0-1 weight)
const narrativeWeight = getNarrativeEmphasisWeight('heavy'); // 0.9

// Decide whether to launch narrative program
const shouldLaunch = shouldFavorNarrativeProgram(gameProfile, {
  interactionType: 'story',
  relationshipTier: 'close_friend',
  isStoryBeat: true,
});

// Get recommended narrative frequency
const frequency = getNarrativeFrequency(gameProfile);
// { programsPerHour: 3, minTimeBetweenPrograms: 1200, description: "..." }
```

### Simulation Mode

The `simulationMode` determines how time progresses:

**turn_based:**
- Time advances only when player takes a turn
- Requires `turnConfig.turnDeltaSeconds`
- Game2D UI shows "End Turn" button
- Session flags can override world defaults

**real_time:**
- Continuous time progression
- Uses scheduler `timeScale` and tick intervals

**paused:**
- Time frozen until manually advanced
- Useful for dialogue-heavy scenes

### Best Practices

1. **Set GameProfile early** - Define in world meta before authoring content
2. **Use style-appropriate interactions** - Life-sim → casual/daily, VN → story/choice
3. **Test both modes** - Ensure content works in turn-based and real-time
4. **Allow session overrides** - Session flags can override world defaults
5. **Document profile choices** - Explain why you chose a particular profile

### Migration from Pre-GameProfile Worlds

Worlds without `gameProfile` default to:
- `style: "hybrid"`
- `simulationMode: "real_time"`
- `behaviorProfile: "balanced"`
- `narrativeProfile: "moderate"`

Explicit behavior/simulation configs always take precedence over GameProfile defaults.

## 📄 License

Part of PixSim7. See main project license.

## 🙏 Credits

Designed and implemented based on Task 13 specifications with comprehensive extensibility safeguards.
