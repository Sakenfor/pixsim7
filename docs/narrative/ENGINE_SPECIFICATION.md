# Narrative Engine Specification

**Last Updated:** 2025-12-14

This document provides a comprehensive specification for PixSim7's Narrative Engine, which generates contextual dialogue prompts for NPCs based on relationship state, world context, and story progression.

**Contents:**
1. [Overview & Goals](#overview--goals)
2. [System Architecture](#system-architecture)
3. [Prompt Program Schema](#prompt-program-schema)
4. [API Reference](#api-reference)
5. [Implementation Guide](#implementation-guide)

---

## Overview & Goals

### What is the Narrative Engine?

The PixSim7 Narrative Engine is a data-driven system that produces dialogue prompts for NPCs by combining:
- **NPC persona** (baseline + per-world overrides)
- **Session relationship state** (affinity, trust, chemistry, tension)
- **World/arc state** (story arcs, quests, flags)
- **Scene/node metadata** (roles, NPC bindings, hints)
- **Player input** (chosen options or free text)

### Design Goals

The system must:
- Be **data-driven**: No hardcoded relationship levels in code
- **Respect existing conventions**: meta, flags, relationships
- **Integrate incrementally**: Start with concrete beats, expand later
- **Support multiple prompt programs**: Different dialogue styles per context
- **Enable visual prompts**: Support both text dialogue and cinematic generation

### Output

The engine produces:
1. **llm_prompt**: Text prompt string for chat LLM dialogue generation
2. **visual_prompt**: Optional text suitable for image→video generation
3. **meta**: Structured metadata (relationship state, suggested intents, expression hints)

---

## System Architecture

### Relationship State Model

For each NPC in a session:

```json
{
  "affinity": 72,      // How much they like the player (0-100)
  "trust": 55,         // Comfort / safety (0-100)
  "chemistry": 68,     // Romantic/erotic spark (0-100)
  "tension": 30,       // Unresolved emotional charge (0-100)
  "flags": {
    "kissed_once": true,
    "slept_over": false,
    "knows_secret_x": true
  }
}
```

**Storage:** `GameSession.stats["relationships"]["npc:{npcId}"]`

**Conventions:**
- Values use 0-100 scale (enforced by application logic, not schema)
- Flags are boolean or string values capturing relationship milestones
- This state is documented in [RELATIONSHIPS_AND_ARCS.md](../RELATIONSHIPS_AND_ARCS.md)

### Relationship Tiers

Configure tiers in `GameWorld.meta.relationship_schemas`:

```json
{
  "relationship_schemas": {
    "default": [
      { "id": "stranger", "min": 0, "max": 9 },
      { "id": "acquaintance", "min": 10, "max": 29 },
      { "id": "friend", "min": 30, "max": 59 },
      { "id": "close_friend", "min": 60, "max": 79 },
      { "id": "lover", "min": 80, "max": 100 }
    ]
  }
}
```

### Intimacy Levels

Configure levels in `GameWorld.meta.intimacy_schema`:

```json
{
  "intimacy_schema": {
    "axes": ["affinity", "trust", "chemistry", "tension"],
    "levels": [
      {
        "id": "light_flirt",
        "minAffinity": 20,
        "minChemistry": 20,
        "minTrust": 10
      },
      {
        "id": "deep_flirt",
        "minAffinity": 40,
        "minChemistry": 40,
        "minTrust": 20
      },
      {
        "id": "intimate",
        "minAffinity": 60,
        "minChemistry": 60,
        "minTrust": 40
      },
      {
        "id": "very_intimate",
        "minAffinity": 80,
        "minChemistry": 80,
        "minTrust": 60
      }
    ]
  }
}
```

---

## Prompt Program Schema

### PromptProgram (Root)

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
    {
      "id": "persona_baseline",
      "type": "template",
      "template": "You are {{npc.name}}, a {{npc.personality.traits}} character."
    },
    // ... more stages
  ]
}
```

### PromptStage

Each stage represents a step in building the final prompt:

```json
{
  "id": "persona_baseline",
  "type": "template" | "conditional" | "selector" | "formatter",
  "description": "Stage description",
  "template": "...",
  "conditions": [],
  "selectors": [],
  "formatters": []
}
```

### Stage Types

#### 1. Template Stage

Simple text template with variable substitution:

```json
{
  "id": "npc_intro",
  "type": "template",
  "template": "You are {{npc.name}}, a {{npc.personality.traits}} character. Current location: {{location.name}}."
}
```

**Variables:**
- `{{npc.name}}` - NPC display name
- `{{npc.personality.traits}}` - Personality description
- `{{location.name}}` - Current location name
- `{{world_time}}` - Current world time
- `{{player_input}}` - Player's last message

#### 2. Conditional Stage

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

**Expression syntax:**
- Comparison: `affinity >= 60`, `trust < 30`
- Logical: `affinity >= 60 && chemistry >= 40`
- Supported operators: `>=`, `<=`, `>`, `<`, `==`, `!=`, `&&`, `||`

#### 3. Selector Stage

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
    }
  ],
  "default": {
    "template": "Maintain appropriate social boundaries in your responses."
  }
}
```

**Match syntax:**
- `"field": "value"` - Exact match
- `"field": {"min": N}` - Minimum value
- `"field": {"max": N}` - Maximum value
- `"field": {"min": N, "max": M}` - Range

#### 4. Formatter Stage

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

**Formatter types:**
- `combine`: Join stage outputs
- `append`: Add text after current output
- `prepend`: Add text before current output

---

## API Reference

### Generate Next Dialogue Line

**Endpoint:** `POST /api/v1/game/dialogue/next-line`

Generates a prompt for an LLM to create the next dialogue line for an NPC.

#### Request Body

```json
{
  "npc_id": 12,
  "session_id": 456,           // Optional if scene_id provided
  "scene_id": 789,             // Optional if session_id provided
  "node_id": 234,              // Optional, current scene node
  "player_input": "Hello, how are you today?",
  "player_choice_id": "choice_friendly",  // Optional
  "world_id": 1,               // Optional, defaults to session world
  "location_id": 5,            // Optional, current location
  "program_id": "default_dialogue"  // Optional, defaults to "default_dialogue"
}
```

#### Response

```json
{
  "llm_prompt": "You are Anete. Charismatic and confident...\n\nYou and the player are close friends...\n\nPlayer says: \"Hello, how are you today?\"\n\nRespond as Anete would, staying in character.",
  "visual_prompt": null,
  "meta": {
    "relationship_state": {
      "affinity": 72,
      "trust": 55,
      "chemistry": 68,
      "tension": 30,
      "relationship_tier": "close_friend",
      "intimacy_level": "deep_flirt"
    },
    "suggested_intents": ["build_trust", "romantic_gesture"],
    "expression_hint": "smiling"
  }
}
```

### Debug Dialogue Generation

**Endpoint:** `POST /api/v1/game/dialogue/next-line/debug`

Same as `/next-line` but includes full context and stage-by-stage debug information.

#### Response (Additional Fields)

```json
{
  "context": {
    "npc": { /* Full NPC context */ },
    "world": { /* Full world context */ },
    "session": { /* Full session context */ },
    "relationship": { /* Full relationship context */ },
    "location": { /* Location context if present */ },
    "scene": { /* Scene context if present */ }
  },
  "debug": {
    "stage_outputs": {
      "base_persona": "You are Anete. Charismatic and confident...",
      "relationship_context": "You and the player are close friends...",
      "intimacy_modifier": "There's romantic tension between you..."
    }
  },
  // ... plus all fields from regular response
}
```

---

## Implementation Guide

### Usage Examples

#### Basic Dialogue Generation

```typescript
// apps/main/src/lib/api/narrative.ts

export async function generateDialogue(
  npcId: number,
  sessionId: number,
  playerInput: string
): Promise<DialogueResponse> {
  const response = await fetch('/api/v1/game/dialogue/next-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      npc_id: npcId,
      session_id: sessionId,
      player_input: playerInput
    })
  });

  return response.json();
}
```

#### With Scene Context

```typescript
export async function generateSceneDialogue(
  npcId: number,
  sceneId: number,
  nodeId: number,
  playerChoice: string
): Promise<DialogueResponse> {
  const response = await fetch('/api/v1/game/dialogue/next-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      npc_id: npcId,
      scene_id: sceneId,
      node_id: nodeId,
      player_choice_id: playerChoice,
      player_input: getChoiceText(playerChoice)
    })
  });

  return response.json();
}
```

#### Integration with LLM

```typescript
async function getNPCResponse(
  npcId: number,
  sessionId: number,
  playerInput: string
): Promise<string> {
  // 1. Get the prompt from narrative engine
  const dialogueData = await generateDialogue(npcId, sessionId, playerInput);

  // 2. Call your LLM service with the generated prompt
  const llmResponse = await callLLM(dialogueData.llm_prompt);

  // 3. Update relationship state if needed
  if (dialogueData.meta.suggested_intents?.includes('increase_intimacy')) {
    await updateRelationship(sessionId, npcId, {
      chemistry: '+5',
      tension: '-2'
    });
  }

  // 4. Return the generated dialogue
  return llmResponse.text;
}
```

### Creating Custom Programs

Place JSON files in the configured programs directory:

```json
{
  "id": "romantic_scene",
  "version": "1.0.0",
  "description": "Specialized program for romantic scenes",
  "stages": [
    {
      "id": "romantic_context",
      "type": "selector",
      "selectors": [
        {
          "match": {
            "intimacy_level": "very_intimate",
            "chemistry": {"min": 80}
          },
          "template": "You feel deep love and passion for the player. Every word carries weight."
        },
        {
          "match": {
            "intimacy_level": "intimate"
          },
          "template": "There's undeniable chemistry. You're drawn to the player."
        }
      ],
      "default": {
        "template": "You're developing feelings but keeping them guarded."
      }
    }
  ]
}
```

### Using Custom Programs

```typescript
const response = await fetch('/api/v1/game/dialogue/next-line', {
  method: 'POST',
  body: JSON.stringify({
    npc_id: npcId,
    session_id: sessionId,
    player_input: playerInput,
    program_id: "romantic_scene"  // Use custom program
  })
});
```

### Managing Relationship State

Update relationships via session PATCH endpoint:

```typescript
async function updateRelationship(
  sessionId: number,
  npcId: number,
  changes: RelationshipChanges
): Promise<void> {
  const session = await getSession(sessionId);
  const npcKey = `npc:${npcId}`;

  // Apply changes
  const currentRel = session.relationships[npcKey] || {};
  const updated = {
    affinity: applyChange(currentRel.affinity, changes.affinity),
    trust: applyChange(currentRel.trust, changes.trust),
    chemistry: applyChange(currentRel.chemistry, changes.chemistry),
    tension: applyChange(currentRel.tension, changes.tension),
    flags: { ...currentRel.flags, ...changes.flags }
  };

  // Save back
  await fetch(`/api/v1/game/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      relationships: {
        ...session.relationships,
        [npcKey]: updated
      }
    })
  });
}
```

### Best Practices

1. **Cache Results**: Store generated prompts for similar contexts to reduce API calls
2. **Update Incrementally**: Make small relationship changes based on player actions
3. **Use Metadata**: Leverage suggested_intents to trigger game mechanics
4. **Debug Mode**: Use the debug endpoint during development to understand prompt generation
5. **Validate Context**: Ensure session and world data are properly initialized

### Error Handling

The API returns standard HTTP error codes:
- `400`: Missing required parameters
- `404`: Session, NPC, or World not found
- `500`: Internal server error

Example error response:

```json
{
  "detail": "Session not found"
}
```

### Testing

Use the debug endpoint to verify prompt generation:

```bash
curl -X POST http://localhost:8000/api/v1/game/dialogue/next-line/debug \
  -H "Content-Type: application/json" \
  -d '{
    "npc_id": 12,
    "session_id": 456,
    "player_input": "Test input",
    "program_id": "default_dialogue"
  }'
```

This will show you exactly how the context is built and which stages contribute to the final prompt.

---

## Related Documentation

- [NARRATIVE_RUNTIME.md](./RUNTIME.md) - Narrative runtime engine implementation
- [RELATIONSHIPS_AND_ARCS.md](../RELATIONSHIPS_AND_ARCS.md) - Relationship system design
- [ENGINE_USAGE.md](./ENGINE_USAGE.md) - Quick-start guide for developers

---

*Consolidated from NARRATIVE_PROMPT_ENGINE_SPEC.md, NARRATIVE_PROMPT_SCHEMA.md, and NARRATIVE_ENGINE_USAGE.md*
