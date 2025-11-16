# Narrative Engine Usage Guide

## Overview

The PixSim7 Narrative Engine is a data-driven system that generates contextual dialogue prompts for NPCs based on relationship state, world context, and story progression. This guide explains how to call the narrative engine from frontend/agent code.

## API Endpoints

### Generate Next Dialogue Line

**Endpoint:** `POST /api/v1/game/dialogue/next-line`

Generates a prompt for an LLM to create the next dialogue line for an NPC.

#### Request Body

```json
{
  "npc_id": 12,
  "session_id": 456,  // Optional if scene_id provided
  "scene_id": 789,    // Optional if session_id provided
  "node_id": 234,     // Optional, current scene node
  "player_input": "Hello, how are you today?",
  "player_choice_id": "choice_friendly",  // Optional
  "world_id": 1,      // Optional, defaults to session world
  "location_id": 5,   // Optional, current location
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

## Usage Examples

### Basic Dialogue Generation

```typescript
// frontend/src/lib/api/narrative.ts

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

### With Scene Context

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

### Integration with LLM

```typescript
// Example integration with an LLM service

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

## Setting Up World Context

### Relationship Schemas

Configure relationship tiers in `GameWorld.meta`:

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

### Intimacy Schema

Configure intimacy levels in `GameWorld.meta`:

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

### NPC Overrides

Configure world-specific NPC overrides in `GameWorld.meta.npc_overrides`:

```json
{
  "npc_overrides": {
    "12": {
      "nameOverride": "Anete the Brave",
      "personality": {
        "traits": "Courageous, protective, loyal",
        "conversationStyle": "Direct and honest, with occasional humor"
      },
      "tags": ["main_character", "romance_option"]
    }
  }
}
```

## Managing Relationship State

### Update Relationships

Use the session PATCH endpoint to update relationship values:

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

## Custom Prompt Programs

### Creating a Custom Program

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
    // ... more stages
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

## Best Practices

1. **Cache Results**: Store generated prompts for similar contexts to reduce API calls
2. **Update Incrementally**: Make small relationship changes based on player actions
3. **Use Metadata**: Leverage suggested_intents to trigger game mechanics
4. **Debug Mode**: Use the debug endpoint during development to understand prompt generation
5. **Validate Context**: Ensure session and world data are properly initialized

## Error Handling

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

## Testing

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