# Personality Plugin

Personality-driven NPC behavior system based on the Big Five personality model.

## Features

### Tag Effects

Semantic tags that modify activity scoring:

| Tag | Multiplier | Description |
|-----|------------|-------------|
| `trauma` | 0.01 | Severe aversion (99% penalty) |
| `phobia` | 0.05 | Strong aversion (95% penalty) |
| `uncomfortable` | 0.3 | Mild aversion (70% penalty) |
| `neutral` | 1.0 | No effect |
| `comfortable` | 1.5 | Mild preference (50% bonus) |
| `passion` | 2.5 | Strong preference (150% bonus) |
| `addiction` | 3.0 | Compulsive (200% bonus) |

### Behavior Profiles

Contextual behavior modifications that activate based on conditions:

| Profile | Condition | Effect |
|---------|-----------|--------|
| `low_energy` | energy ≤ 30 | rest: 2x, sleep: 2.5x |
| `evening_wind_down` | evening/night | leisure: 1.3x, work: 0.7x |
| `seeking_comfort` | valence ≤ -20 | comfort: 1.8x, social: 0.6x |

### Trait Effect Mappings (Big Five)

Maps personality traits to behavioral effects:

| Trait | Effects |
|-------|---------|
| **Introversion** | Social vs solitary preferences |
| **Openness** | Creative vs routine preferences |
| **Neuroticism** | Risk-taking vs comfort-seeking |
| **Conscientiousness** | Work vs leisure preferences |
| **Agreeableness** | Cooperative vs competitive |

## Usage

### Archetype Example

```yaml
archetypes:
  shy_bookworm:
    traits:
      introversion: "high"
      openness: "high"
      neuroticism: "medium"
    behaviorModifiers:
      uncomfortableWith: ["crowds", "confrontation"]
      comfortableWith: ["reading", "solitary"]
```

### Custom Tag Effects

Archetypes can override default tag multipliers:

```yaml
behaviorModifiers:
  tagEffects:
    uncomfortable:
      multiplier: 0.1  # More sensitive than default 0.3
    phobia:
      multiplier: 0.001  # Essentially never
```

## Disabling

To use a different personality model or no personality system:

1. Disable this plugin in world settings
2. Create your own plugin with custom trait mappings

## API

This plugin registers with the behavior registry:

- `behavior_registry.register_tag_effect()`
- `behavior_registry.register_behavior_profile()`
- `behavior_registry.register_trait_effect_mapping()`
