# Personality Stack

This document describes the personality system architecture and how components work together.

## Overview

The personality system uses the Big Five model (OCEAN):
- **O**penness - Creativity, curiosity, preference for novelty
- **C**onscientiousness - Organization, dependability, self-discipline
- **E**xtraversion - Energy, sociability, talkativeness
- **A**greeableness - Cooperation, trust, helpfulness
- **N**euroticism - Emotional instability, anxiety, moodiness

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANONICAL DEFINITIONS                         │
│                  domain/game/personality/                        │
├─────────────────────────────────────────────────────────────────┤
│  traits.py          - PersonalityTrait enum, trait info         │
│  conversation_style.py - Style derivation logic                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ imports
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  STATS PACKAGE  │  │  BRAIN PLUGIN   │  │ BEHAVIOR PLUGIN │
│  personality_   │  │  conversation_  │  │  manifest.py    │
│  package.py     │  │  style.py       │  │  (plugins/)     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  StatEngine     │  │  Brain Engine   │  │ Behavior Engine │
│  (derivations)  │  │  (derivations)  │  │ (trait effects) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Components

### 1. Canonical Definitions (`domain/game/personality/`)

**Single source of truth** for all personality-related constants.

```python
from pixsim7.backend.main.domain.game.personality import (
    PersonalityTrait,           # Enum: OPENNESS, CONSCIENTIOUSNESS, etc.
    PERSONALITY_TRAITS,         # List of all traits
    PERSONALITY_TRAIT_NAMES,    # List of trait string names
    get_trait_info,             # Get display name, description, semantic type
    derive_conversation_style,  # Compute style from personality
)
```

### 2. Stats Package (`domain/game/stats/personality_package.py`)

Provides personality as a StatDefinition for the stats engine.

- Defines 5 axes (one per trait) with 0-100 range
- Defines 5 tiers per axis (very_low, low, moderate, high, very_high)
- Registered as `core.personality` package

Used for:
- World-level stat configuration
- Stat normalization and tier computation
- Semantic derivations (conversation style)

### 3. Conversation Style Derivation

Shared logic in `personality/conversation_style.py`:
- Maps personality traits to style dimensions (warmth, energy, formality)
- Maps dimensions to style labels (enthusiastic, warm, curt, etc.)

Two consumers:
- **Stats Package** (`conversation_style_package.py`): Uses TransformRule syntax
- **Brain Plugin** (`brain/derivations/conversation_style.py`): Delegates to shared module

### 4. Behavior Plugin (`packages/plugins/personality/`)

Provides trait-to-activity mappings for the behavior engine.

- Tag effects (uncomfortable, comfortable, phobia, passion, etc.)
- Behavior profiles (low_energy, evening_wind_down, seeking_comfort)
- Trait effect mappings (how Big Five affects activity preferences)

Uses canonical trait names from `domain/game/personality`.

### 5. Services

**NPCStatService** (`services/npc/stat.py`):
- CRUD operations for personality stat values
- Read/write personality to GameNPC/NPCState

**PersonalityEvolutionService** (`services/npc/personality.py`):
- Tracks personality changes over time
- Computes trait trajectories
- Suggests changes based on milestones/emotions

### 6. ORM Model (`entities/npc_memory.py`)

**PersonalityEvolutionEvent**:
- Records personality changes with audit trail
- Stores old/new values, trigger, context

Imports `PersonalityTrait` from the canonical module.

## Adding a New Trait

If you need to extend beyond Big Five:

1. Add to `personality/traits.py`:
   ```python
   class PersonalityTrait(str, Enum):
       # ... existing traits
       NEW_TRAIT = "new_trait"

   _TRAIT_INFO[PersonalityTrait.NEW_TRAIT] = TraitInfo(...)
   ```

2. The stats package will automatically include it (uses `PERSONALITY_TRAITS`)

3. Update behavior plugin if needed for trait-to-activity mappings

4. Update conversation style if the trait affects communication

## Thresholds

Style thresholds are defined in `personality/conversation_style.py`:

```python
STYLE_THRESHOLDS = {
    "enthusiastic": {"energy_gte": 70, "warmth_gte": 65},
    "playful": {"energy_gte": 65, "warmth_between": (40, 70), "formality_lte": 40},
    # ... etc
}
```

Both the brain plugin and stats package use these thresholds (the stats package
has a parallel definition in TransformRule syntax for the derivation engine).

## Migration Notes

As of this consolidation:
- `PersonalityTrait` enum moved from `npc_memory.py` to `personality/traits.py`
- Old imports from `npc_memory` still work (re-exported)
- New code should import directly from `domain/game/personality`
