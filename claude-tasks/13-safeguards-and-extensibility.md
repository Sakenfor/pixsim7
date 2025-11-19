# Task 13 Safeguards & Extensibility Guide

## Purpose

This document defines critical safeguards for Task 13 (NPC Behavior System) to ensure the design remains extensible and doesn't hard-code us into corners.

---

## 🛡️ Core Safeguards

### 1. Versioned Schemas

**Problem:** Schema changes break old worlds

**Solution:** Add `version` field to all behavior schemas

```typescript
interface Activity {
  version: number;  // Start at 1, increment on breaking changes
  id: string;
  name: string;
  category: string;
  // ... rest of fields
}

interface RoutineGraph {
  version: number;
  id: string;
  name: string;
  nodes: RoutineNode[];
  edges: RoutineEdge[];
}

interface BehaviorConfig {
  version: number;
  activities?: Record<string, Activity>;
  routines?: Record<string, RoutineGraph>;
  // ... rest of config
}
```

**Backend Migration:**
```python
CURRENT_BEHAVIOR_VERSION = 2

def load_behavior_config(data: dict) -> dict:
    version = data.get('version', 1)

    if version < CURRENT_BEHAVIOR_VERSION:
        data = migrate_behavior_config(data, version, CURRENT_BEHAVIOR_VERSION)

    return data

def migrate_behavior_config(data: dict, from_version: int, to_version: int) -> dict:
    migrations = {
        1: migrate_v1_to_v2,
        # Add more as needed
    }

    current_version = from_version
    while current_version < to_version:
        data = migrations[current_version](data)
        current_version += 1

    return data
```

---

### 2. User-Defined Activity Categories

**Problem:** Hard-coded categories limit world creativity

**Current (limiting):**
```typescript
type ActivityCategory = 'work' | 'social' | 'leisure' | 'routine' | 'quest';
```

**Solution:** Make categories user-defined strings with world-level config

```typescript
// In Activity
interface Activity {
  version: number;
  id: string;
  name: string;
  category: string;  // Any string, not enum!
  // ...
}

// In GameWorld.meta.behavior
interface BehaviorConfig {
  version: number;

  // Define available categories per world
  activityCategories: Record<string, ActivityCategoryConfig>;

  // ... rest
}

interface ActivityCategoryConfig {
  id: string;            // "work", "combat", "magic", "crafting"
  label: string;         // "Work"
  icon?: string;         // "💼"
  defaultWeight?: number; // 0.5
  description?: string;
}
```

**Example Usage:**
```json
{
  "version": 1,
  "activityCategories": {
    "work": { "id": "work", "label": "Work", "icon": "💼", "defaultWeight": 0.5 },
    "social": { "id": "social", "label": "Social", "icon": "👥", "defaultWeight": 0.7 },
    "combat": { "id": "combat", "label": "Combat", "icon": "⚔️", "defaultWeight": 0.3 },
    "magic": { "id": "magic", "label": "Magic", "icon": "🔮", "defaultWeight": 0.6 }
  },
  "activities": {
    "activity:cast_spell": {
      "category": "magic",
      // ...
    }
  }
}
```

**Validation:**
```python
def validate_activity(activity: dict, behavior_config: dict) -> list[str]:
    errors = []

    # Check category exists in world config
    category = activity.get('category')
    defined_categories = behavior_config.get('activityCategories', {})

    if category not in defined_categories:
        errors.append(f"Unknown category '{category}'. Define it in behavior.activityCategories first.")

    return errors
```

---

### 3. Extensible Activity Effects

**Problem:** Limited effect types require code changes to add new effects

**Current (limiting):**
```typescript
interface ActivityEffects {
  energyDeltaPerHour?: number;
  moodImpact?: { valence: number; arousal: number };
  relationshipChanges?: Record<string, RelationshipDelta>;
  flagsSet?: Record<string, unknown>;
}
```

**Solution:** Add `customEffects` array for world-specific effects

```typescript
interface ActivityEffects {
  // Core effects (always available)
  energyDeltaPerHour?: number;
  moodImpact?: { valence: number; arousal: number };
  relationshipChanges?: Record<string, RelationshipDelta>;
  flagsSet?: Record<string, unknown>;

  // NEW: Extensible custom effects
  customEffects?: CustomEffect[];
}

interface CustomEffect {
  type: string;  // "effect:give_item", "effect:grant_xp", "effect:spawn_event"
  params: Record<string, any>;
}
```

**Example Usage:**
```json
{
  "id": "activity:alchemy_brewing",
  "category": "crafting",
  "effects": {
    "energyDeltaPerHour": -15,
    "customEffects": [
      {
        "type": "effect:give_item",
        "params": { "itemId": "health_potion", "quantity": 1 }
      },
      {
        "type": "effect:grant_xp",
        "params": { "skill": "alchemy", "amount": 50 }
      },
      {
        "type": "effect:consume_ingredient",
        "params": { "itemId": "herb", "quantity": 3 }
      }
    ]
  }
}
```

**Backend Effect Handlers:**
```python
# Registry of custom effect handlers
CUSTOM_EFFECT_HANDLERS = {
    "effect:give_item": handle_give_item_effect,
    "effect:grant_xp": handle_grant_xp_effect,
    "effect:consume_ingredient": handle_consume_ingredient_effect,
    # Add more as needed
}

def apply_custom_effects(effects: list[dict], context: dict):
    for effect in effects:
        effect_type = effect.get('type')
        handler = CUSTOM_EFFECT_HANDLERS.get(effect_type)

        if handler:
            handler(effect['params'], context)
        else:
            logger.warning(f"Unknown custom effect type: {effect_type}")

# Example handler
def handle_give_item_effect(params: dict, context: dict):
    item_id = params['itemId']
    quantity = params.get('quantity', 1)

    # Add item to session inventory
    inventory = context['session'].flags.get('inventory', {})
    inventory[item_id] = inventory.get(item_id, 0) + quantity
    context['session'].flags['inventory'] = inventory
```

**Registering Custom Handlers (for world-specific logic):**
```python
# Worlds can register custom handlers via plugins
def register_world_effect_handlers(world_id: int):
    # Load world-specific handlers from world.meta.behavior.customEffectHandlers
    world = get_world(world_id)
    custom_handlers = world.meta.get('behavior', {}).get('customEffectHandlers', {})

    for effect_type, handler_config in custom_handlers.items():
        # Register handler (implementation depends on plugin system)
        CUSTOM_EFFECT_HANDLERS[effect_type] = create_handler_from_config(handler_config)
```

---

### 4. Configurable Scoring System

**Problem:** Hard-coded scoring formula can't be tuned per world

**Current (hard-coded):**
```typescript
score = baseWeight * activityWeight * categoryWeight * traitMultiplier ...
```

**Solution:** Add configurable scoring weights per world

```typescript
interface ScoringConfig {
  version: number;

  // Multiplier weights for each scoring factor
  weights: {
    baseWeight: number;           // 1.0 default
    activityPreference: number;   // 1.0 default
    categoryPreference: number;   // 0.8 default
    traitModifier: number;        // 0.6 default
    moodCompatibility: number;    // 0.7 default
    relationshipBonus: number;    // 0.5 default
    urgency: number;              // 1.2 default (low energy → boost rest)
    inertia: number;              // 0.3 default (bias toward current activity)
  };

  // Advanced: custom scoring function ID
  customScoringId?: string;  // "scoring:romantic_heavy", "scoring:work_focused"
}

// In GameWorld.meta.behavior
interface BehaviorConfig {
  version: number;
  scoringConfig?: ScoringConfig;
  // ...
}
```

**Example Configurations:**

```json
// Default balanced scoring
{
  "scoringConfig": {
    "version": 1,
    "weights": {
      "baseWeight": 1.0,
      "activityPreference": 1.0,
      "categoryPreference": 0.8,
      "traitModifier": 0.6,
      "moodCompatibility": 0.7,
      "relationshipBonus": 0.5,
      "urgency": 1.2,
      "inertia": 0.3
    }
  }
}

// Relationship-heavy world (romance game)
{
  "scoringConfig": {
    "version": 1,
    "weights": {
      "baseWeight": 1.0,
      "activityPreference": 0.7,
      "categoryPreference": 0.6,
      "traitModifier": 0.4,
      "moodCompatibility": 0.9,      // Mood matters more
      "relationshipBonus": 1.5,       // Relationships matter most!
      "urgency": 0.8,
      "inertia": 0.2
    }
  }
}

// Work-focused world (life sim)
{
  "scoringConfig": {
    "version": 1,
    "weights": {
      "baseWeight": 1.0,
      "activityPreference": 1.2,
      "categoryPreference": 1.5,      // Category matters most
      "traitModifier": 0.8,
      "moodCompatibility": 0.4,
      "relationshipBonus": 0.3,
      "urgency": 1.5,                 // Urgency (energy/needs) critical
      "inertia": 0.5
    }
  }
}
```

**Backend Scoring Implementation:**
```python
def calculate_activity_score(
    activity: Activity,
    npc_prefs: NpcPreferences,
    npc_state: dict,
    world_state: dict,
    scoring_config: ScoringConfig
) -> float:
    weights = scoring_config.get('weights', DEFAULT_WEIGHTS)

    score = 1.0

    # Base weight from routine graph
    score *= activity.base_weight * weights['baseWeight']

    # NPC preference for this specific activity
    activity_pref = npc_prefs.activity_weights.get(activity.id, 0.5)
    score *= activity_pref * weights['activityPreference']

    # Category preference
    category_pref = npc_prefs.category_weights.get(activity.category, 0.5)
    score *= category_pref * weights['categoryPreference']

    # Personality trait modifiers
    trait_mult = calculate_trait_multiplier(activity, npc_prefs.trait_modifiers)
    score *= (1 + (trait_mult - 1) * weights['traitModifier'])

    # Mood compatibility
    mood_mult = calculate_mood_compatibility(activity, npc_state.mood)
    score *= (1 + (mood_mult - 1) * weights['moodCompatibility'])

    # Relationship bonuses
    rel_mult = calculate_relationship_multiplier(activity, npc_state.relationships)
    score *= (1 + (rel_mult - 1) * weights['relationshipBonus'])

    # Urgency (low energy → boost rest activities)
    urgency_mult = calculate_urgency_multiplier(activity, npc_state)
    score *= (1 + (urgency_mult - 1) * weights['urgency'])

    # Inertia (prefer current activity)
    if npc_state.current_activity_id == activity.id:
        score *= (1 + weights['inertia'])

    return max(0.001, score)  # Never allow 0 score
```

---

### 5. Extensible Condition DSL

**Problem:** Limited condition types require code changes

**Solution:** Add `custom` condition type + evaluator registry

```typescript
export type Condition =
  // Built-in conditions
  | { type: 'relationship_gt'; npcIdOrRole: string; metric: 'affinity' | 'trust' | 'chemistry' | 'tension'; threshold: number }
  | { type: 'flag_equals'; key: string; value: unknown }
  | { type: 'mood_in'; moodTags: string[] }
  | { type: 'energy_between'; min: number; max: number }
  | { type: 'random_chance'; probability: number }
  | { type: 'time_of_day_in'; times: Array<'morning' | 'afternoon' | 'evening' | 'night'> }
  // NEW: Custom extensible conditions
  | {
      type: 'custom';
      evaluatorId: string;  // "evaluator:is_raining", "evaluator:quest_active"
      params: Record<string, any>;
    }
  // NEW: Expression-based conditions (advanced)
  | {
      type: 'expression';
      expression: string;  // "relationship.affinity > 60 && flags.arc_stage == 2"
    };
```

**Backend Condition Evaluators:**
```python
# Built-in evaluators
def evaluate_relationship_gt(condition: dict, context: dict) -> bool:
    npc_id = condition['npcIdOrRole']
    metric = condition['metric']
    threshold = condition['threshold']

    relationship = context['relationships'].get(npc_id, {})
    value = relationship.get(metric, 0)

    return value > threshold

# Custom evaluator registry
CUSTOM_CONDITION_EVALUATORS = {
    "evaluator:is_raining": lambda params, ctx: ctx['world'].weather == "rain",
    "evaluator:quest_active": lambda params, ctx: ctx['flags'].get(f"quest:{params['questId']}.active", False),
    "evaluator:has_item": lambda params, ctx: ctx['flags'].get('inventory', {}).get(params['itemId'], 0) >= params.get('quantity', 1),
}

def evaluate_condition(condition: dict, context: dict) -> bool:
    cond_type = condition['type']

    # Built-in conditions
    if cond_type == 'relationship_gt':
        return evaluate_relationship_gt(condition, context)
    elif cond_type == 'flag_equals':
        return context['flags'].get(condition['key']) == condition['value']
    # ... other built-ins

    # Custom conditions
    elif cond_type == 'custom':
        evaluator_id = condition['evaluatorId']
        evaluator = CUSTOM_CONDITION_EVALUATORS.get(evaluator_id)

        if evaluator:
            return evaluator(condition['params'], context)
        else:
            logger.warning(f"Unknown custom evaluator: {evaluator_id}")
            return False

    # Expression conditions (advanced, optional)
    elif cond_type == 'expression':
        return evaluate_expression(condition['expression'], context)

    return False
```

**World-Specific Evaluators:**
```json
// In GameWorld.meta.behavior
{
  "version": 1,
  "customConditionEvaluators": {
    "evaluator:is_full_moon": {
      "description": "Check if it's a full moon",
      "implementation": "lua" or "python" or "expr"  // Different execution strategies
    }
  }
}
```

---

### 6. Simulation Prioritization (Game-Agnostic)

**Problem:** Simulating 1000+ NPCs with full decision-making every tick is slow, regardless of game type (2D, 3D, text, etc.)

**Solution:** Relevance-based simulation tiers (works for any game type, not just 3D)

```typescript
interface SimulationConfig {
  version: number;

  // Simulation tiers (not distance-based!)
  tiers: Array<{
    id: string;                    // "high_priority", "medium_priority", "background"
    tickFrequencySeconds: number;  // How often to update
    detailLevel: "full" | "simplified" | "schedule_only";
  }>;

  // How to determine NPC priority (flexible, not just distance!)
  priorityRules: Array<{
    condition: Condition;          // Use existing Condition DSL
    tier: string;                  // Which tier to assign
    priority: number;              // Higher priority wins
  }>;

  // Defaults
  defaultTier: string;             // "background"
  maxNpcsPerTick?: number;         // Hard limit (e.g., 50)
}

// In GameWorld.meta.behavior
interface BehaviorConfig {
  version: number;
  simulationConfig?: SimulationConfig;
  // ...
}
```

**Example Configurations:**

**2D Game (Location-Based):**
```json
{
  "tiers": [
    { "id": "same_location", "tickFrequencySeconds": 1, "detailLevel": "full" },
    { "id": "nearby_location", "tickFrequencySeconds": 60, "detailLevel": "simplified" },
    { "id": "far_away", "tickFrequencySeconds": 3600, "detailLevel": "schedule_only" }
  ],
  "priorityRules": [
    {
      "condition": { "type": "flag_equals", "key": "player.current_location", "value": "{npc.location}" },
      "tier": "same_location",
      "priority": 100
    },
    {
      "condition": { "type": "custom", "evaluatorId": "evaluator:location_nearby", "params": { "maxDistance": 2 } },
      "tier": "nearby_location",
      "priority": 50
    }
  ],
  "defaultTier": "far_away"
}
```

**Visual Novel / Text Game (Interaction-Based):**
```json
{
  "tiers": [
    { "id": "active_scene", "tickFrequencySeconds": 1, "detailLevel": "full" },
    { "id": "recent_interaction", "tickFrequencySeconds": 300, "detailLevel": "simplified" },
    { "id": "background", "tickFrequencySeconds": 3600, "detailLevel": "schedule_only" }
  ],
  "priorityRules": [
    {
      "condition": { "type": "flag_equals", "key": "current_scene_npcs", "value": "{npc.id}" },
      "tier": "active_scene",
      "priority": 100
    },
    {
      "condition": { "type": "custom", "evaluatorId": "evaluator:interacted_recently", "params": { "withinMinutes": 30 } },
      "tier": "recent_interaction",
      "priority": 50
    }
  ],
  "defaultTier": "background"
}
```

**3D Game (Distance-Based, IF spatial coords exist):**
```json
{
  "tiers": [
    { "id": "near", "tickFrequencySeconds": 1, "detailLevel": "full" },
    { "id": "medium", "tickFrequencySeconds": 60, "detailLevel": "simplified" },
    { "id": "far", "tickFrequencySeconds": 3600, "detailLevel": "schedule_only" }
  ],
  "priorityRules": [
    {
      "condition": { "type": "custom", "evaluatorId": "evaluator:distance_from_player", "params": { "maxMeters": 50 } },
      "tier": "near",
      "priority": 100
    },
    {
      "condition": { "type": "custom", "evaluatorId": "evaluator:distance_from_player", "params": { "maxMeters": 500 } },
      "tier": "medium",
      "priority": 50
    }
  ],
  "defaultTier": "far"
}
```

**Quest-Focused Game (Story Relevance):**
```json
{
  "tiers": [
    { "id": "quest_critical", "tickFrequencySeconds": 1, "detailLevel": "full" },
    { "id": "story_important", "tickFrequencySeconds": 60, "detailLevel": "full" },
    { "id": "background", "tickFrequencySeconds": 3600, "detailLevel": "schedule_only" }
  ],
  "priorityRules": [
    {
      "condition": { "type": "flag_equals", "key": "quest.active_npc_ids", "value": "{npc.id}" },
      "tier": "quest_critical",
      "priority": 100
    },
    {
      "condition": { "type": "custom", "evaluatorId": "evaluator:is_main_character", "params": {} },
      "tier": "story_important",
      "priority": 80
    }
  ],
  "defaultTier": "background"
}
```

**Backend Implementation (Game-Agnostic):**
```python
def determine_npc_simulation_tier(
    npc: GameNPC,
    world: GameWorld,
    session: GameSession,
    sim_config: SimulationConfig
) -> str:
    """Determine which simulation tier an NPC belongs to based on priority rules."""

    # Evaluate all priority rules
    matched_tier = None
    highest_priority = -1

    for rule in sim_config['priorityRules']:
        # Build context for condition evaluation
        context = {
            'npc': npc,
            'world': world,
            'session': session,
            'flags': session.flags,
            'relationships': session.relationships,
        }

        # Evaluate condition
        if evaluate_condition(rule['condition'], context):
            if rule['priority'] > highest_priority:
                highest_priority = rule['priority']
                matched_tier = rule['tier']

    # Return matched tier or default
    return matched_tier or sim_config['defaultTier']


def tick_world_npcs(world_id: int, delta_seconds: float, session: GameSession):
    """Tick all NPCs based on their simulation tier (game-agnostic)."""

    world = get_world(world_id)
    sim_config = world.meta.get('behavior', {}).get('simulationConfig', DEFAULT_SIM_CONFIG)
    npcs = get_npcs_in_world(world_id)

    # Tier lookup
    tier_configs = {tier['id']: tier for tier in sim_config['tiers']}

    # Group NPCs by tier
    npcs_by_tier = {}
    for npc in npcs:
        tier_id = determine_npc_simulation_tier(npc, world, session, sim_config)
        npcs_by_tier.setdefault(tier_id, []).append(npc)

    # Simulate each tier
    for tier_id, tier_npcs in npcs_by_tier.items():
        tier_config = tier_configs.get(tier_id)
        if not tier_config:
            continue

        for npc in tier_npcs:
            # Check if it's time to update this NPC
            next_update = npc.state.get('next_update_at', 0)
            if world.world_time < next_update:
                continue

            # Simulate based on detail level
            if tier_config['detailLevel'] == 'full':
                simulate_npc_full(npc, world, session, delta_seconds)
            elif tier_config['detailLevel'] == 'simplified':
                simulate_npc_simplified(npc, world, session, delta_seconds)
            else:  # schedule_only
                simulate_npc_schedule_only(npc, world, session, delta_seconds)

            # Schedule next update
            npc.state['next_update_at'] = world.world_time + tier_config['tickFrequencySeconds']

def simulate_npc_full(npc, world, session, delta_seconds):
    # Full activity scoring and resolution
    activity = choose_activity(npc, world, session, ...)
    apply_activity_effects(npc, activity, delta_seconds)

def simulate_npc_simplified(npc, world, session, delta_seconds):
    # Just follow schedule, no scoring
    schedule_entry = get_current_schedule_entry(npc, world.world_time)
    if schedule_entry:
        npc.state['current_location_id'] = schedule_entry.location_id
        npc.state['current_activity_id'] = schedule_entry.default_activity_id

def simulate_npc_schedule_only(npc, world, session, delta_seconds):
    # Only update location, no activity execution
    schedule_entry = get_current_schedule_entry(npc, world.world_time)
    if schedule_entry:
        npc.state['current_location_id'] = schedule_entry.location_id
```

**Performance Benefits (Game-Agnostic):**
- Works for **any game type** (2D, 3D, text, visual novel, etc.)
- Same **100x performance boost** (based on relevance, not just distance)
- **Flexible priority criteria:**
  - Location/distance (if spatial)
  - Scene participation
  - Quest involvement
  - Recent interaction
  - Story importance
  - Custom world-specific logic

---

## Implementation Checklist

### Phase 13.1 Updates

Add these to Phase 13.1 (Data Schemas & Validation):

- [ ] Add `version` field to all behavior schemas (Activity, RoutineGraph, BehaviorConfig)
- [ ] Change `ActivityCategory` from enum to `string`
- [ ] Add `activityCategories` config to `BehaviorConfig`
- [ ] Add `customEffects` array to `ActivityEffects`
- [ ] Add `custom` condition type to Condition DSL
- [ ] Add `ScoringConfig` to `BehaviorConfig`
- [ ] Add `SimulationConfig` to `BehaviorConfig`
- [ ] Create migration system for behavior data versions
- [ ] Add Pydantic validators for all new fields
- [ ] Document extensibility points in schema comments

### Phase 13.2 Updates

- [ ] Implement custom effect handler registry
- [ ] Implement custom condition evaluator registry
- [ ] Add UI for defining custom activity categories
- [ ] Add validation for category references in activities

### Phase 13.4 Updates

- [ ] Implement configurable scoring with world-specific weights
- [ ] Implement game-agnostic simulation prioritization system
- [ ] Add relevance-based tick frequency (location, scene, quest, interaction)
- [ ] Add simulation tier assignment based on priority rules
- [ ] Add simulation performance metrics

---

## Migration Example

```python
# Example: Migrating from v1 to v2
def migrate_v1_to_v2(behavior_config: dict) -> dict:
    """
    v1 → v2 changes:
    - Added activityCategories (extract from activities)
    - Changed category from enum to string
    - Added customEffects support
    """
    config = behavior_config.copy()

    # Extract unique categories from activities
    categories = set()
    for activity in config.get('activities', {}).values():
        categories.add(activity['category'])

    # Create activityCategories config
    config['activityCategories'] = {
        cat: {
            'id': cat,
            'label': cat.capitalize(),
            'defaultWeight': 0.5
        }
        for cat in categories
    }

    # Ensure all activities have customEffects field
    for activity in config.get('activities', {}).values():
        if 'effects' in activity and 'customEffects' not in activity['effects']:
            activity['effects']['customEffects'] = []

    config['version'] = 2
    return config
```

---

## Success Criteria

✅ Designers can:
- Add new activity categories without code changes
- Define custom effects and conditions per world
- Tune scoring behavior to match their game genre
- Migrate old worlds to new schema versions automatically

✅ Engineers can:
- Add new condition types via registry
- Add new effect handlers via registry
- Extend scoring without touching core formula
- Optimize simulation performance per world

✅ System:
- Never breaks old worlds (auto-migration)
- Scales to 1000+ NPCs (game-agnostic simulation prioritization)
- Supports diverse game genres (2D, 3D, text, visual novel, romance, combat, life-sim, etc.)
- Works without assumptions about spatial coordinates or rendering
- Remains maintainable and understandable
