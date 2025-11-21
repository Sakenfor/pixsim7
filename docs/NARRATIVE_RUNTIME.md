# Narrative Runtime System

The Narrative Runtime is a unified system for creating interactive narrative content including dialogue, choices, action blocks, and scene transitions.

## Quick Start

### 1. Create a Simple Dialogue

```python
from pixsim7.backend.main.domain.narrative import create_simple_dialogue_program

program = create_simple_dialogue_program(
    program_id="greeting",
    npc_id=1,
    dialogue_lines=[
        "Hello there!",
        "It's nice to see you.",
        "How can I help you today?"
    ]
)

# Store in world
world.meta.setdefault("narrative", {}).setdefault("programs", {})[program.id] = program.model_dump(mode="json")
```

### 2. Launch from an Interaction

```python
# In interaction definition
interaction = {
    "id": "greet_npc",
    "label": "Greet",
    "surface": "dialogue",
    "outcome": {
        "narrativeProgramId": "greeting"
    }
}
```

### 3. Execute via API

```http
POST /api/v1/narrative-runtime/start
{
    "sessionId": 123,
    "npcId": 1,
    "programId": "greeting"
}
```

## Core Concepts

### Narrative Programs

A `NarrativeProgram` is a graph of nodes connected by edges. Each node represents a narrative beat (dialogue, choice, action, etc.).

```typescript
interface NarrativeProgram {
    id: string;
    version: string;
    kind: "dialogue" | "scene" | "quest_arc" | "intimacy_scene" | ...;
    nodes: NarrativeNode[];
    edges: NarrativeEdge[];
    entryNodeId: string;
    metadata: {...};
}
```

### Node Types

**1. DialogueNode** - Display text or generate with LLM
```typescript
{
    type: "dialogue",
    mode: "static" | "template" | "llm_program",
    text: "Hello!",  // for static
    template: "Hello {player_name}!",  // for template
    programId: "greeting_program",  // for llm_program
    speaker: "npc" | "player",
    autoAdvance: true
}
```

**2. ChoiceNode** - Player choices
```typescript
{
    type: "choice",
    prompt: "What would you like to do?",
    choices: [
        {
            id: "option1",
            text: "Talk",
            targetNodeId: "talk_node",
            condition: {expression: "affinity >= 50"}
        }
    ]
}
```

**3. ActionBlockNode** - Visual content generation
```typescript
{
    type: "action_block",
    mode: "direct" | "query",
    blockIds: ["block1", "block2"],  // direct mode
    query: {  // query mode
        location: "bedroom",
        intimacy_level: "romantic",
        mood: "tender"
    },
    launchMode: "immediate" | "pending"
}
```

**4. ActionNode** - State effects only
```typescript
{
    type: "action",
    description: "Increase affinity",
    effects: {
        relationship: {affinity: 10}
    }
}
```

**5. BranchNode** - Conditional branching
```typescript
{
    type: "branch",
    branches: [
        {
            id: "high_affinity",
            condition: {expression: "affinity >= 70"},
            targetNodeId: "romantic_path"
        }
    ],
    defaultTargetNodeId: "neutral_path"
}
```

**6. SceneNode** - Scene transitions
```typescript
{
    type: "scene",
    mode: "transition" | "intent",
    sceneId: 123,
    roleBindings: {protagonist: 1, partner: 2}
}
```

**7. WaitNode** - Pause execution
```typescript
{
    type: "wait",
    mode: "duration" | "condition" | "player_input",
    duration: 5000  // ms
}
```

**8. CommentNode** - Documentation (skipped at runtime)
```typescript
{
    type: "comment",
    comment: "This is where the romance begins"
}
```

### State Effects

Effects can be applied `onEnter`, `onExit`, or in `ActionNode`:

```typescript
{
    relationship: {
        affinity: 5,
        trust: 3,
        chemistry: -2
    },
    flags: {
        set: {hasMetNPC: true},
        increment: {questProgress: 1}
    },
    arcs: {
        romance_arc: "stage2"
    },
    inventory: {
        add: [{itemId: "flower", quantity: 1}]
    }
}
```

### Conditions

Conditions use a simple expression syntax:

```
affinity >= 60
trust > 50 && chemistry > 40
flags.hasCompletedQuest == true
affinity BETWEEN 30 AND 70
```

## Common Patterns

### Pattern 1: Linear Dialogue

```python
program = create_simple_dialogue_program(
    program_id="intro_sequence",
    npc_id=npc_id,
    dialogue_lines=[
        "Welcome to our world!",
        "I'm glad you're here.",
        "Let me show you around."
    ]
)
```

### Pattern 2: Dialogue with Choices

```python
program = create_simple_choice_program(
    program_id="first_meeting",
    prompt="How do you want to introduce yourself?",
    choices=[
        {
            "id": "friendly",
            "text": "Hi! Nice to meet you!",
            "outcome": "They smile warmly."
        },
        {
            "id": "formal",
            "text": "Good day. Pleased to make your acquaintance.",
            "outcome": "They nod respectfully."
        }
    ]
)
```

### Pattern 3: Custom Complex Program

```python
from pixsim7.backend.main.domain.narrative import (
    NarrativeProgram,
    DialogueNode,
    ChoiceNode,
    ActionBlockNode,
    BranchNode,
    NarrativeEdge
)

program = NarrativeProgram(
    id="date_sequence",
    version="1.0",
    kind="intimacy_scene",
    name="First Date",
    nodes=[
        # Greeting
        DialogueNode(
            id="greeting",
            type="dialogue",
            mode="static",
            text="You arrive at the cafe. They're already there, smiling."
        ),
        # Check relationship
        BranchNode(
            id="check_affinity",
            type="branch",
            branches=[
                {
                    "id": "high",
                    "condition": {"expression": "affinity >= 60"},
                    "targetNodeId": "intimate_greeting"
                }
            ],
            defaultTargetNodeId="casual_greeting"
        ),
        # High affinity path
        DialogueNode(
            id="intimate_greeting",
            type="dialogue",
            mode="static",
            text="They stand and give you a warm hug."
        ),
        # Regular path
        DialogueNode(
            id="casual_greeting",
            type="dialogue",
            mode="static",
            text="They wave you over to their table."
        ),
        # Choice point
        ChoiceNode(
            id="activity_choice",
            type="choice",
            prompt="What would you like to do?",
            choices=[
                {
                    "id": "talk",
                    "text": "Just talk and enjoy their company",
                    "targetNodeId": "conversation"
                },
                {
                    "id": "romantic",
                    "text": "Suggest something more romantic",
                    "targetNodeId": "romantic_scene",
                    "condition": {"expression": "affinity >= 70"}
                }
            ]
        ),
        # Conversation path
        DialogueNode(
            id="conversation",
            type="dialogue",
            mode="llm_program",
            program_id="casual_date_conversation"
        ),
        # Romantic path
        ActionBlockNode(
            id="romantic_scene",
            type="action_block",
            mode="query",
            query={
                "location": "cafe",
                "intimacy_level": "romantic",
                "mood": "tender"
            },
            launchMode="immediate"
        )
    ],
    edges=[
        NarrativeEdge(id="e1", from_="greeting", to="check_affinity"),
        NarrativeEdge(id="e2", from_="intimate_greeting", to="activity_choice"),
        NarrativeEdge(id="e3", from_="casual_greeting", to="activity_choice"),
        # Choices handle their own routing
    ],
    entry_node_id="greeting",
    metadata={
        "contentRating": "romantic",
        "estimatedDuration": 300
    }
)
```

### Pattern 4: Intimacy Scene Export

```typescript
// Frontend - Intimacy Composer
import { intimacySceneToNarrativeProgram } from '@pixsim7/narrative';

const scene = {
    id: "bedroom_scene",
    name: "Intimate Evening",
    arcStructure: [
        {id: "intro", name: "Introduction", contentRating: "sfw"},
        {id: "buildup", name: "Build-up", contentRating: "romantic"},
        {id: "climax", name: "Climax", contentRating: "mature_implied"}
    ]
};

const program = intimacySceneToNarrativeProgram(scene);
// Export to backend via API
```

## Runtime Execution

### Starting a Program

```python
from pixsim7.backend.main.services.narrative import NarrativeRuntimeEngine

runtime = NarrativeRuntimeEngine(db)

result = await runtime.start(
    session=session,
    world=world,
    npc_id=npc_id,
    program_id="my_program",
    initial_variables={"player_name": "Alex"}
)

# result.display contains what to show
# result.choices contains available choices (if any)
# result.finished indicates if program is done
```

### Stepping Through

```python
# After player makes a choice
result = await runtime.step(
    session=session,
    world=world,
    npc_id=npc_id,
    player_input={"choiceId": "option1"}
)
```

### REST API

**Start Program:**
```http
POST /api/v1/narrative-runtime/start
{
    "sessionId": 123,
    "npcId": 1,
    "programId": "greeting",
    "initialVariables": {"player_name": "Alex"}
}
```

**Step Program:**
```http
POST /api/v1/narrative-runtime/step
{
    "sessionId": 123,
    "npcId": 1,
    "playerInput": {"choiceId": "option1"}
}
```

**Get State:**
```http
POST /api/v1/narrative-runtime/state
{
    "sessionId": 123,
    "npcId": 1
}
```

## Helper Functions

### Python

```python
# Simple dialogue
create_simple_dialogue_program(program_id, npc_id, dialogue_lines)

# Choice-based
create_simple_choice_program(program_id, prompt, choices)

# Behavior-driven
create_behavior_dialogue_program(behavior_id, npc_id, dialogue_prompt_id)

# Intimacy scene
intimacy_scene_to_narrative_program(scene_config)
export_intimacy_scene_as_program(scene_config, world)

# Launch from interaction
launch_narrative_program_from_interaction(session, world, npc_id, program_id, db)
```

### TypeScript

```typescript
// ECS helpers
import {
    getNarrativeState,
    setNarrativeState,
    startProgram,
    finishProgram,
    advanceToNode,
    isProgramActive,
    getProgramVariable
} from '@pixsim7/game-core/narrative';

const state = getNarrativeState(session, npcId);
if (!state.activeProgramId) {
    startProgram(session, npcId, programId, entryNodeId);
}
```

## Storage

Programs are stored in:
```
world.meta.narrative.programs[programId] = {... NarrativeProgram ...}
```

Runtime state is stored in:
```
session.flags.npcs["npc:<id>"].components.narrative = {... NarrativeRuntimeState ...}
```

## Best Practices

1. **Use Helper Functions**: Start with `create_simple_*` helpers for common patterns
2. **Meaningful IDs**: Use descriptive program and node IDs (`first_date_intro`, not `node1`)
3. **Document with Comments**: Use `CommentNode` for complex programs
4. **Test Conditions**: Always provide `defaultTargetNodeId` in branches
5. **Content Ratings**: Set appropriate `metadata.contentRating`
6. **Estimated Duration**: Include `metadata.estimatedDuration` for planning
7. **Auto-Advance**: Use `autoAdvance: true` for linear sequences
8. **State Effects**: Prefer `onExit` effects (applied when leaving a node)

## Debugging

### Check Active Program

```python
from pixsim7.backend.main.domain.narrative import get_narrative_state

state = get_narrative_state(session, npc_id)
print(f"Active: {state.active_program_id} / {state.active_node_id}")
print(f"Stack depth: {len(state.stack)}")
print(f"History: {len(state.history)} nodes visited")
```

### Validation

```python
errors = program.validate_structure()
if errors:
    print("Program has errors:", errors)
```

### Runtime Logs

```python
result = await runtime.step(...)
print(f"Finished: {result.finished}")
print(f"Display type: {result.display.type if result.display else 'None'}")
print(f"Choices: {len(result.choices) if result.choices else 0}")
```

## Examples

See: `examples/narrative_programs/` for complete examples

## API Reference

- **Runtime Engine**: `pixsim7/backend/main/services/narrative/runtime.py`
- **Schema**: `packages/types/src/narrative.ts`
- **Helpers**: `pixsim7/backend/main/domain/narrative/integration_helpers.py`
- **ECS**: `pixsim7/backend/main/domain/narrative/ecs_helpers.py`
