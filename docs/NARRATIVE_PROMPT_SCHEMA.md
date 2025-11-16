# Narrative Prompt Program Schema

## Overview

This document defines the JSON/AST schema for narrative prompt programs that drive NPC dialogue and cinematic generation in PixSim7. These programs are data-driven templates that combine NPC persona, relationship state, and contextual information to produce prompts for LLM dialogue generation.

## Core Schema Structure

### PromptProgram

The root structure for a narrative prompt program:

```json
{
  "id": "casual_conversation",
  "version": "1.0.0",
  "description": "Casual conversation between NPC and player",
  "inputs": {
    "required": ["npc_id", "affinity", "trust"],
    "optional": ["chemistry", "tension", "location_id", "world_time"]
  },
  "stages": [
    // Array of PromptStage objects
  ]
}
```

### PromptStage

Each stage represents a step in building the final prompt:

```json
{
  "id": "persona_baseline",
  "type": "template" | "conditional" | "selector" | "formatter",
  "description": "Build NPC persona context",
  "template": "...",
  "conditions": [],
  "selectors": [],
  "formatters": []
}
```

## Stage Types

### 1. Template Stage

Simple text template with variable substitution:

```json
{
  "id": "npc_intro",
  "type": "template",
  "template": "You are {{npc.name}}, a {{npc.personality.traits}} character. Current location: {{location.name}}."
}
```

### 2. Conditional Stage

Includes content based on conditions:

```json
{
  "id": "relationship_context",
  "type": "conditional",
  "conditions": [
    {
      "test": "affinity >= 60",
      "template": "You and the player are close friends who trust each other."
    },
    {
      "test": "affinity >= 30 && affinity < 60",
      "template": "You know the player and are friendly but not particularly close."
    },
    {
      "test": "affinity < 30",
      "template": "You barely know the player and should be polite but reserved."
    }
  ]
}
```

### 3. Selector Stage

Selects templates based on multi-axis matching:

```json
{
  "id": "intimacy_tone",
  "type": "selector",
  "selectors": [
    {
      "match": {
        "intimacy_level": "very_intimate",
        "tension": {"min": 50}
      },
      "template": "There's palpable romantic tension. Your responses should be flirty but with underlying nervousness."
    },
    {
      "match": {
        "intimacy_level": "intimate",
        "chemistry": {"min": 60}
      },
      "template": "You feel attracted to the player and your responses should have subtle romantic undertones."
    },
    {
      "match": {
        "intimacy_level": "light_flirt"
      },
      "template": "You might include playful teasing or light flirtation if it feels natural."
    }
  ],
  "default": {
    "template": "Maintain appropriate social boundaries in your responses."
  }
}
```

### 4. Formatter Stage

Transforms or combines previous outputs:

```json
{
  "id": "final_prompt",
  "type": "formatter",
  "formatters": [
    {
      "type": "combine",
      "separator": "\n\n",
      "sources": ["persona_baseline", "relationship_context", "intimacy_tone"]
    },
    {
      "type": "append",
      "template": "\n\nPlayer's last message: {{player_input}}\n\nRespond as {{npc.name}} would, staying in character."
    }
  ]
}
```

## Condition Expressions

Conditions use a simple expression language:

- **Comparison**: `affinity >= 60`, `trust < 30`
- **Logical**: `affinity >= 60 && chemistry >= 40`
- **Range**: `tension BETWEEN 20 AND 50`
- **Flags**: `flags.kissed_once == true`
- **Arc state**: `arcs.main_romance.stage >= 2`

## Variable Reference

Variables available in templates:

### NPC Context
- `{{npc.id}}` - NPC ID
- `{{npc.name}}` - NPC name
- `{{npc.personality.*}}` - Personality traits from GameNPC.personality

### Relationship State
- `{{affinity}}` - Affinity value (0-100)
- `{{trust}}` - Trust value (0-100)
- `{{chemistry}}` - Chemistry value (0-100)
- `{{tension}}` - Tension value (0-100)
- `{{relationship_tier}}` - Computed tier (stranger, friend, lover, etc.)
- `{{intimacy_level}}` - Computed intimacy level

### Session Context
- `{{world_time}}` - Current world time in seconds
- `{{location.id}}` - Current location ID
- `{{location.name}}` - Current location name
- `{{flags.*}}` - Session flags
- `{{arcs.*}}` - Arc progression state

### Scene Context
- `{{scene.id}}` - Current scene ID
- `{{node.id}}` - Current node ID
- `{{node.meta.*}}` - Node metadata

### Player Input
- `{{player_input}}` - Last player text or choice
- `{{player_choice_id}}` - ID of selected choice

## Output Metadata

The program can specify metadata to return:

```json
{
  "id": "metadata_builder",
  "type": "formatter",
  "metadata": {
    "suggested_intents": [
      {
        "condition": "chemistry >= 60 && intimacy_level == 'intimate'",
        "intents": ["increase_intimacy", "romantic_gesture"]
      },
      {
        "condition": "tension >= 70",
        "intents": ["resolve_tension", "change_topic"]
      }
    ],
    "visual_prompt": {
      "condition": "node.meta.requires_visual == true",
      "template": "{{npc.name}} in {{location.name}}, {{node.meta.visual_mood}} mood, cinematic lighting"
    },
    "expression_hint": {
      "condition": "affinity >= 60",
      "value": "smiling"
    }
  }
}
```

## Example Complete Program

```json
{
  "id": "npc_dialogue_romantic_arc",
  "version": "1.0.0",
  "description": "Dialogue program for NPCs in romantic story arcs",
  "inputs": {
    "required": ["npc_id", "affinity", "trust", "chemistry", "tension"],
    "optional": ["location_id", "world_time", "player_input"]
  },
  "stages": [
    {
      "id": "base_persona",
      "type": "template",
      "template": "You are {{npc.name}}. Core traits: {{npc.personality.traits}}. Background: {{npc.personality.background}}."
    },
    {
      "id": "location_context",
      "type": "conditional",
      "conditions": [
        {
          "test": "location.id != null",
          "template": "You are currently at {{location.name}}."
        }
      ]
    },
    {
      "id": "relationship_state",
      "type": "selector",
      "selectors": [
        {
          "match": {
            "relationship_tier": "lover",
            "chemistry": {"min": 80}
          },
          "template": "You and the player are in a romantic relationship. You feel deep love and passion."
        },
        {
          "match": {
            "relationship_tier": "close_friend",
            "chemistry": {"min": 60}
          },
          "template": "You have strong feelings for the player but haven't expressed them yet. There's romantic tension."
        },
        {
          "match": {
            "relationship_tier": "friend"
          },
          "template": "The player is a good friend. You enjoy their company."
        }
      ],
      "default": {
        "template": "You're getting to know the player."
      }
    },
    {
      "id": "arc_context",
      "type": "conditional",
      "conditions": [
        {
          "test": "arcs.main_romance.stage >= 3",
          "template": "You've recently confessed your feelings and are navigating this new romantic phase."
        },
        {
          "test": "flags.had_first_kiss == true && arcs.main_romance.stage < 3",
          "template": "The kiss you shared weighs on your mind, creating both excitement and uncertainty."
        }
      ]
    },
    {
      "id": "emotional_modifiers",
      "type": "conditional",
      "conditions": [
        {
          "test": "tension >= 70",
          "template": "You feel nervous and there are things left unsaid between you."
        },
        {
          "test": "trust < 30",
          "template": "You're cautious about opening up too much."
        }
      ]
    },
    {
      "id": "final_prompt",
      "type": "formatter",
      "formatters": [
        {
          "type": "combine",
          "separator": "\n\n",
          "sources": ["base_persona", "location_context", "relationship_state", "arc_context", "emotional_modifiers"]
        },
        {
          "type": "append",
          "template": "\n\nConversation style: {{npc.personality.conversation_style}}\n\nPlayer says: \"{{player_input}}\"\n\nRespond naturally as {{npc.name}}, staying true to your personality and current emotional state. Keep responses concise (2-3 sentences unless more is needed)."
        }
      ],
      "metadata": {
        "suggested_intents": [
          {
            "condition": "chemistry >= 70 && tension >= 50",
            "intents": ["romantic_confession", "physical_touch"]
          },
          {
            "condition": "trust < 40",
            "intents": ["build_trust", "share_vulnerability"]
          }
        ],
        "visual_prompt": {
          "condition": "node.meta.cinematic == true",
          "template": "Intimate close-up: {{npc.name}} and player, soft lighting, {{location.name}}, romantic mood"
        }
      }
    }
  ]
}
```

## Implementation Notes

1. **Performance**: Programs should be cached after parsing
2. **Validation**: Validate all condition expressions at load time
3. **Extensibility**: New stage types can be added without breaking existing programs
4. **Debugging**: Include trace mode that shows which stages contributed to final output
5. **Versioning**: Programs include version field for migration support