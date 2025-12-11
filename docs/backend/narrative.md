# Narrative Domain

The Narrative domain handles story execution, dialogue systems, narrative programs, and action blocks for creating interactive story experiences.

## Entry Module

```python
from pixsim7.backend.narrative import (
    # Program Structure
    NarrativeProgram, NarrativeNode, NarrativeEdge,
    NarrativeRuntimeState, NarrativeStepResult,
    # Node Types
    DialogueNode, ChoiceNode, ActionNode, ActionBlockNode,
    SceneNode, BranchNode, WaitNode, ExternalCallNode,
    # Runtime Engine
    NarrativeRuntimeEngine,
    # ECS Helpers
    get_narrative_state, start_program, finish_program,
    # Integration
    launch_narrative_program_from_interaction,
    create_simple_dialogue_program,
)
```

## Architecture

```
pixsim7/backend/main/
├── domain/narrative/          # Domain models and logic
│   ├── schema.py              # Program/node definitions
│   ├── ecs_helpers.py         # Narrative state ECS integration
│   ├── action_block_resolver.py  # Action block resolution
│   ├── integration_helpers.py # Helper functions for launching
│   ├── engine.py              # Legacy narrative engine
│   └── action_blocks/         # Action block definitions
├── services/narrative/        # Runtime execution
│   └── runtime.py             # NarrativeRuntimeEngine
└── routes/action_blocks/      # Action block API
```

## Key Concepts

### Narrative Programs

Narrative programs are graph-based structures that define story flows, dialogue, and interactive choices.

```python
from pixsim7.backend.narrative import NarrativeProgram

program = NarrativeProgram(
    name="Meeting Alice",
    nodes=[...],       # List of nodes
    edges=[...],       # Connections between nodes
    entry_node_id="start",
)
```

### Node Types

#### DialogueNode

Displays text/dialogue to the player.

```python
from pixsim7.backend.narrative import DialogueNode

node = DialogueNode(
    id="greeting",
    speaker="Alice",
    text="Hello! How are you today?",
    # Optional: emotion, animation, voice_id
)
```

#### ChoiceNode

Presents choices to the player.

```python
from pixsim7.backend.narrative import ChoiceNode

node = ChoiceNode(
    id="choice_1",
    prompt="What do you say?",
    choices=[
        {"id": "friendly", "text": "Great to see you!"},
        {"id": "neutral", "text": "Hi."},
    ]
)
```

#### ActionNode

Executes a backend action (modify stats, flags, inventory).

```python
from pixsim7.backend.narrative import ActionNode

node = ActionNode(
    id="gain_affection",
    action_type="modify_stat",
    params={
        "stat": "affection",
        "delta": +10,
    }
)
```

#### ActionBlockNode

Executes a reusable action block (generation, scene transition, etc.).

```python
from pixsim7.backend.narrative import ActionBlockNode

node = ActionBlockNode(
    id="generate_kiss_scene",
    action_block_id=123,  # References ActionBlock in DB
    params={"intensity": "passionate"}
)
```

#### BranchNode

Conditional branching based on game state.

```python
from pixsim7.backend.narrative import BranchNode

node = BranchNode(
    id="check_relationship",
    condition={
        "type": "stat_above",
        "stat": "affection",
        "threshold": 50
    }
)
```

#### SceneNode

Transitions to a different game scene.

```python
from pixsim7.backend.narrative import SceneNode

node = SceneNode(
    id="go_to_park",
    scene_id=456,
    location_id=789,
)
```

### Narrative Edges

Edges define transitions between nodes.

```python
from pixsim7.backend.narrative import NarrativeEdge

# Simple edge
edge = NarrativeEdge(
    from_node_id="greeting",
    to_node_id="choice_1"
)

# Conditional edge (from choice)
edge = NarrativeEdge(
    from_node_id="choice_1",
    to_node_id="friendly_response",
    condition={"choice": "friendly"}
)

# Conditional edge (from branch)
edge = NarrativeEdge(
    from_node_id="check_relationship",
    to_node_id="romance_path",
    condition={"branch": "true"}
)
```

## Runtime Execution

### NarrativeRuntimeEngine

The runtime engine executes narrative programs step-by-step.

```python
from pixsim7.backend.narrative import NarrativeRuntimeEngine

engine = NarrativeRuntimeEngine(db)

# Start a program
result = await engine.start_program(
    session_id=session.id,
    npc_id=npc.id,
    program=program,
    initial_variables={"player_name": "Alex"}
)

# Step forward (player chose an option)
result = await engine.step_program(
    session_id=session.id,
    npc_id=npc.id,
    choice_id="friendly"  # If current node is ChoiceNode
)

# Check result
if result.finished:
    print("Program completed!")
elif result.current_node:
    print(f"Current node: {result.current_node.id}")
```

### Narrative State (ECS)

Narrative state is stored in the NPC's ECS entity data.

```python
from pixsim7.backend.narrative import (
    get_narrative_state,
    start_program,
    finish_program,
    is_program_active
)

# Check if NPC has active program
if is_program_active(npc):
    state = get_narrative_state(npc)
    print(f"Current program: {state.program_id}")
    print(f"Current node: {state.current_node_id}")
    print(f"Variables: {state.variables}")

# Start program manually (usually via engine)
start_program(npc, program, entry_node_id="start")

# Finish program
finish_program(npc)
```

### Program Variables

Programs can store and use variables during execution.

```python
from pixsim7.backend.narrative import (
    get_program_variable,
    set_program_variable
)

# Get variable
player_name = get_program_variable(npc, "player_name")

# Set variable
set_program_variable(npc, "met_before", True)
set_program_variable(npc, "conversation_count", 5)

# Variables can be used in dialogue text:
# "Hello {{player_name}}! This is our {{conversation_count}}th meeting!"
```

## Action Blocks

Action blocks are reusable narrative actions (generation, effects, etc.).

### Resolving Action Blocks

```python
from pixsim7.backend.narrative import (
    resolve_action_block_node,
    prepare_generation_from_sequence,
    should_launch_immediately
)

# Resolve action block to concrete actions
sequence = await resolve_action_block_node(
    db=db,
    action_block_id=node.action_block_id,
    npc=npc,
    session=session,
    params=node.params
)

# Check if generation needed
if sequence.requires_generation:
    gen_request = prepare_generation_from_sequence(sequence)

    if should_launch_immediately(sequence):
        # Launch generation now
        await generation_service.create_generation(**gen_request)
```

## Integration Helpers

### Launching from NPC Interaction

```python
from pixsim7.backend.narrative import launch_narrative_program_from_interaction

# Launch program when player interacts with NPC
result = await launch_narrative_program_from_interaction(
    db=db,
    session=session,
    npc=npc,
    interaction_type="talk",
    context={"mood": "happy"}
)
```

### Creating Simple Programs

```python
from pixsim7.backend.narrative import (
    create_simple_dialogue_program,
    create_simple_choice_program
)

# Quick dialogue
program = create_simple_dialogue_program(
    speaker="Alice",
    lines=[
        "Hello!",
        "How are you today?",
        "Nice to meet you!"
    ]
)

# Quick choice
program = create_simple_choice_program(
    prompt="What will you do?",
    choices=[
        {"id": "help", "text": "Help her"},
        {"id": "ignore", "text": "Walk away"}
    ],
    outcomes={
        "help": {"affection": +10},
        "ignore": {"affection": -5}
    }
)
```

## Narrative Program Flow

### Example: Romance Conversation

```python
from pixsim7.backend.narrative import (
    NarrativeProgram, DialogueNode, ChoiceNode,
    BranchNode, ActionNode, NarrativeEdge
)

program = NarrativeProgram(
    name="First Date",
    entry_node_id="greeting",
    nodes=[
        # 1. Greeting
        DialogueNode(
            id="greeting",
            speaker="Alice",
            text="Thanks for meeting me!",
        ),

        # 2. Player choice
        ChoiceNode(
            id="response",
            prompt="What do you say?",
            choices=[
                {"id": "romantic", "text": "I've been looking forward to this!"},
                {"id": "casual", "text": "No problem."}
            ]
        ),

        # 3a. Romantic path
        DialogueNode(
            id="romantic_response",
            speaker="Alice",
            text="Me too! ❤️",
        ),
        ActionNode(
            id="romantic_effect",
            action_type="modify_stat",
            params={"stat": "affection", "delta": +15}
        ),

        # 3b. Casual path
        DialogueNode(
            id="casual_response",
            speaker="Alice",
            text="Yeah...",
        ),
        ActionNode(
            id="casual_effect",
            action_type="modify_stat",
            params={"stat": "affection", "delta": +5}
        ),

        # 4. Check relationship level
        BranchNode(
            id="check_affection",
            condition={"type": "stat_above", "stat": "affection", "threshold": 60}
        ),

        # 5a. High affection
        DialogueNode(
            id="kiss_prompt",
            speaker="Alice",
            text="This has been wonderful...",
        ),

        # 5b. Low affection
        DialogueNode(
            id="goodbye",
            speaker="Alice",
            text="See you around!",
        ),
    ],
    edges=[
        # Greeting -> Choice
        NarrativeEdge(from_node_id="greeting", to_node_id="response"),

        # Choice branches
        NarrativeEdge(
            from_node_id="response",
            to_node_id="romantic_response",
            condition={"choice": "romantic"}
        ),
        NarrativeEdge(
            from_node_id="response",
            to_node_id="casual_response",
            condition={"choice": "casual"}
        ),

        # Effects
        NarrativeEdge(from_node_id="romantic_response", to_node_id="romantic_effect"),
        NarrativeEdge(from_node_id="casual_response", to_node_id="casual_effect"),

        # Converge to branch check
        NarrativeEdge(from_node_id="romantic_effect", to_node_id="check_affection"),
        NarrativeEdge(from_node_id="casual_effect", to_node_id="check_affection"),

        # Branch outcomes
        NarrativeEdge(
            from_node_id="check_affection",
            to_node_id="kiss_prompt",
            condition={"branch": "true"}
        ),
        NarrativeEdge(
            from_node_id="check_affection",
            to_node_id="goodbye",
            condition={"branch": "false"}
        ),
    ]
)
```

## Integration with Other Domains

### With Game Domain

Narrative reads and modifies game state:

```python
from pixsim7.backend.game import get_npc_metric, set_npc_metric, get_game_state
from pixsim7.backend.narrative import NarrativeRuntimeEngine

# Access game state during narrative
state = get_game_state(session)
affection = get_npc_metric(npc, "affection")

# Narrative can modify stats
set_npc_metric(npc, "affection", affection + 10)
```

### With Content Domain

Narrative can trigger content generation:

```python
from pixsim7.backend.narrative import ActionBlockNode
from pixsim7.backend.content import GenerationService

# Action block triggers video generation
action_block_node = ActionBlockNode(
    id="generate_kiss_scene",
    action_block_id=kiss_scene_template_id,
    params={"characters": [player, npc], "emotion": "passionate"}
)

# Resolved by action block resolver, creates Generation
```

## Extending Narrative

### Adding New Node Types

1. Define node schema in `domain/narrative/schema.py`
2. Add execution logic in `services/narrative/runtime.py`
3. Export from `pixsim7.backend.narrative` entry module

### Adding Custom Conditions

```python
# Register custom condition evaluator
from pixsim7.backend.narrative import register_condition_evaluator

@register_condition_evaluator("custom_condition")
def evaluate_custom(npc, params, context):
    # Custom logic
    return npc.entity_data.get("special_flag", False)

# Use in BranchNode
BranchNode(
    id="check_special",
    condition={"type": "custom_condition"}
)
```

### Creating Program Templates

Store common program patterns as templates:

```python
# Store template in database
template = NarrativeProgramTemplate(
    name="Basic Greeting",
    template_data=program.dict()
)

# Instantiate with parameters
instance = template.instantiate(speaker="Alice", tone="friendly")
```

## Related Domains

- **Game**: Reads/modifies NPC stats, session state, game mode
- **Content**: Triggers asset generation via action blocks
- **Simulation**: Can be triggered by simulation events (scheduled interactions)

## Best Practices

1. **Keep programs focused** - One program = one conversation/scene
2. **Use variables** - Store context in program variables, not hardcoded
3. **Reuse action blocks** - Common actions (generation, effects) should be blocks
4. **Test branches** - Ensure all conditional paths are reachable
5. **Handle errors** - Use WaitNode or ExternalCallNode for async operations
6. **Version programs** - Store versions when making breaking changes
