# Abstract Stat System

**Created**: 2025-12-02
**Status**: ✅ Implemented (Migration Phase)

---

## Overview

The abstract stat system replaces hardcoded relationship tracking with a flexible, configurable stat framework. This enables game designers to define custom stat types through a game maker editor without code changes.

### What Changed

**Before (Hardcoded)**:
- `GameSession.relationships` - fixed structure for affinity/trust/chemistry/tension
- Hardcoded tier/intimacy computation in `relationships.py`
- Limited to relationship tracking only

**After (Flexible)**:
- `GameSession.stats` - generic structure for any stat types
- Configurable stat definitions in `GameWorld.meta.stats_config`
- Reusable for relationships, skills, reputation, resources, etc.

---

## Architecture

### Core Components

```
pixsim7/backend/main/domain/stats/
├── schemas.py       # Pydantic models for stat definitions
├── engine.py        # Generic computation engine
├── migration.py     # Legacy relationship migration
└── __init__.py      # Public API
```

### Key Concepts

**StatAxis**: A single numeric stat (e.g., "affinity", "strength")
- Defines min/max/default values
- Examples: affinity (0-100), health (0-maxHealth)

**StatTier**: Single-axis tier/band (e.g., "friend" for affinity 40-69)
- Maps value ranges to tier IDs
- Used for simple categorization

**StatLevel**: Multi-axis level (e.g., "intimate" requires affinity≥70, trust≥60)
- Defines conditions across multiple axes
- More complex than tiers

**StatDefinition**: Complete stat system configuration
- Defines axes, tiers, and levels for one stat type
- Examples: "relationships", "skills", "reputation"

**WorldStatsConfig**: World-level config containing all stat definitions
- Stored in `GameWorld.meta.stats_config`
- Replaces `relationship_schemas`, `intimacy_schema`, etc.

---

## Data Structure

### GameSession.stats Format

```json
{
  "relationships": {
    "npc:1": {
      "affinity": 75,
      "trust": 60,
      "chemistry": 50,
      "tension": 20,
      // Computed by backend:
      "affinityTierId": "close_friend",
      "levelId": "intimate"
    },
    "npc:2": {
      "affinity": 40,
      "affinityTierId": "acquaintance"
    }
  },
  "skills": {
    "combat": {
      "strength": 80,
      "agility": 65,
      "strengthTierId": "expert",
      "agilityTierId": "advanced"
    }
  },
  "reputation": {
    "faction:thieves": {
      "fame": 70,
      "fameTierId": "well_known"
    }
  }
}
```

### GameWorld.meta.stats_config Format

```json
{
  "version": 1,
  "definitions": {
    "relationships": {
      "id": "relationships",
      "display_name": "Relationships",
      "axes": [
        {
          "name": "affinity",
          "min_value": 0,
          "max_value": 100,
          "default_value": 0,
          "display_name": "Affinity"
        }
        // ... trust, chemistry, tension
      ],
      "tiers": [
        {
          "id": "stranger",
          "axis_name": "affinity",
          "min": 0,
          "max": 19
        },
        {
          "id": "acquaintance",
          "axis_name": "affinity",
          "min": 20,
          "max": 39
        }
        // ... more tiers
      ],
      "levels": [
        {
          "id": "intimate",
          "conditions": {
            "affinity": {"type": "min", "min_value": 70},
            "trust": {"type": "min", "min_value": 60},
            "chemistry": {"type": "min", "min_value": 50}
          },
          "priority": 10
        }
        // ... more levels
      ]
    },
    "skills": {
      // Custom skill stat definition
    }
  }
}
```

---

## Migration Strategy

### Phase 1: ✅ Dual System (Current)

**Database**:
- `GameSession.stats` (new)
- `GameSession.relationships` (deprecated, kept for migration)

**Behavior**:
- Service layer auto-migrates on first access
- Both fields work during transition
- No data loss

**Migration Triggers**:
1. **World schemas**: When `relationship_schemas` exists but not `stats_config`
2. **Session data**: When `relationships` exists but not `stats["relationships"]`

### Phase 2: Complete Migration (Future)

**Steps**:
1. Run data migration script to convert all existing data
2. Update API to only use `stats`
3. Remove deprecated `relationships` field
4. Update frontend to use new structure

---

## Usage Examples

### Defining a Custom Stat Type

```python
from pixsim7.backend.main.domain.stats import StatDefinition, StatAxis, StatTier

# Define a skill system
skill_definition = StatDefinition(
    id="skills",
    display_name="Skills",
    axes=[
        StatAxis(
            name="strength",
            min_value=0,
            max_value=100,
            default_value=0,
            display_name="Strength"
        ),
        StatAxis(
            name="magic",
            min_value=0,
            max_value=100,
            default_value=0,
            display_name="Magic"
        ),
    ],
    tiers=[
        StatTier(id="novice", axis_name="strength", min=0, max=29),
        StatTier(id="advanced", axis_name="strength", min=30, max=69),
        StatTier(id="expert", axis_name="strength", min=70, max=100),
        StatTier(id="novice", axis_name="magic", min=0, max=29),
        StatTier(id="advanced", axis_name="magic", min=30, max=69),
        StatTier(id="expert", axis_name="magic", min=70, max=100),
    ]
)

# Add to world config
world.meta["stats_config"] = {
    "version": 1,
    "definitions": {
        "skills": skill_definition.model_dump(mode="python")
    }
}
```

### Using the Stat Service

```python
from pixsim7.backend.main.services.game.stat_service import StatService

# Initialize service
stat_service = StatService(db=session, redis=redis_client)

# Normalize stats for a session
await stat_service.normalize_session_stats(game_session, "relationships")

# Or normalize all stat types
await stat_service.normalize_all_session_stats(game_session)
```

### Computing Stats Manually

```python
from pixsim7.backend.main.domain.stats import StatEngine

# Compute tier for a single value
tier_id = StatEngine.compute_tier(
    axis_name="affinity",
    value=75,
    tiers=stat_definition.tiers
)
# Returns: "close_friend"

# Normalize entity stats
normalized = StatEngine.normalize_entity_stats(
    entity_stats={"affinity": 75, "trust": 60},
    stat_definition=relationship_definition
)
# Returns: {"affinity": 75, "affinityTierId": "friend", "trust": 60, "trustTierId": "trusted", "levelId": "intimate"}
```

---

## Benefits

### For Developers
- **DRY**: One computation engine for all stat types
- **Type-safe**: Full Pydantic validation
- **Testable**: Pure functions, easy to unit test
- **Maintainable**: Clear separation of concerns

### For Game Designers
- **Flexible**: Define any stat types per world
- **No code changes**: Configure through editor
- **Consistent**: Same tier/level logic everywhere
- **Extensible**: Add new stat types anytime

### For Players
- **Consistent UX**: Same tier display for relationships, skills, etc.
- **Transparent**: Clear stat progression
- **Customizable**: Different games can have different stat systems

---

## Backwards Compatibility

### Migration is Automatic

The system automatically migrates legacy data:

**World schemas**:
```python
# Before
world.meta = {
    "relationship_schemas": {"default": [...]},
    "intimacy_schema": {"levels": [...]}
}

# After (auto-migrated on first access)
world.meta = {
    "relationship_schemas": {...},  # Kept for reference
    "intimacy_schema": {...},       # Kept for reference
    "stats_config": {               # NEW
        "definitions": {
            "relationships": {...}  # Migrated
        }
    }
}
```

**Session data**:
```python
# Before
session.relationships = {
    "npc:1": {"affinity": 75, "tierId": "friend"}
}

# After (auto-migrated on first access)
session.stats = {
    "relationships": {
        "npc:1": {"affinity": 75, "affinityTierId": "friend"}
    }
}
session.relationships = {...}  # Still present, deprecated
```

---

## API Changes

### Current (Transition Period)

Both fields work:
```python
# Reading (both work)
relationships = session.relationships  # Deprecated
relationships = session.stats.get("relationships")  # Preferred

# Writing (prefer stats)
session.stats["relationships"]["npc:1"] = {"affinity": 80}
```

### Future (After Full Migration)

Only `stats` field:
```python
# Reading
relationships = session.stats.get("relationships")
skills = session.stats.get("skills")

# Writing
session.stats["relationships"]["npc:1"] = {"affinity": 80}
session.stats["skills"]["combat"] = {"strength": 75}
```

---

## Future Enhancements

### Editor Integration
- Visual stat definition builder
- Tier/level preview with validation
- Import/export stat configurations
- Template library (relationships, skills, etc.)

### Advanced Features
- Stat decay over time
- Conditional tiers (different tier definitions per context)
- Stat dependencies (skills unlock at certain levels)
- Stat events (trigger actions when thresholds crossed)

---

## Testing

### Unit Tests

```python
def test_stat_engine_compute_tier():
    """Test single-axis tier computation."""
    tiers = [
        StatTier(id="novice", axis_name="strength", min=0, max=29),
        StatTier(id="expert", axis_name="strength", min=70, max=100),
    ]

    assert StatEngine.compute_tier("strength", 25, tiers) == "novice"
    assert StatEngine.compute_tier("strength", 80, tiers) == "expert"

def test_stat_engine_normalize():
    """Test entity stat normalization."""
    definition = StatDefinition(
        id="test",
        axes=[StatAxis(name="power", min_value=0, max_value=100, default_value=0)],
        tiers=[StatTier(id="weak", axis_name="power", min=0, max=49)]
    )

    result = StatEngine.normalize_entity_stats(
        {"power": 30},
        definition
    )

    assert result["power"] == 30
    assert result["powerTierId"] == "weak"
```

---

## Documentation

See also:
- `pixsim7/backend/main/domain/stats/schemas.py` - Schema definitions
- `pixsim7/backend/main/domain/stats/engine.py` - Computation engine
- `pixsim7/backend/main/domain/stats/migration.py` - Migration helpers
- `pixsim7/backend/main/services/game/stat_service.py` - Service layer

---

**Version**: 1.0
**Last Updated**: 2025-12-02
