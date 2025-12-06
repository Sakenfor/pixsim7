# Relationship System Migration Guide

This guide shows how to migrate from the legacy hardcoded relationship system to the new abstract stat system.

## Overview

**Why Migrate?**
- **Flexibility**: Define custom relationship axes, tiers, and levels per world
- **Reusability**: Same system works for NPCs, items, locations, skills, etc.
- **Maintainability**: No more hardcoded logic - everything is data-driven
- **Future-Proof**: Easy to add new stat types without code changes

**Migration Status:**
- ✅ Abstract stat system fully implemented
- ✅ Migration utilities available
- ✅ Default relationship definition provided
- ⚠️ Legacy code marked deprecated but still functional
- 📅 Legacy code removal planned for future release

---

## Quick Start: Using Default Relationships

The easiest way to migrate is to use the built-in default relationship definition that matches the legacy behavior.

### Step 1: Create World with Default Relationships

```python
from pixsim7.backend.main.domain.stats import get_default_relationship_definition

# When creating a GameWorld
world = GameWorld(
    owner_user_id=user_id,
    name="My Game World",
    meta={
        "stats_config": {
            "version": 1,
            "definitions": {
                "relationships": get_default_relationship_definition().dict()
            }
        }
    }
)
```

### Step 2: Store Relationship Data in Session Stats

**OLD Way (Deprecated):**
```python
session.relationships = {
    "npc:1": {
        "affinity": 75,
        "trust": 60,
        "chemistry": 50,
        "tension": 10,
        "tierId": "friend",  # Computed
        "intimacyLevelId": "intimate"  # Computed
    }
}
```

**NEW Way:**
```python
session.stats = {
    "relationships": {
        "npc:1": {
            "affinity": 75,
            "trust": 60,
            "chemistry": 50,
            "tension": 10,
            "affinityTierId": "friend",  # Auto-computed
            "levelId": "intimate"  # Auto-computed
        }
    }
}
```

### Step 3: Normalize Session Stats

The stat service automatically computes tiers and levels:

```python
from pixsim7.backend.main.services.game.stat_service import StatService

stat_service = StatService(db, redis)
await stat_service.normalize_session_stats(session, "relationships")

# Result: tierId and levelId are computed and stored
# session.stats["relationships"]["npc:1"]["affinityTierId"] = "friend"
# session.stats["relationships"]["npc:1"]["levelId"] = "intimate"
```

---

## Before & After Comparison

### Architecture Changes

**BEFORE (Hardcoded):**
```
domain/narrative/relationships.py
├── compute_relationship_tier(affinity) -> hardcoded logic
├── _default_relationship_tier(affinity) -> hardcoded fallbacks
├── compute_intimacy_level(values) -> hardcoded logic
└── _default_intimacy_level(values) -> hardcoded fallbacks

GameWorld.meta = {
    "relationship_schemas": {...},  # Optional custom schemas
    "intimacy_schema": {...}        # Optional custom schemas
}

GameSession.relationships = {
    "npc:1": {"affinity": 75, "trust": 60, ...}
}
```

**AFTER (Data-Driven):**
```
domain/stats/
├── schemas.py (StatDefinition, StatAxis, StatTier, StatLevel)
├── engine.py (generic computation for any stat type)
├── migration.py (legacy → new conversion utilities)
└── mixins.py (HasStats for entity-owned stats)

GameWorld.meta = {
    "stats_config": {
        "version": 1,
        "definitions": {
            "relationships": {...},  # StatDefinition
            "skills": {...},         # Any other stat type
            "reputation": {...}      # Fully customizable
        }
    }
}

GameSession.stats = {
    "relationships": {
        "npc:1": {"affinity": 75, "trust": 60, ...}
    },
    "skills": {...},
    "reputation": {...}
}
```

### Code Changes

**BEFORE: Hardcoded Tier Computation**
```python
# domain/narrative/relationships.py
def _default_relationship_tier(affinity: float) -> str:
    if affinity >= 80:
        return "lover"
    elif affinity >= 60:
        return "close_friend"
    elif affinity >= 30:
        return "friend"
    # ... more hardcoded logic
```

**AFTER: Generic Stat Engine**
```python
# domain/stats/engine.py
@staticmethod
def compute_tier(axis_name: str, value: float, tiers: List[StatTier]) -> Optional[str]:
    """Generic tier computation - works for ANY stat type."""
    sorted_tiers = sorted([t for t in tiers if t.axis_name == axis_name], key=lambda t: t.min)
    for tier in sorted_tiers:
        if tier.max is not None:
            if tier.min <= value <= tier.max:
                return tier.id
        else:
            if value >= tier.min:
                return tier.id
    return None
```

**Configuration (not code!):**
```python
# Define tiers in GameWorld.meta, not in Python code
tiers = [
    StatTier(id="stranger", axis_name="affinity", min=0.0, max=9.99),
    StatTier(id="friend", axis_name="affinity", min=30.0, max=59.99),
    StatTier(id="lover", axis_name="affinity", min=80.0, max=None),
]
```

---

## Default Relationship Definition

The built-in default relationship definition matches the legacy system exactly:

### Axes (4)
| Axis | Min | Max | Default | Description |
|------|-----|-----|---------|-------------|
| affinity | 0 | 100 | 0 | Overall fondness and attraction |
| trust | 0 | 100 | 0 | Reliability and confidence |
| chemistry | 0 | 100 | 0 | Physical and emotional compatibility |
| tension | 0 | 100 | 0 | Unresolved emotional energy |

### Tiers (5) - Single Axis (affinity)
| Tier ID | Affinity Range | Description |
|---------|----------------|-------------|
| stranger | 0-9.99 | Unknown person |
| acquaintance | 10-29.99 | Casual acquaintance |
| friend | 30-59.99 | Friend |
| close_friend | 60-79.99 | Close friend |
| lover | 80+ | Romantic partner |

### Levels (5) - Multi-Axis (affinity + trust + chemistry + tension)
| Level ID | Requirements | Description |
|----------|--------------|-------------|
| light_flirt | affinity≥20, chemistry≥20 | Minimal flirtation |
| deep_flirt | affinity≥40, chemistry≥40, trust≥20 | Moderate romantic interest |
| intimate | affinity≥60, chemistry≥60, trust≥40 | Intimate relationship |
| very_intimate | affinity≥80, chemistry≥80, trust≥60 | Very close relationship |
| soulmates | affinity≥95, chemistry≥95, trust≥90, tension≤10 | Perfect compatibility |

---

## Migration Scenarios

### Scenario 1: New World (Easiest)

Use the default relationship definition:

```python
from pixsim7.backend.main.domain.stats import get_default_relationship_definition

world.meta = {
    "stats_config": {
        "version": 1,
        "definitions": {
            "relationships": get_default_relationship_definition().dict()
        }
    }
}
```

### Scenario 2: Existing World with Legacy Schemas

Automatically migrate existing `relationship_schemas` and `intimacy_schema`:

```python
from pixsim7.backend.main.domain.stats import migrate_world_meta_to_stats_config

# world.meta has old schemas:
# {
#     "relationship_schemas": {"default": [...]},
#     "intimacy_schema": {"levels": [...]},
#     ...other fields...
# }

# Migrate to new format
stats_config = migrate_world_meta_to_stats_config(world.meta)
world.meta["stats_config"] = stats_config.dict()

# Now world.meta has:
# {
#     "relationship_schemas": {...},  # Keep for backwards compat
#     "intimacy_schema": {...},       # Keep for backwards compat
#     "stats_config": {               # NEW!
#         "version": 1,
#         "definitions": {
#             "relationships": {...}
#         }
#     }
# }
```

### Scenario 3: Existing Sessions with Legacy Relationship Data

Migrate session relationship data to stats format:

```python
from pixsim7.backend.main.domain.stats import migrate_session_relationships_to_stats

# session.relationships has old format:
# {
#     "npc:1": {"affinity": 75, "tierId": "friend", "intimacyLevelId": "intimate"}
# }

# Migrate to new format
session.stats = migrate_session_relationships_to_stats(session.relationships)

# Now session.stats has:
# {
#     "relationships": {
#         "npc:1": {"affinity": 75, "affinityTierId": "friend", "levelId": "intimate"}
#     }
# }

# Optional: Clear old field
session.relationships = {}
```

### Scenario 4: Custom Stat Types (Advanced)

Create completely custom stat types beyond relationships:

```python
from pixsim7.backend.main.domain.stats import StatDefinition, StatAxis, StatTier, StatLevel, StatCondition

# Example: Reputation system
reputation_definition = StatDefinition(
    id="reputation",
    display_name="Faction Reputation",
    description="Standing with various factions",
    axes=[
        StatAxis(name="empire", min_value=-100, max_value=100, default_value=0),
        StatAxis(name="rebels", min_value=-100, max_value=100, default_value=0),
        StatAxis(name="merchants", min_value=-100, max_value=100, default_value=0),
    ],
    tiers=[
        StatTier(id="hostile", axis_name="empire", min=-100, max=-50),
        StatTier(id="unfriendly", axis_name="empire", min=-49.99, max=-10),
        StatTier(id="neutral", axis_name="empire", min=-9.99, max=9.99),
        StatTier(id="friendly", axis_name="empire", min=10, max=49.99),
        StatTier(id="allied", axis_name="empire", min=50, max=None),
        # Repeat for rebels, merchants...
    ],
    levels=[
        StatLevel(
            id="double_agent",
            conditions={
                "empire": StatCondition(type="min", min_value=70),
                "rebels": StatCondition(type="min", min_value=70),
            },
            priority=1
        ),
        StatLevel(
            id="war_hero",
            conditions={
                "empire": StatCondition(type="min", min_value=90),
                "rebels": StatCondition(type="max", max_value=-50),
            },
            priority=2
        ),
    ]
)

world.meta["stats_config"]["definitions"]["reputation"] = reputation_definition.dict()
```

---

## API Usage Examples

### Creating Sessions with Stats

```python
# New session with relationship tracking
session = await game_session_service.create_session(
    user_id=user.id,
    scene_id=scene.id,
    world_id=world.id,
    flags={}
)

# Initialize relationship with NPC
session.stats = {
    "relationships": {
        "npc:1": {
            "affinity": 50,
            "trust": 30,
            "chemistry": 40,
            "tension": 5
        }
    }
}

# Normalize to compute tiers/levels
await game_session_service.normalize_session_stats(session, "relationships")

# Result:
# session.stats["relationships"]["npc:1"] = {
#     "affinity": 50,
#     "affinityTierId": "friend",
#     "trust": 30,
#     "chemistry": 40,
#     "tension": 5,
#     "levelId": "deep_flirt"
# }
```

### Updating Relationships

```python
# Update affinity after player choice
npc_rel = session.stats["relationships"]["npc:1"]
npc_rel["affinity"] += 10  # Positive interaction
npc_rel["trust"] += 5

# Re-normalize to update tiers/levels
await game_session_service.normalize_session_stats(session, "relationships")
await db.commit()
```

### Using NPC Stats (Entity-Owned)

```python
from pixsim7.backend.main.services.game.npc_stat_service import NPCStatService

npc_stat_service = NPCStatService(db, redis)

# Get NPC's combat stats (base + runtime + modifiers)
combat_stats = await npc_stat_service.get_npc_effective_stats(
    npc_id=1,
    stat_definition_id="combat_skills",
    world_id=world.id,
    modifiers_by_axis={
        "strength": [{"type": "additive", "value": 10}],  # Weapon buff
        "defense": [{"type": "multiplicative", "value": 1.2}]  # Armor buff
    }
)

# combat_stats = {
#     "strength": 100,
#     "strengthTierId": "expert",
#     "defense": 90,
#     "defenseTierId": "advanced",
#     "levelId": "battle_ready"
# }
```

---

## Legacy Code Deprecation

The following legacy code is marked **DEPRECATED** and will be removed in a future release:

### Deprecated Files
- ⚠️ `domain/narrative/relationships.py` - Use `domain/stats/engine.py` instead
- ⚠️ `api/v1/game_relationship_preview.py` - Will be replaced with generic stat preview API

### Deprecated Fields
- ⚠️ `GameSession.relationships` - Use `GameSession.stats["relationships"]` instead
- ⚠️ `GameWorld.meta.relationship_schemas` - Use `GameWorld.meta.stats_config` instead
- ⚠️ `GameWorld.meta.intimacy_schema` - Use `GameWorld.meta.stats_config` instead

### Deprecated Methods
- ⚠️ `GameSessionService._normalize_session_relationships()` - Delegates to `normalize_session_stats()` now

### Migration Timeline
1. **Now**: Both systems work (legacy delegates to new)
2. **Next release**: Warnings added when legacy fields are used
3. **Future release**: Legacy code removed, migration required

---

## Troubleshooting

### Issue: "World has no stats_config"

**Cause**: World created before abstract stat system was implemented.

**Solution**: Add default relationships to world:
```python
from pixsim7.backend.main.domain.stats import get_default_relationship_definition

world.meta["stats_config"] = {
    "version": 1,
    "definitions": {
        "relationships": get_default_relationship_definition().dict()
    }
}
await db.commit()
```

### Issue: "tierId and levelId not computed"

**Cause**: Session stats not normalized after updates.

**Solution**: Always normalize after changing stat values:
```python
await game_session_service.normalize_session_stats(session, "relationships")
```

### Issue: "StatDefinition validation error"

**Cause**: Tier ranges overlap or level conditions reference non-existent axes.

**Solution**: Check validation errors and fix configuration:
```python
try:
    stat_def = StatDefinition(**config)
except ValidationError as e:
    print(e.json())  # Shows specific validation errors
```

---

## Benefits Summary

### For Game Designers
- ✅ Define custom stat types without coding
- ✅ Per-world stat configurations
- ✅ Experiment with different tier/level thresholds
- ✅ Add new axes without backend changes

### For Developers
- ✅ Generic, reusable stat engine
- ✅ No more hardcoded relationship logic
- ✅ Easy to add new stat types
- ✅ Consistent API across all stat types

### For Performance
- ✅ Redis caching for computed stats
- ✅ Lazy normalization (only on writes)
- ✅ Efficient JSONB queries

---

## See Also

- [ABSTRACT_STAT_SYSTEM.md](./ABSTRACT_STAT_SYSTEM.md) - Full system architecture
- [ENTITY_STATS_EXAMPLES.md](./ENTITY_STATS_EXAMPLES.md) - 7 detailed use cases
- [STAT_SYSTEM_INTEGRATION_PLAN.md](./STAT_SYSTEM_INTEGRATION_PLAN.md) - Phase 2 integration details

---

## Questions?

For issues or questions:
- Check existing documentation files
- Review migration examples above
- Test with default relationship definition first
- Contact development team for custom requirements
