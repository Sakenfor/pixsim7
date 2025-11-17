# Action Engine Usage Guide

## Overview

The PixSim7 Action Engine generates visual prompts for short 5-8 second video clips, primarily using image-to-video generation. It works alongside the Narrative Engine to create visual content that matches the emotional and relational context of scenes.

### Architecture Layering

The system maintains clean separation of concerns:

1. **API Layer** (`game_dialogue.py`):
   - Handles authentication and session/world context
   - Gathers data from database (intimacy levels, relationships)
   - Maps narrative intents to branch intents

2. **Pure Selector** (`action_blocks/engine.py`):
   - Works with distilled `ActionSelectionContext`
   - No database dependencies
   - Completely testable in isolation
   - Returns selected blocks and scoring

3. **Asset Resolution** (optional DB layer):
   - Resolves template references to actual assets
   - Only runs if database session provided
   - Keeps selector pure even when assets aren't resolved

## Key Concepts

### Action Blocks

Action blocks are the fundamental units of visual action. Each block describes:
- A specific visual action or movement
- Reference images to use as anchors
- Prompts for video generation
- Compatibility with other blocks for chaining

Two types of blocks:
1. **Single State**: Motion from one reference image
2. **Transition**: Morphing between 2-7 reference images

### Pose Taxonomy

The engine uses a standardized pose vocabulary that maps detector labels to editor-friendly pose names. This ensures consistency across different detection systems.

### Branch Intents

Actions serve different narrative purposes through a unified intent system:

**Action Branch Intents:**
- `escalate`: Increase intimacy/intensity
- `cool_down`: Reduce tension
- `side_branch`: Divergent event (interruption)
- `maintain`: Keep current level
- `resolve`: Resolve tension/conflict

**Narrative Intent Mapping:**

The system automatically maps narrative intents to action branch intents:

```python
# Narrative Intent → Branch Intent
"increase_intimacy" → "escalate"
"romantic_confession" → "escalate"
"reduce_tension" → "cool_down"
"change_topic" → "cool_down"
"build_trust" → "resolve"
"tease" → "side_branch"
"maintain_status" → "maintain"
```

See `intent_mapping.py` for the complete mapping.

## API Endpoints

### Select Action Blocks

**Endpoint:** `POST /api/v1/game/dialogue/actions/select`

Selects appropriate action blocks based on context.

#### Request

```json
{
  "location_tag": "bench_park",
  "pose": "sitting_close",
  "intimacy_level": "deep_flirt",
  "mood": "playful",
  "branch_intent": "escalate",
  "previous_block_id": "bench_hair_tuck",
  "lead_npc_id": 12,
  "partner_npc_id": 15,
  "required_tags": ["evening"],
  "exclude_tags": ["explicit"],
  "max_duration": 15.0,
  "session_id": 456,
  "world_id": 1
}
```

### Auto-Select with Generation Fallback

**Endpoint:** `POST /api/v1/game/dialogue/actions/next`

This endpoint first attempts the normal library selection flow, then (if no strong matches or if `prefer_generation` is set) falls back to `/actions/generate` using the provided parameters.

#### Request

```json
{
  "selection": {
    "location_tag": "bench_park",
    "pose": "sitting_close",
    "lead_npc_id": 12,
    "session_id": 456,
    "world_id": 1
  },
  "generation": {
    "concept_type": "dynamic_interaction",
    "parameters": {
      "lead": "Anne",
      "partner": "Player",
      "location": "bench",
      "branch_type": "escalate"
    },
    "previous_segment": {
      "block_id": "bench_idle_loop",
      "asset_id": 9876,
      "pose": "sitting_close",
      "intensity": 5,
      "tags": ["bench_park", "evening"],
      "mood": "romantic"
    }
  },
  "compatibility_threshold": 0.8
}
```

#### Response

```json
{
  "mode": "generation",
  "selection": {
    "compatibility_score": 0.62,
    "...": "library attempt details"
  },
  "generated_block": {
    "id": "gen_dynamic_interaction_ab12cd",
    "prompt": "...",
    "tags": { "content_rating": "intimate" },
    "cameraMovement": { "type": "rotation", "speed": "slow" }
  },
  "generation_info": {
    "generation_time": 0.08,
    "template_used": "dynamic_interaction"
  }
}
```

If the library result meets the threshold, the response returns `mode: "library"` with the usual `ActionSelectionResponse`. This is the hook the 2D client can use to “loop current clip while we pre-generate the next one”: keep playing the loop clip, call `/actions/next` with a `previous_segment` snapshot, and then cut to the generated block once it returns.

#### Response

```json
{
  "blocks": [
    {
      "id": "bench_almost_kiss",
      "kind": "single_state",
      "tags": {
        "location": "bench_park",
        "intimacy_level": "very_intimate",
        "mood": "passionate"
      },
      "durationSec": 8.0
    }
  ],
  "total_duration": 8.0,
  "resolved_images": [
    {
      "assetId": 345,
      "url": "https://...",
      "crop": "portrait"
    }
  ],
  "compatibility_score": 0.95,
  "fallback_reason": null,
  "prompts": [
    "Close intimate shot of NPC_12 and NPC_15 on the bench..."
  ],
  "segments": [
    {
      "id": "bench_almost_kiss_0",
      "durationSec": 8.0,
      "tags": ["milestone", "romantic"]
    }
  ]
}
```

### List Action Blocks

**Endpoint:** `GET /api/v1/game/dialogue/actions/blocks`

Lists available action blocks with optional filtering.

#### Query Parameters
- `location`: Filter by location tag
- `intimacy_level`: Filter by intimacy level
- `mood`: Filter by mood

#### Response

```json
{
  "blocks": [
    {
      "id": "bench_hair_tuck",
      "kind": "single_state",
      "tags": {
        "location": "bench_park",
        "intimacy_level": "intimate"
      },
      "duration": 7.0,
      "description": "Tender hair tuck gesture"
    }
  ],
  "total": 1,
  "filters": {
    "location": "bench_park",
    "intimacy_level": "intimate",
    "mood": null
  }
}
```

### Get Pose Taxonomy

**Endpoint:** `GET /api/v1/game/dialogue/actions/poses`

Returns the pose taxonomy used by the engine.

#### Query Parameters
- `category`: Filter by pose category

#### Response

```json
{
  "poses": [
    {
      "id": "sitting_close",
      "label": "Sitting Close Together",
      "category": "sitting",
      "intimacy_min": 3,
      "detector_labels": ["sitting_close", "seated_together"],
      "tags": ["seated", "proximity", "intimate"]
    }
  ],
  "categories": ["standing", "sitting", "lying", "leaning", "movement", "transition", "intimate"],
  "total": 25
}
```

## Duration Handling

The action engine treats `max_duration` as a strict budget for chaining:

- **Budget enforcement**: Total duration never exceeds `max_duration`
- **Graceful degradation**: If the best single block exceeds budget, it's still returned (with a warning)
- **Chain building**: Additional blocks are only added if they fit within remaining budget
- **Minimum viability**: Chain building stops if remaining budget < 3.0 seconds

Example:
```json
{
  "max_duration": 15.0,
  // Result might be:
  // - Block 1: 6.0s (selected)
  // - Block 2: 7.0s (selected, total 13.0s)
  // - Block 3: 8.0s (skipped - would exceed 15.0s)
}
```

## Creating Action Blocks

### Single State Block Example

```json
{
  "id": "couch_cuddle_closer",
  "kind": "single_state",
  "tags": {
    "location": "living_room",
    "pose": "sitting_leaning",
    "intimacy_level": "intimate",
    "mood": "comfortable",
    "branch_type": "maintain",
    "intensity": 6
  },
  "referenceImage": {
    "npcId": 12,
    "tags": ["sitting", "couch", "relaxed"],
    "crop": "waist_up"
  },
  "isImageToVideo": true,
  "startPose": "sitting_close",
  "endPose": "sitting_leaning",
  "prompt": "{{lead}} shifts position to cuddle closer to {{partner}} on the couch. Natural, comfortable movement showing increasing intimacy. Soft home lighting.",
  "style": "soft_cinema",
  "durationSec": 6.0,
  "compatibleNext": ["couch_kiss", "couch_fall_asleep"],
  "compatiblePrev": ["couch_sit_together"]
}
```

### Continuation Snapshots for Generation

Dynamic generation now accepts a `previous_segment` payload. Provide either an `asset_id` (preferred) or a temporary `asset_url` pointing to the last frame/keyframe, plus pose/intensity tags:

```json
"previous_segment": {
  "block_id": "couch_idle_loop",
  "asset_id": 44321,
  "pose": "sitting_close",
  "intensity": 4,
  "tags": ["living_room", "evening"],
  "mood": "tender",
  "summary": "Continue from a soft cuddle loop on the couch."
}
```

The generator uses this snapshot to:
- Reuse the still as the `referenceImage`
- Default `startPose`/`tags.pose` to the snapshot pose
- Append “Continuation Notes” to the prompt so Claude understands it must keep composition/lighting consistent.

### Transition Block Example

```json
{
  "id": "stand_to_embrace",
  "kind": "transition",
  "tags": {
    "location": "any",
    "intimacy_level": "intimate",
    "mood": "passionate",
    "branch_type": "escalate"
  },
  "from": {
    "referenceImage": {
      "tags": ["standing_facing"],
      "crop": "full_body"
    },
    "pose": "standing_facing"
  },
  "to": {
    "referenceImage": {
      "tags": ["embracing"],
      "crop": "full_body"
    },
    "pose": "standing_embrace"
  },
  "prompt": "Smooth transition as {{lead}} and {{partner}} move from standing facing each other into a passionate embrace. The movement is fluid and emotionally charged.",
  "durationSec": 7.0,
  "compatibleNext": ["embrace_kiss", "embrace_hold"],
  "compatiblePrev": ["approach_close"]
}
```

## Integration with Scenes

### Using Action Blocks in Scene Nodes

```typescript
// After getting blocks from the action engine
const actionResult = await selectActionBlocks(context);

// Create scene node with the generated segments
const sceneNode: SceneNode = {
  id: 'generated-action-1',
  type: 'video',
  media: actionResult.segments.map(seg => ({
    id: seg.id,
    url: '', // Will be filled after video generation
    durationSec: seg.durationSec,
    tags: seg.tags
  })),
  playback: {
    kind: 'progression',
    segments: actionResult.segments.map((seg, i) => ({
      label: `Action ${i + 1}`,
      segmentIds: [seg.id]
    }))
  }
};
```

### Combining with Narrative

```typescript
async function generateIntimateScene(
  npcId: number,
  sessionId: number,
  location: string
) {
  // 1. Get dialogue from narrative engine
  const dialogue = await generateDialogue(npcId, sessionId, "I've been wanting to tell you something...");

  // 2. Get visual actions from action engine
  const actions = await selectActionBlocks({
    location_tag: location,
    intimacy_level: dialogue.meta.intimacy_level,
    mood: "romantic",
    branch_intent: "escalate",
    lead_npc_id: npcId,
    session_id: sessionId
  });

  // 3. Generate videos from prompts
  for (const prompt of actions.prompts) {
    await generateVideo(prompt); // Your video generation service
  }

  // 4. Create complete scene
  return createScene({
    dialogue: dialogue.llm_prompt,
    visuals: actions.segments,
    effects: dialogue.meta.suggested_intents
  });
}
```

## Best Practices

### 1. Asset Resolution

Always provide either:
- Specific `assetId` for world-specific blocks
- `npcId` + `tags` for template blocks that can find matching assets
- `url` for prototyping with external images

### 2. Compatibility Chaining

Define `compatibleNext` and `compatiblePrev` arrays to ensure smooth transitions:

```json
{
  "id": "action_a",
  "endPose": "sitting_close",
  "compatibleNext": ["action_b", "action_c"]
}
```

### 3. Intimacy Alignment

Use the same intimacy levels as the narrative engine:
- `light_flirt`: Early attraction
- `deep_flirt`: Clear interest
- `intimate`: Romantic connection
- `very_intimate`: Deep relationship

### 4. Branch Intent Usage

Match branch intents to narrative flow:

```typescript
// After a romantic confession
if (narrativeResult.suggested_intents.includes("increase_intimacy")) {
  actionContext.branch_intent = "escalate";
}
```

### 5. Pose Consistency

Use the pose taxonomy for consistency:

```typescript
const poses = await getPoseTaxonomy();
const compatiblePoses = poses.filter(p => p.intimacy_min <= currentIntimacy);
```

## Adding Custom Action Blocks

### 1. Create JSON File

Add to `pixsim7_backend/domain/narrative/action_blocks/library/`:

```json
[
  {
    "id": "custom_action_1",
    "kind": "single_state",
    // ... your block definition
  }
]
```

### 2. World Override System

The `worldOverride` field creates world-specific variants:

```json
{
  "id": "bench_kiss",
  "worldOverride": "romantic_world_1",  // World ID as string
  "referenceImage": {
    "assetId": 12345  // Specific asset for this world
  }
  // Rest inherits from global template
}
```

**How it works:**
- Blocks without `worldOverride` are global templates (portable)
- Blocks with `worldOverride` only match when world context matches
- World-specific blocks take precedence over global ones
- The field is part of the core schema in `BaseActionBlock`

### 3. Test with API

```bash
# List your new blocks
curl http://localhost:8000/api/v1/game/dialogue/actions/blocks

# Test selection
curl -X POST http://localhost:8000/api/v1/game/dialogue/actions/select \
  -H "Content-Type: application/json" \
  -d '{
    "location_tag": "bench_park",
    "lead_npc_id": 12
  }'
```

## Troubleshooting

### No Blocks Found

Check:
- Location tag matches exactly
- Intimacy level is appropriate
- Required tags are present in blocks
- Exclude tags aren't blocking valid blocks

### Low Compatibility Score

The engine uses fallback matching:
- 1.0: Perfect match
- 0.8-0.99: Good match with minor relaxation
- 0.5-0.79: Acceptable match with significant relaxation
- < 0.5: Poor match, consider different criteria

### Asset Resolution Failures

Ensure:
- Assets exist with matching NPC ID
- Tags correspond to detector labels
- NpcExpression entries exist for portraits
- Asset IDs are valid in the database

## Performance Considerations

- **Library Loading**: Action blocks are loaded once at startup
- **Asset Resolution**: Database queries are minimized by caching
- **Template Rendering**: Shared with narrative engine for consistency
- **Scoring**: Fast in-memory operations, O(n) where n = number of blocks

## Future Enhancements

Planned improvements:
- ML-based action selection using embeddings
- Dynamic prompt refinement based on generation results
- Multi-character action blocks (3+ participants)
- Physics-aware transitions
- Emotion-driven micro-expressions
