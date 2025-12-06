# Action Block Generation Guide for Claude Sonnet

## Overview

This guide helps Claude Sonnet generate high-quality action blocks for the PixSim7 visual generation system. Action blocks describe 5-8 second video clips that maintain consistency while showing meaningful interactions.

## Core Principles

### 1. Structure Your Prompts in Layers

Even though the JSON stores a single `prompt` string, mentally construct it as:

1. **Setup** (1-2 sentences): Establish position, location, mood
2. **Primary Action** (2-3 sentences): Main movement or interaction
3. **Continuous Elements** (1-2 sentences): What happens throughout
4. **Camera Direction** (1 sentence): How the camera moves
5. **Consistency Note** (1 sentence): What must remain unchanged

### 2. Use Camera Movement Effectively

```json
"cameraMovement": {
  "type": "rotation",    // static, rotation, dolly, tracking, handheld
  "speed": "slow",       // slow, medium, fast
  "path": "circular",    // circular, arc, linear
  "focus": "subjects"    // what to keep centered
}
```

**Best practices:**
- `static`: For intimate moments where movement would distract
- `rotation`: To show multiple angles while maintaining tension
- `dolly`: To increase intimacy by moving closer
- `tracking`: To follow movement or approach
- `handheld`: For energy and naturalistic feel

### 3. Maintain Consistency

```json
"consistency": {
  "maintainPose": true,       // Character stays in same pose
  "preserveLighting": true,   // Lighting doesn't change
  "preserveClothing": true,   // Clothing state consistent
  "preservePosition": false   // Characters can move
}
```

**When to use (and when *not* to):**
- `maintainPose`: Use for some blocks that focus on internal tension or reactions while the body stays mostly put.
- `preservePosition`: For seated/lying scenes where movement is subtle or localized.
- It is **not** a default requirement for all blocks. Many clips should allow both characters to move freely (walking to a wall together, sitting down on a couch, changing posture, etc.). Mix “still pose” blocks with “both move” blocks when building packs.

Think in terms of movement patterns when you design sets of blocks:
- Some blocks: lead mostly static, partner moves around them.
- Some blocks: partner mostly static, lead moves.
- Some blocks: **both** move and reposition during the clip.

### 4. Handle Intensity Progression

```json
"intensityProgression": {
  "start": 5,
  "peak": 8,
  "end": 7,
  "pattern": "building"  // steady, building, pulsing, declining
}
```

**Patterns:**
- `building`: For escalating romantic/passionate moments
- `pulsing`: For playful teasing or back-and-forth
- `declining`: For cooling down after intense moments
- `steady`: For maintaining tension without escalation

## Content Guidelines

### Appropriate Content (✓)

- **Romantic intimacy**: Kissing, embracing, caressing
- **Suggestive tension**: Almost-kisses, meaningful looks, light touches
- **Emotional intensity**: Passionate moments, vulnerability, connection
- **Artistic nudity**: Silhouettes, steam, shadows, implied states
- **Sensual movement**: Dancing, approaching, positioning

### Avoid Explicit Content (✗)

- Explicit sexual acts or genital focus
- Detailed descriptions of arousal states
- Underage characters in any intimate context
- Non-consensual or problematic dynamics
- Graphic violence or harm

### Content Rating Scale

- `general`: All audiences (hand-holding, hugs, casual touch)
- `suggestive`: Teen+ (kissing, flirting, romantic tension)
- `intimate`: Mature (passionate kissing, bedroom scenes, implied intimacy)
- `explicit`: Adult only (detailed sexual content - generally avoid)

## Example Generation Patterns

### Pattern 1: Rotation with Maintained Pose

```json
{
  "id": "bedroom_intense_gaze_rotation",
  "cameraMovement": {"type": "rotation", "speed": "slow"},
  "consistency": {"maintainPose": true},
  "prompt": "{{lead}} stands in original position, body tense with anticipation. Camera begins slow rotation. {{partner}} approaches from behind, close but not touching. {{lead}} maintains position but breathing quickens, visible in chest movement. Camera continues circling. {{partner}}'s hand hovers near {{lead}}'s waist, almost touching. {{lead}} remains in place, eyes closing briefly. Tension builds through proximity without movement. Camera completes rotation. Both maintain positions throughout."
}
```

### Pattern 2: Building Intensity with Movement

```json
{
  "id": "wall_press_escalation",
  "intensityProgression": {"pattern": "building", "start": 4, "peak": 9},
  "prompt": "{{lead}} backs against wall as {{partner}} approaches. Initially just close proximity. {{partner}} places hand on wall beside {{lead}}'s head. Closer still. Other hand on opposite side, boxing them in. {{lead}}'s breathing quickens. {{partner}} leans in, bodies almost touching. Final moment: foreheads touch, breathing synchronized, maximum tension."
}
```

### Pattern 3: Tracking Approach

```json
{
  "id": "hallway_determined_walk",
  "cameraMovement": {"type": "tracking", "speed": "medium"},
  "prompt": "Camera tracks {{lead}} walking with purpose down hallway. Determination in stride. Reaches door, doesn't knock, enters. Camera follows through doorway. {{partner}} turns, surprised. {{lead}} crosses room without hesitation. Camera tracking throughout. Reaches {{partner}}, stops inches away. Both frozen, tension crackling."
}
```

## Prompt Construction Tips

### 1. Physical Details Matter

Instead of: "They get closer"
Write: "{{lead}} shifts weight forward, closing distance to mere inches"

### 2. Show Internal State Through External

Instead of: "Feeling nervous"
Write: "Fingers grip the couch cushion, knuckles whitening"

### 3. Use Environmental Details

Instead of: "In the room"
Write: "Soft lamplight casts intimate shadows across the bedroom"

### 4. Describe Continuous Actions

Use words like:
- "Throughout": "maintains eye contact throughout"
- "Constantly": "fingers constantly moving through hair"
- "Rhythmically": "breathing rhythmically deepens"

### 5. Camera as Character

The camera movement should enhance the emotion:
- Slow rotation = building tension
- Quick cuts (via multiple blocks) = energy
- Static = intimate focus
- Handheld = raw, immediate

## Variety Checklist

When generating multiple blocks, ensure variety in:

- [ ] **Locations**: bedroom, couch, shower, kitchen, car, beach
- [ ] **Poses**: standing, sitting, lying, leaning, walking
- [ ] **Camera types**: All five types represented
- [ ] **Intensity patterns**: Mix of building, steady, pulsing
- [ ] **Moods**: passionate, playful, tender, intense, nervous
- [ ] **Consistency approaches**: Some maintain pose, others allow movement

## Template for New Block

```json
{
  "id": "[location]_[action]_[camera_type]",
  "kind": "single_state",
  "tags": {
    "location": "[specific_place]",
    "pose": "[starting_position]",
    "intimacy_level": "[deep_flirt|intimate|very_intimate]",
    "mood": "[emotional_tone]",
    "content_rating": "[suggestive|intimate]",
    "requires_age_verification": false,
    "intensity": [1-10],
    "branch_type": "[escalate|maintain|cool_down]"
  },
  "referenceImage": {
    "tags": ["[relevant]", "[visual]", "[tags]"],
    "crop": "[full_body|waist_up|portrait]"
  },
  "isImageToVideo": true,
  "startPose": "[taxonomy_pose_id]",
  "endPose": "[taxonomy_pose_id]",
  "cameraMovement": {
    "type": "[movement_type]",
    "speed": "[slow|medium|fast]",
    "path": "[circular|arc|linear]",
    "focus": "[what_to_track]"
  },
  "consistency": {
    "maintainPose": [true/false],
    "preserveLighting": true,
    "preserveClothing": true,
    "preservePosition": [true/false]
  },
  "intensityProgression": {
    "start": [1-10],
    "peak": [1-10],
    "end": [1-10],
    "pattern": "[building|steady|pulsing|declining]"
  },
  "prompt": "[Your 5-part structured prompt as single string]",
  "style": "soft_cinema",
  "durationSec": [5.0-8.0],
  "compatibleNext": ["[next_block_ids]"],
  "compatiblePrev": ["[prev_block_ids]"]
}
```

## Testing Your Blocks

Good blocks should:
1. Work from a single reference image (or 2-7 for transitions)
2. Maintain character identity throughout
3. Show clear progression or sustained tension
4. Use camera movement purposefully
5. Respect the content rating specified
6. Chain logically with compatible blocks
