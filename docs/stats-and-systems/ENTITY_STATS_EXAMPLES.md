# Entity-Owned Stats Examples

**Created**: 2025-12-02
**Related**: ABSTRACT_STAT_SYSTEM.md

This document shows practical examples of using the abstract stat system with entity-owned stats (NPCs, items, equipment, etc.).

---

## Quick Reference

**What entities can have stats?**
- NPCs (attributes, combat skills, relationships)
- Items (stat modifiers from equipment)
- Locations (environmental effects)
- Factions (reputation, influence)
- Anything you add `HasStats` mixin to!

**How does it work?**
1. Entity has **BASE stats** (template/default values)
2. Session can **OVERRIDE** specific values (session-specific modifications)
3. **MODIFIERS** apply from equipment/buffs/debuffs
4. Engine **COMPUTES** final values with tiers/levels

---

## Example 1: NPC with Base Stats

### Define NPC Model

```python
from sqlmodel import SQLModel, Field
from pixsim7.backend.main.domain.stats import HasStats

class GameNPC(SQLModel, HasStats, table=True):
    """NPC with entity-owned stats."""
    __tablename__ = "game_npcs"

    id: int = Field(default=None, primary_key=True)
    name: str
    description: str
    # stats field inherited from HasStats
```

### Create NPC with Stats

```python
# Define an NPC with combat skills and attributes
alice = GameNPC(
    name="Alice the Warrior",
    description="A fierce warrior",
    stats={
        "combat_skills": {
            "strength": 90,
            "agility": 60,
            "defense": 75
        },
        "attributes": {
            "health": 100,
            "stamina": 80
        }
    }
)
```

### Normalize NPC Stats

```python
from pixsim7.backend.main.domain.stats import StatEngine, StatDefinition, StatAxis, StatTier

# Define combat skills stat system
combat_definition = StatDefinition(
    id="combat_skills",
    axes=[
        StatAxis(name="strength", min_value=0, max_value=100, default_value=0),
        StatAxis(name="agility", min_value=0, max_value=100, default_value=0),
        StatAxis(name="defense", min_value=0, max_value=100, default_value=0),
    ],
    tiers=[
        StatTier(id="novice", axis_name="strength", min=0, max=29),
        StatTier(id="advanced", axis_name="strength", min=30, max=69),
        StatTier(id="expert", axis_name="strength", min=70, max=100),
        # ... similar for agility, defense
    ]
)

# Normalize NPC stats
normalized = StatEngine.normalize_entity_stats(
    alice.stats["combat_skills"],
    combat_definition
)

# Result:
# {
#     "strength": 90,
#     "strengthTierId": "expert",
#     "agility": 60,
#     "agilityTierId": "advanced",
#     "defense": 75,
#     "defenseTierId": "expert"
# }
```

---

## Example 2: Equipment Modifiers

### Define Item Model

```python
from pixsim7.backend.main.domain.stats import HasStatsWithMetadata

class GameItem(SQLModel, HasStatsWithMetadata, table=True):
    """Item that can modify stats when equipped."""
    __tablename__ = "game_items"

    id: int = Field(default=None, primary_key=True)
    name: str
    item_type: str  # "weapon", "armor", "accessory"
    # stats and stats_metadata inherited
```

### Create Equipment with Modifiers

```python
# Sword that adds +10 strength
sword_of_power = GameItem(
    name="Sword of Power",
    item_type="weapon",
    stats={
        "combat_skills": {
            "strength": 10  # Additive modifier
        }
    },
    stats_metadata={
        "combat_skills": {
            "modifiers": [
                {
                    "type": "additive",
                    "axis": "strength",
                    "value": 10
                }
            ]
        }
    }
)

# Armor that provides +50% defense
dragon_armor = GameItem(
    name="Dragon Scale Armor",
    item_type="armor",
    stats={
        "combat_skills": {
            "defense": 1.5  # Multiplicative modifier
        }
    },
    stats_metadata={
        "combat_skills": {
            "modifiers": [
                {
                    "type": "multiplicative",
                    "axis": "defense",
                    "value": 1.5
                }
            ]
        }
    }
)
```

### Apply Equipment to NPC

```python
# NPC base stats
npc_base = {
    "strength": 90,
    "agility": 60,
    "defense": 75
}

# Collect modifiers from equipped items
modifiers = {
    "strength": [{"type": "additive", "value": 10}],  # From sword
    "defense": [{"type": "multiplicative", "value": 1.5}]  # From armor
}

# Resolve final stats
final_stats = StatEngine.resolve_entity_stats_with_modifiers(
    npc_base,
    combat_definition,
    modifiers
)

# Result:
# {
#     "strength": 100,  # 90 + 10 (sword)
#     "strengthTierId": "expert",
#     "agility": 60,
#     "agilityTierId": "advanced",
#     "defense": 112.5,  # 75 * 1.5 (armor) - clamped to 100
#     "defenseTierId": "expert"
# }
```

---

## Example 3: Hybrid Approach (Base + Session Overrides)

### Scenario: NPC Takes Damage

```python
# NPC template (base stats)
npc_base = GameNPC(
    name="Alice",
    stats={
        "attributes": {
            "health": 100,
            "stamina": 80
        }
    }
)

# During gameplay, NPC takes damage
# Store session-specific overrides in GameSession
session.stats = {
    "npc_stats": {
        "npc:alice": {
            "attributes": {
                "health": 65,  # Damaged! (base was 100)
                "stamina": 80   # Unchanged
            }
        }
    }
}

# Merge base + overrides
final_stats = StatEngine.merge_entity_stats(
    npc_base.stats["attributes"],
    session.stats["npc_stats"]["npc:alice"]["attributes"]
)

# Result: {"health": 65, "stamina": 80}
# Override (65) took precedence over base (100)
```

### Scenario: Temporary Buff

```python
# NPC base combat skills
npc_base = {
    "strength": 90,
    "agility": 60
}

# Player casts "Battle Rage" buff on NPC
# Store temporary modifier in session
buff_modifiers = {
    "strength": [
        {
            "type": "multiplicative",
            "value": 1.5,  # 50% increase
            "source": "buff:battle_rage",
            "expires_at": "2025-12-02T12:00:00Z"
        }
    ]
}

# Resolve with buff active
buffed_stats = StatEngine.resolve_entity_stats_with_modifiers(
    npc_base,
    combat_definition,
    buff_modifiers
)

# Result:
# {
#     "strength": 135,  # 90 * 1.5 (clamped to 100)
#     "strengthTierId": "expert",
#     "agility": 60
# }
```

---

## Example 4: Complex Equipment System

### NPC with Multiple Equipment Slots

```python
# NPC base stats
npc = GameNPC(
    name="Bob the Knight",
    stats={
        "combat_skills": {
            "strength": 70,
            "agility": 50,
            "defense": 60
        }
    }
)

# Equipped items
equipped = {
    "weapon": sword_of_power,      # +10 strength
    "armor": dragon_armor,          # *1.5 defense
    "accessory": ring_of_speed      # +20 agility
}

# Collect all modifiers from equipped items
all_modifiers = {
    "strength": [],
    "agility": [],
    "defense": []
}

for slot, item in equipped.items():
    if "combat_skills" in item.stats_metadata:
        for modifier in item.stats_metadata["combat_skills"]["modifiers"]:
            axis = modifier["axis"]
            all_modifiers[axis].append(modifier)

# Resolve final stats with all equipment
final_stats = StatEngine.resolve_entity_stats_with_modifiers(
    npc.stats["combat_skills"],
    combat_definition,
    all_modifiers
)

# Result:
# {
#     "strength": 80,   # 70 + 10 (sword)
#     "agility": 70,    # 50 + 20 (ring)
#     "defense": 90     # 60 * 1.5 (armor)
# }
```

---

## Example 5: Location-Based Environmental Effects

### Define Location Model

```python
class GameLocation(SQLModel, HasStats, table=True):
    """Location with environmental stat effects."""
    __tablename__ = "game_locations"

    id: int = Field(default=None, primary_key=True)
    name: str
    # stats field contains environmental modifiers
```

### Create Location with Effects

```python
# Poisonous swamp that drains stamina
swamp = GameLocation(
    name="Poisonous Swamp",
    stats={
        "environmental_effects": {
            "stamina_drain": -5,  # -5 stamina per turn
            "movement_penalty": 0.5  # 50% movement speed
        }
    }
)

# Apply environmental effects to NPC
if npc_current_location == swamp:
    # Apply drain
    npc_session_stats["stamina"] -= swamp.stats["environmental_effects"]["stamina_drain"]

    # Apply movement penalty
    movement_modifiers = {
        "agility": [
            {
                "type": "multiplicative",
                "value": swamp.stats["environmental_effects"]["movement_penalty"]
            }
        ]
    }
```

---

## Example 6: Relationship Stats (Legacy Compatibility)

### NPCs with Relationship Stats

```python
# NPC stores their base "personality" as relationship tendencies
npc = GameNPC(
    name="Charlie the Friendly",
    stats={
        "relationship_tendencies": {
            "base_affinity": 30,    # Starts friendly
            "trust_threshold": 50,  # Trusts easily
            "max_chemistry": 80     # Capped chemistry
        }
    }
)

# Player's relationship with this NPC (session-specific)
session.stats = {
    "relationships": {
        "npc:charlie": {
            "affinity": 75,  # Built up over time
            "trust": 60,
            "chemistry": 50
        }
    }
}

# When computing relationship, could factor in NPC's tendencies:
# - Easy to befriend (base_affinity bonus)
# - Trusts quickly (trust builds faster)
# - Chemistry capped (can't exceed max_chemistry)
```

---

## Example 7: Faction Reputation System

### Define Faction Model

```python
class GameFaction(SQLModel, HasStats, table=True):
    """Faction with reputation thresholds."""
    __tablename__ = "game_factions"

    id: int = Field(default=None, primary_key=True)
    name: str
    # stats contains reputation bands/requirements
```

### Create Faction

```python
thieves_guild = GameFaction(
    name="Thieves Guild",
    stats={
        "reputation_requirements": {
            "entry_threshold": 20,    # Need 20 rep to join
            "promotion_threshold": 70  # Need 70 for inner circle
        }
    }
)

# Player's reputation with faction (session-specific)
session.stats = {
    "faction_reputation": {
        "faction:thieves": {
            "fame": 45,
            "fameTierId": "known"
        }
    }
}

# Check access
player_rep = session.stats["faction_reputation"]["faction:thieves"]["fame"]
can_join = player_rep >= thieves_guild.stats["reputation_requirements"]["entry_threshold"]
```

---

## Usage Patterns Summary

### Pattern 1: Template Entities (NPCs, Monsters)
```python
# Define once
npc_template.stats = {base stats}

# Instantiate per session
session.stats["npc_instances"][npc_id] = {overrides}

# Resolve at runtime
final = merge(npc_template.stats, session.stats["npc_instances"][npc_id])
```

### Pattern 2: Equipment/Modifiers
```python
# Item defines modifiers
item.stats_metadata["modifiers"] = [{type, axis, value}]

# Apply to entity
final = resolve_with_modifiers(entity.stats, modifiers)
```

### Pattern 3: Hybrid (Best of Both)
```python
# Entity has base
entity.stats = {base values}

# Session has overrides + modifiers
session.stats["entity_overrides"][entity_id] = {overrides}

# Compute final
merged = merge(entity.stats, session.stats["entity_overrides"][entity_id])
final = resolve_with_modifiers(merged, equipment_modifiers)
```

---

## Best Practices

### 1. Separate Base from Derived
```python
# Good: Clear separation
npc.stats = {"strength": 90}  # Base
session.stats["npc:1"] = {"strength": 100}  # Derived (with buffs)

# Bad: Mixing base and derived
npc.stats = {"strength": 90, "strengthWithBuffs": 100}  # Confusing!
```

### 2. Use Metadata for Modifiers
```python
# Good: Metadata tracks sources
item.stats_metadata = {
    "modifiers": [
        {"source": "enchantment:fire", "type": "additive", "axis": "strength", "value": 10}
    ]
}

# Bad: Opaque values
item.stats = {"strength_bonus": 10}  # Where did this come from?
```

### 3. Session-Specific State
```python
# Good: Session owns runtime state
session.stats["npc_states"]["npc:1"] = {"health": 65}  # Current HP

# Bad: Modifying template
npc_template.stats["health"] = 65  # Affects all instances!
```

### 4. Normalize Before Display
```python
# Good: Compute tiers for UI
normalized = StatEngine.normalize_entity_stats(stats, definition)
display_tier = normalized["strengthTierId"]  # "expert"

# Bad: Raw values only
display_value = stats["strength"]  # 90 - what does this mean?
```

---

## Integration with Game Maker Editor

### Visual Stat Builder

```
[NPC Editor]
Name: Alice the Warrior

┌─ Base Stats ────────────────┐
│ Combat Skills:              │
│ ├─ Strength:  [====90====] │ Expert
│ ├─ Agility:   [===60=====] │ Advanced
│ └─ Defense:   [====75====] │ Expert
│                             │
│ Attributes:                 │
│ ├─ Health:    [===100====] │
│ └─ Stamina:   [====80====] │
└─────────────────────────────┘

[Equipment Slots]
┌─ Weapon ─────────────┐
│ Sword of Power       │
│ +10 Strength         │
└──────────────────────┘

[Preview with Equipment]
Strength: 100 (90 base + 10 equipment) → Expert
```

### Stat Definition Templates

Game makers can select from pre-defined templates:
- **Combat**: Strength, Agility, Defense
- **RPG Attributes**: Health, Mana, Stamina
- **Social**: Charm, Intimidation, Persuasion
- **Crafting**: Precision, Creativity, Efficiency
- **Custom**: Define your own axes

---

**See also**: ABSTRACT_STAT_SYSTEM.md for core architecture
**Version**: 1.0
**Last Updated**: 2025-12-02
