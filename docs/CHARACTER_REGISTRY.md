# Character Registry System

## Overview

The Character Registry allows you to define **persistent, reusable characters** that can be referenced across prompts and action blocks using template syntax. This ensures consistency and makes it easy to swap characters or track their evolution over time.

## Quick Start

### 1. Create a Character

```bash
POST /api/v1/characters
{
    "character_id": "gorilla_01",
    "name": "Koba",
    "category": "creature",
    "species": "gorilla",
    "visual_traits": {
        "build": "tribal, muscular, towering",
        "scars": ["thick scar across left palm"],
        "posture": "wary, deliberate",
        "fur_color": "dark grey"
    },
    "personality_traits": {
        "demeanor": "cautious",
        "behavior": "primal, instinctual",
        "temperament": "volatile"
    },
    "behavioral_patterns": {
        "movement_style": "deliberate, powerful",
        "quirks": ["glances side to side when nervous"]
    },
    "voice_profile": {
        "breathing": "heavy, panting",
        "sounds": ["intimidating growl"]
    },
    "render_style": "realistic",
    "render_instructions": "Realistic fur rendering. Maintain consistent lighting."
}
```

### 2. Use in Prompts

**Template:**
```
{{character:gorilla_01}} steps into frame from opposite axis.
He glances side to side, then approaches.
His scarred hand braces against the wall.
```

**Expanded (via API):**
```bash
POST /api/v1/characters/expand-template
{
    "prompt_text": "{{character:gorilla_01}} steps into frame..."
}
```

**Result:**
```
Koba the gorilla—tribal, muscular, towering, thick scar across left palm, wary, deliberate, dark grey fur—steps into frame from opposite axis.
He glances side to side, then approaches.
His scarred hand braces against the wall.
```

### 3. Create Variations

```bash
POST /api/v1/characters
{
    "character_id": "gorilla_02",
    "name": "Caesar",
    "species": "gorilla",
    "visual_traits": {
        "build": "lean, agile",
        "posture": "confident, alpha",
        "scars": []
    },
    "personality_traits": {
        "demeanor": "commanding",
        "intelligence": "strategic"
    }
}
```

Now you can swap characters:
```
// Original
{{character:gorilla_01}} approaches

// Swap to gorilla_02
{{character:gorilla_02}} approaches
```

---

## Template Syntax

### Full Expansion (Default)

```
{{character:gorilla_01}}
```

Expands to:
```
Koba the gorilla—tribal, muscular, towering, thick scar across left palm, wary, deliberate, dark grey fur
```

### Name Only

```
{{character:gorilla_01:name}}
```

Expands to:
```
Koba
```

### Visual Traits Only

```
{{character:gorilla_01:visual}}
```

Expands to:
```
tribal, muscular, towering, thick scar across left palm, wary, deliberate, dark grey fur
```

---

## Character Evolution

Characters can evolve over time (e.g., getting scars after battle scenes):

```bash
POST /api/v1/characters/gorilla_01/evolve
{
    "visual_traits": {
        "build": "tribal, muscular, towering",
        "scars": [
            "thick scar across left palm",
            "fresh wound on right shoulder"  // NEW!
        ],
        "posture": "more aggressive"
    },
    "version_notes": "Added shoulder wound from battle in prompt_v5"
}
```

This creates **version 2** of gorilla_01. All future prompts will use version 2, but you can still access version 1 history.

---

## API Reference

### Character CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/characters` | POST | Create new character |
| `/characters` | GET | List all characters (with filters) |
| `/characters/search?q=gorilla` | GET | Search characters |
| `/characters/{id}` | GET | Get character details |
| `/characters/{id}` | PUT | Update character |
| `/characters/{id}` | DELETE | Delete character (soft by default) |

### Versioning

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/characters/{id}/history` | GET | Get all versions |
| `/characters/{id}/evolve` | POST | Create new version |

### Templates

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/characters/expand-template` | POST | Expand `{{character:id}}` references |
| `/characters/validate-template` | POST | Validate references exist |
| `/characters/{id}/template` | GET | Get template string for character |

### Usage Tracking

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/characters/{id}/usage` | GET | See where character is used |
| `/characters/stats` | GET | Registry statistics |

---

## Example Use Cases

### Use Case 1: Define Characters Once

```bash
# Create main characters
POST /characters  # gorilla_01 - Koba
POST /characters  # gorilla_02 - Caesar
POST /characters  # female_dancer_01 - Sarah
```

### Use Case 2: Write Prompts as Templates

```
{{character:female_dancer_01}} pulsates her hip bones in a slow stripper style.
{{character:gorilla_01}} steps into frame—towering, lured by her behavior.
With a smirk, {{character:female_dancer_01:name}} continues chewing.
{{character:gorilla_01}} approaches, his scarred hand bracing against the wall.
```

### Use Case 3: Swap Characters

```
# Original scene with gorilla_01
{{character:gorilla_01}} approaches {{character:female_dancer_01}}

# Try the scene with gorilla_02 instead
{{character:gorilla_02}} approaches {{character:female_dancer_01}}
```

Different personalities/appearances automatically applied!

### Use Case 4: Track Evolution

```
Version 1: gorilla_01 has no scars
Version 2: gorilla_01 gets scarred hand (after battle)
Version 3: gorilla_01's scar has healed partially
```

All tracked automatically with version history.

### Use Case 5: Game Integration (Future)

```bash
# Link character to game NPC
PUT /characters/gorilla_01
{
    "game_npc_id": "npc_koba_001",
    "sync_with_game": true
}

# When NPC state changes in game, character updates automatically
# When character evolves, NPC state updates
```

---

## Character Schema

### Visual Traits

Suggested keys (all optional, flexible JSONB):
```json
{
    "build": "muscular, lean, towering, compact",
    "height": "8 feet",
    "skin_fur": "dark grey fur / tan skin / scales",
    "eyes": "amber / blue / red",
    "hair": "long black hair / bald / mohawk",
    "distinguishing_marks": ["scar", "tattoo", "birthmark"],
    "clothing": "tribal loincloth / modern suit / armor",
    "accessories": ["necklace", "weapon", "jewelry"]
}
```

### Personality Traits

```json
{
    "demeanor": "cautious / confident / shy / aggressive",
    "intelligence": "cunning / simple / genius / naive",
    "temperament": "volatile / calm / patient / hot-headed",
    "alignment": "good / evil / neutral / chaotic",
    "motivations": ["survival", "power", "love", "revenge"]
}
```

### Behavioral Patterns

```json
{
    "movement_style": "deliberate / quick / graceful / clumsy",
    "social_behavior": "territorial / friendly / aloof / dominant",
    "combat_style": "aggressive grappler / defensive / ranged / magical",
    "quirks": ["glances side to side when nervous", "taps fingers", "hums"]
}
```

### Voice Profile

```json
{
    "voice_type": "deep / high / raspy / melodic",
    "speech_pattern": "minimal grunts / eloquent / stuttering",
    "breathing": "heavy panting / normal / labored",
    "signature_sounds": ["growl", "laugh", "sigh"]
}
```

---

## Best Practices

### ✅ DO:

- **Define characters once** with full detail
- **Use descriptive character_ids** like `gorilla_01`, `sarah_dancer`
- **Create versions** when characters evolve (scars, clothing changes)
- **Use template syntax** `{{character:id}}` in prompts
- **Track relationships** between characters
- **Link to game NPCs** for consistency

### ❌ DON'T:

- **Hardcode** character descriptions in prompts (use registry!)
- **Create duplicate** characters (use versions instead)
- **Delete characters** that are in use (check usage first)
- **Skip versioning** when appearance changes significantly

---

## Database Tables

### characters
```sql
CREATE TABLE characters (
    id UUID PRIMARY KEY,
    character_id VARCHAR(200) UNIQUE,  -- "gorilla_01"
    name VARCHAR(200),                  -- "Koba"
    display_name VARCHAR(200),          -- "Koba the Gorilla"
    category VARCHAR(50),               -- "creature"
    species VARCHAR(100),               -- "gorilla"
    visual_traits JSONB,
    personality_traits JSONB,
    behavioral_patterns JSONB,
    voice_profile JSONB,
    version INT DEFAULT 1,
    previous_version_id UUID,
    usage_count INT DEFAULT 0,
    ...
);
```

### character_relationships
```sql
CREATE TABLE character_relationships (
    id UUID PRIMARY KEY,
    character_a_id UUID,
    character_b_id UUID,
    relationship_type VARCHAR(50),  -- "allies", "rivals", "lovers"
    relationship_strength FLOAT,    -- 0.0 to 1.0
    history JSON,
    ...
);
```

### character_usage
```sql
CREATE TABLE character_usage (
    id UUID PRIMARY KEY,
    character_id UUID,
    usage_type VARCHAR(50),         -- "prompt", "action_block"
    prompt_version_id UUID,
    action_block_id UUID,
    template_reference VARCHAR(500), -- "{{character:gorilla_01}}"
    used_at TIMESTAMP
);
```

---

## Migration

Run the migration to create tables:

```bash
# Using Alembic
alembic upgrade head
```

Migration file: `20251118_1200_add_character_registry.py`

---

## Integration with Existing Systems

### With Prompts

```python
# Create prompt with character template
prompt = "{{character:gorilla_01}} approaches {{character:sarah}}"

# Expand before generation
from pixsim7_backend.services.characters import CharacterTemplateEngine
engine = CharacterTemplateEngine(db)
result = await engine.expand_prompt(prompt, track_usage=True)
# result["expanded_text"] = "Koba the gorilla—tribal, muscular—approaches Sarah the dancer..."
```

### With Action Blocks

```python
# Create action block with character template
block = ActionBlockDB(
    block_id="gorilla_approach_generic",
    prompt="{{character:gorilla_id}} steps into frame—towering, tribal",
    variables={"gorilla_id": "gorilla_01"}  # Can swap to gorilla_02
)

# Expand when using block
expanded = await engine.expand_action_block_prompt(
    block.prompt,
    action_block_id=block.id
)
```

### With Game NPCs (Future)

```python
# When NPC state changes
game.npc.update("npc_koba_001", {"health": 50, "status": "wounded"})

# Automatically update linked character
character_service.sync_from_game("gorilla_01")

# Character gets new trait
character.visual_traits["distinguishing_marks"].append("fresh battle wounds")
```

---

## Summary

**Character Registry** enables:

✅ **Consistency** - gorilla_01 always looks the same
✅ **Reusability** - Define once, use everywhere
✅ **Flexibility** - Easy character swaps (gorilla_01 → gorilla_02)
✅ **Evolution** - Track changes over time with versioning
✅ **Game Integration** - Link to NPCs for state sync
✅ **Template Power** - `{{character:X}}` expands automatically

This addresses your need for "permanent characters like NPCs" with the ability to have specific variations (gorilla_01, gorilla_02) that can link back to the game! 🎮
