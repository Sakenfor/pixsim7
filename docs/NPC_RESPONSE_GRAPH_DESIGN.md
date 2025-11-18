# NPC Response Graph System Design

## Overview

A node-based visual programming system for defining complex NPC responses to tool interactions, with direct integration to AI video generation.

## Architecture

```
Tool Input → Response Graph → Video Generation Parameters → AI Video Model
     ↓            ↓                    ↓                          ↓
  [Touch]    [State Machine]    [Expression: "pleasure"]    [Generated Video]
  [Feather]  [Math/Logic]       [Intensity: 0.8]           [NPC Reaction]
  [Pattern]  [Memory/History]   [Prompt: "blushing..."]    [Smooth playback]
```

## Node Types

### 1. Input Nodes
- **Tool Input** - Current tool being used
- **Pressure Input** - Pressure value (0-1)
- **Pattern Input** - Detected touch pattern
- **Zone Input** - Body zone being touched
- **History Input** - Recent interaction history
- **Time Input** - Duration of current interaction
- **Preference Input** - NPC preference data

### 2. Logic Nodes
- **Compare** - Compare values (>, <, ==, range)
- **Math** - Add, multiply, clamp, smooth
- **Gate** - Enable/disable flow based on condition
- **Switch** - Route based on value
- **Accumulator** - Track cumulative values (pleasure meter)
- **Timer** - Track duration, cooldowns
- **Threshold** - Trigger when value crosses threshold
- **Randomizer** - Add controlled randomness

### 3. State Nodes
- **State Machine** - Define states (neutral, aroused, ticklish, satisfied)
- **State Transition** - Rules for moving between states
- **Memory** - Remember previous interactions
- **Mood Tracker** - Long-term mood/arousal state
- **Combo Detector** - Detect sequence of actions

### 4. Response Nodes
- **Expression** - Facial expression output
- **Animation** - Body animation/pose
- **Vocalization** - Sound/voice type
- **Particle Effect** - Visual effects (hearts, sparkles)
- **Camera Angle** - Suggest camera position
- **Intensity Multiplier** - Modify response intensity

### 5. Video Generation Nodes
- **Prompt Builder** - Construct AI video prompt
- **Style Parameters** - Art style, quality, seed
- **Frame Generator** - Generate specific frames
- **Transition** - Smooth transitions between states
- **LoRA Selector** - Select trained model adapters
- **Negative Prompt** - Things to avoid

### 6. Utility Nodes
- **Merge** - Combine multiple inputs
- **Split** - Split data to multiple outputs
- **Delay** - Add delay before output
- **Remap** - Map input range to output range
- **Ease** - Apply easing functions
- **Debug** - Output values for testing

## Example Graphs

### Example 1: Simple Tickle Response

```
[Tool Input: Feather] → [Zone Input: Ribs] → [State: Ticklish]
                                    ↓
                              [Expression: Giggle]
                              [Animation: Squirm]
                              [Intensity: 0.8]
                                    ↓
                          [Prompt Builder: "anime girl giggling uncontrollably,
                           squirming, blushing, hands trying to protect sides"]
                                    ↓
                            [Video Generation]
```

### Example 2: Complex Arousal System

```
[Tool Input] → [Preference Check] → [Intensity Calculator]
                                           ↓
[Pattern Input] → [Combo Detector] -------+
                                           ↓
[Duration Timer] → [Accumulator (Pleasure Meter)] → [Threshold]
                                                         ↓
                                            [State Machine: Neutral → Interested → Aroused → Climax]
                                                         ↓
                                            [Expression + Animation + Vocalization]
                                                         ↓
                                            [Prompt Builder with Context]
                                                         ↓
                                            [Video Generation with Style]
```

### Example 3: Contextual Response with Memory

```
[Tool: Hand] → [Zone: Thigh] → [Memory: "Was touched here before"]
                                          ↓
                              [If First Time: Surprised]
                              [If Repeated: Anticipatory]
                                          ↓
                          [Relationship Level Check] → [Gate]
                                          ↓
                    [If High Relationship: Positive Response]
                    [If Low Relationship: Negative Response]
                                          ↓
                          [Prompt with Relationship Context]
```

## Video Generation Integration

### Prompt Building Strategy

Each node contributes to a structured prompt:

```typescript
{
  subject: "anime girl, long brown hair, blue eyes",
  expression: "blushing, shy smile, eyes half-closed",
  action: "being gently touched on shoulder",
  emotion: "pleasure, anticipation, slight embarrassment",
  environment: "soft bedroom lighting, intimate setting",
  style: "high quality anime, detailed, smooth animation",
  technical: "4k, 60fps, smooth motion",
  lora: ["gentle_expressions_v1", "realistic_reactions"],
  negativePrompt: "stiff, robotic, unnatural",
  seed: 12345,
  steps: 30,
  cfg: 7.5
}
```

### Frame-by-Frame Generation

For smooth animations:
1. Graph evaluates every frame (or at key moments)
2. Detects significant state changes
3. Generates transition frames
4. Interpolates between keyframes
5. Maintains temporal coherence

## Graph Evaluation Engine

### Execution Flow

1. **Input Phase** - Gather current tool state
2. **Propagation** - Flow data through graph
3. **State Update** - Update internal state nodes
4. **Output Generation** - Produce video parameters
5. **Video Queue** - Submit to AI generation
6. **Playback** - Display generated video

### Performance Considerations

- **Lazy Evaluation** - Only evaluate changed nodes
- **Caching** - Cache unchanged subgraph results
- **Async Video Gen** - Generate in background
- **Predictive Generation** - Pre-generate likely next states
- **Frame Interpolation** - Smooth out gaps

## Graph Editor UI

### Features

- **Visual Node Editor** - Drag-and-drop interface
- **Real-time Preview** - See results while editing
- **Node Library** - Categorized node palette
- **Templates** - Pre-made common patterns
- **Subgraphs** - Reusable components
- **Version Control** - Save/load graphs
- **Testing Mode** - Simulate tool inputs

### Example UI Layout

```
┌─────────────┬────────────────────────────┬──────────────┐
│   Node      │      Graph Canvas          │   Preview    │
│  Palette    │                            │              │
│             │    [Node] → [Node]         │  [NPC Face]  │
│ Input       │       ↓                    │              │
│ Logic       │    [Node] → [Node]         │  Expression: │
│ State       │       ↓        ↓           │   Pleasure   │
│ Response    │    [Output]  [Video]       │              │
│ Video       │                            │  Intensity:  │
│ Utility     │                            │   ●●●●○      │
│             │                            │              │
│ [Templates] │   [Controls: Play/Reset]   │ [Video Out]  │
└─────────────┴────────────────────────────┴──────────────┘
```

## Advanced Features

### 1. Personality Profiles
- Load different graphs per NPC
- Blend between graphs based on mood
- Override specific nodes per character

### 2. Learning System
- Track which responses player prefers
- Adjust weights based on player behavior
- Evolve NPC responses over time

### 3. Multi-Tool Interactions
- Handle multiple simultaneous tools
- Complex combinations (temperature + touch)
- Synergy effects

### 4. Dynamic Difficulty
- Adjust sensitivity based on player skill
- Make NPCs more/less reactive
- Challenge mode with specific goals

### 5. Narrative Integration
- Graph nodes check story flags
- Different responses in different story contexts
- Unlock new response patterns through story

## Implementation Phases

### Phase 1: Core Engine
- Node type system
- Graph data structure
- Basic evaluation engine
- Simple nodes (input, math, compare)

### Phase 2: State Management
- State machine nodes
- Memory/history
- Accumulators and timers

### Phase 3: Video Integration
- Prompt builder nodes
- AI video API integration
- Frame queue system

### Phase 4: Editor
- Visual graph editor
- Node palette
- Live preview

### Phase 5: Advanced Features
- Templates and presets
- Learning system
- Performance optimizations

## Technical Stack

- **Graph Engine**: TypeScript with reactive evaluation
- **Data Structure**: Adjacency list with topological sort
- **Editor**: React Flow or Rete.js
- **State Management**: Zustand or similar
- **Video Gen**: ComfyUI API, Stable Video Diffusion, or AnimateDiff
- **Serialization**: JSON graph format

## Example Use Cases

### 1. Tickle Torture Mini-Game
- Graph tracks ticklishness meter
- Different zones have different sensitivity
- NPC tries to resist → laughing → begging
- Video shows realistic tickle reactions

### 2. Massage Sequence
- Calm → Relaxed → Sleepy progression
- Pressure and speed affect transition
- Wrong moves decrease satisfaction
- Video shows gradual relaxation

### 3. Seduction Game
- Complex arousal system with multiple factors
- Relationship level gates certain actions
- Pattern combinations unlock special responses
- Video shows escalating intimacy

### 4. Rhythm Game Integration
- Tool usage synced to music
- Perfect timing increases response
- Combo system with visual feedback
- Generated video matches beat

## Benefits

1. **Flexibility** - Non-programmers can create complex behaviors
2. **Iteration Speed** - Quick tweaking without code changes
3. **Visual Debugging** - See data flow in real-time
4. **Modularity** - Reuse subgraphs across NPCs
5. **AI Integration** - Direct pipeline to video generation
6. **Personalization** - Each NPC can have unique graphs
7. **Content Creation** - Community can share graphs

## Future Extensions

- **Multi-NPC Interactions** - Graphs that handle multiple characters
- **Procedural Animation** - Blend AI video with procedural poses
- **Voice Generation** - TTS integrated into graph
- **Physics Integration** - Soft body physics affect responses
- **VR Support** - Haptic feedback integration
- **Modding Support** - Easy to extend with custom nodes
