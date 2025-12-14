# NPC Response System - Quick Start Guide

## Overview

The NPC Response system allows you to create dynamic, interactive NPCs that respond to tool interactions with AI-generated video. It uses your existing scene graph infrastructure with embedded micro-graphs for response logic.

## How It Works

```
Player uses Tool → NPC Response Node → Micro-Graph Evaluates → AI Video Generated
                         ↓
                  (Pleasure Meter,
                   State Machine,
                   Pattern Detection, etc.)
```

## Creating an NPC Response Node

### 1. Add Node to Scene

In your scene editor, add a new **NPC Response** node:

```typescript
// The node is automatically registered, just add it from the node palette
// Icon: 🎭
// Category: Custom
// Name: NPC Response
```

### 2. Configure the NPC

Open the node editor and set:

**Character Settings:**
- Name: "Sakura"
- Avatar URL: (optional)
- Personality: "Gentle" / "Intense" / "Playful" / "Custom"

**Video Generation:**
- Enable AI generation: ✅
- Base Prompt: "anime girl, beautiful detailed face, soft lighting"
- Art Style: Anime / Realistic / Semi-Realistic
- Quality: Draft / Standard / High
- LoRA Models: "detailed_expressions_v2, smooth_animation"

**Interaction:**
- Enabled Tools: "touch, feather, water, temperature"
- Interactive Zones: "face, shoulder, hand, ribs, sides, feet"
- Response Cooldown: 500ms

### 3. Choose a Response Template

Select from pre-built templates:

#### **Simple Pleasure Meter**
- Basic accumulator that tracks pleasure
- Good for: Simple reactions, testing

#### **Tickle Torture Mini-Game**
- Zone-based sensitivity
- Resistance → Giggling → Begging → Broken
- Good for: Tickle games, zonespecific reactions

#### **Arousal Progression System**
- Multi-stage arousal (Neutral → Interested → Aroused → Passionate → Climax)
- Tool preferences and pattern bonuses
- Combo detection
- Good for: Seduction games, complex interactions

### 4. Customize the Graph (Advanced)

Click **"Open Graph Editor"** to customize:

**Available Node Types:**

**Input Nodes:**
- `input.tool` - Current tool ID
- `input.pressure` - Pressure value (0-1)
- `input.speed` - Speed value (0-1)
- `input.pattern` - Touch pattern (circular, zigzag, tap, etc.)
- `input.zone` - Body zone touched
- `input.duration` - Duration of interaction (ms)
- `input.history` - Recent interaction history

**Math & Logic:**
- `math.add`, `math.multiply`, `math.clamp`, `math.remap`
- `logic.compare`, `logic.and`, `logic.or`, `logic.gate`

**State Management:**
- `state.accumulator` - Pleasure meter, tickle meter, etc.
- `state.machine` - State transitions (neutral → aroused → climax)
- `state.memory` - Remember values (tool preferences, zone sensitivity)
- `state.timer` - Track duration, cooldowns
- `state.threshold` - Trigger events at thresholds
- `state.combo` - Detect action sequences

**Response Generation:**
- `response.expression` - Facial expressions
- `response.animation` - Body animations
- `response.emotion` - Emotion states
- `response.intensity` - Intensity values

**Video Generation:**
- `video.prompt` - Build AI prompts with placeholders
- `video.lora` - Select LoRA models based on state
- `video.output` - Final output node

## Example: Custom Tickle Graph

```
┌─────────────┐
│ Zone Input  │ (ribs, feet, armpits)
└──────┬──────┘
       │
       ↓
┌────────────────┐
│ Zone Sensitivity│ (ribs: 0.9, feet: 0.8)
└────────┬───────┘
         │
    ┌────┴────┐
    │ Multiply│ (sensitivity × pressure)
    └────┬────┘
         │
         ↓
┌─────────────────┐
│ Tickle Meter    │ (accumulator with decay)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ State Machine   │ (resisting → giggling → begging → broken)
└────────┬────────┘
         │
    ┌────┴────┐
    │ Prompt  │ "anime girl being tickled, {expression}, {animation}"
    └────┬────┘
         │
         ↓
    ┌────────┐
    │ Output │ → AI Video Generation
    └────────┘
```

## Connecting in Scene Flow

The NPC Response node has ports:

**Inputs:**
- `input` - Flow into interaction (from previous node)
- `tool_event` - Tool interaction events (from tool system)

**Outputs:**
- `output` - Continue after interaction (to next node)
- `video_params` - Video generation parameters (to generation node)

### Example Scene Flow:

```
[Video Node: Intro]
       ↓
[NPC Response Node] ← (Tool events from InteractiveTool component)
       ↓
[Choice Node: Continue / Stop]
```

## Using in Runtime

### From InteractiveTool Component:

```typescript
import { NpcResponseEvaluator } from '@pixsim7/scene-gizmos';

// Create evaluator with node metadata
const evaluator = new NpcResponseEvaluator(npcNodeMetadata);

// On tool interaction
const toolEvent = {
  tool: currentTool,
  pressure: 0.8,
  speed: 0.5,
  pattern: 'circular',
  zone: 'shoulder',
  duration: 2000,
  timestamp: Date.now(),
};

// Evaluate graph
const videoParams = evaluator.evaluate(toolEvent);

// Use video params to generate AI video
if (videoParams) {
  console.log('Prompt:', videoParams.prompt);
  console.log('Expression:', videoParams.expression);
  console.log('Animation:', videoParams.animation);
  console.log('Intensity:', videoParams.intensity);

  // Send to AI video generation API
  generateVideo(videoParams);
}
```

### Connecting to ComfyUI:

```typescript
// Build ComfyUI workflow from video params
function buildComfyWorkflow(params: VideoGenerationOutput) {
  return {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "anime_model.safetensors" }
    },
    "2": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": params.prompt,
        "clip": ["1", 1]
      }
    },
    "3": {
      "class_type": "LoraLoader",
      "inputs": {
        "lora_name": params.loras?.[0] || "default",
        "model": ["1", 0]
      }
    },
    // ... rest of workflow
  };
}
```

## Best Practices

### 1. **Start Simple**
- Use a template first
- Test with debug logging enabled
- Iterate and add complexity

### 2. **Use Accumulators for Meters**
- Pleasure, arousal, ticklishness, etc.
- Set appropriate decay rates
- Clamp min/max values

### 3. **State Machines for Progressions**
- Define clear states
- Set meaningful threshold values
- Test transitions thoroughly

### 4. **Combo Detection for Rewards**
- Define interesting tool sequences
- Give appropriate bonuses
- Keep window timing reasonable (3-5 seconds)

### 5. **Prompt Templates**
- Use placeholders: `{expression}`, `{emotion}`, `{animation}`
- Keep base prompts consistent
- Use LoRAs for state-specific details

### 6. **Performance**
- Set reasonable cooldown times (500-1000ms)
- Limit history size (10-20 interactions)
- Use caching for video generation

## Debugging

Enable debug mode in the node editor:

```typescript
// In node metadata
debug: {
  showGraph: true,          // Show graph during playback
  logEvaluations: true,     // Log node evaluations
  simulatedInput: {         // Test without real tools
    tool: 'feather',
    pressure: 0.7,
    speed: 0.5,
  }
}
```

Check console for evaluation logs:
```
[Node accumulator_1] Type: state.accumulator
  inputs: { input: 0.7, value: 0.7 }
  outputs: { value: 0.85 }
```

## Next Steps

1. **Try the templates** - Load each template and test with different tools
2. **Customize prompts** - Adjust base prompts and expressions
3. **Build custom graphs** - Create your own response logic
4. **Integrate AI video** - Connect to your video generation backend
5. **Create reusable templates** - Share graphs with your team

## Future Enhancements

- Visual graph editor (React Flow integration)
- More node types (weather, time of day, player stats)
- Graph versioning and templates
- Import/export graph JSON
- Community template sharing
- Real-time preview in editor
- Multi-NPC interactions
- Voice generation integration

---

For more details, see `docs/NPC_RESPONSE_GRAPH_DESIGN.md`
