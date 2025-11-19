# Narrative Runtime Migration Guide

This guide helps you migrate from legacy dialogue and action block APIs to the unified narrative runtime system.

## Why Migrate?

The unified narrative runtime provides:

- **Single System**: One system for dialogue, action blocks, choices, and scenes
- **State Management**: Automatic state tracking with history and nesting
- **Composability**: Mix dialogue, choices, and action blocks in one program
- **Tooling**: Better authoring tools and debugging
- **Maintainability**: Cleaner code with less duplication

## Migration Path

### Level 1: Use Shims (Immediate Compatibility)

Existing code continues to work via backward compatibility shims. No changes required.

```python
# Old code still works
result = await dialogue_api.next_line(npc_id, session_id, program_id)
```

The shims automatically wrap your requests in minimal narrative programs.

### Level 2: Use Interaction Outcomes (Recommended)

**Before:**
```python
interaction_outcome = {
    "generationLaunch": {
        "actionBlockIds": ["block1", "block2"],
        "dialogueRequest": {"programId": "greeting"}
    }
}
```

**After:**
```python
interaction_outcome = {
    "narrativeProgramId": "my_greeting_program"
}
```

Benefits:
- Full control over dialogue flow
- Can include choices and branching
- Better state tracking

### Level 3: Create Custom Programs (Advanced)

**Simple Dialogue:**
```python
from pixsim7_backend.domain.narrative import create_simple_dialogue_program

program = create_simple_dialogue_program(
    program_id="greeting_sequence",
    npc_id=npc_id,
    dialogue_lines=[
        "Hello! How are you today?",
        "It's nice to see you again.",
        "What brings you here?"
    ]
)
```

**Dialogue with Choices:**
```python
from pixsim7_backend.domain.narrative import create_simple_choice_program

program = create_simple_choice_program(
    program_id="gift_choice",
    prompt="What would you like to do?",
    choices=[
        {
            "id": "give_gift",
            "text": "Give gift",
            "outcome": "They smile warmly at your gesture.",
            "effects": {"relationship": {"affinity": 5}}
        },
        {
            "id": "talk",
            "text": "Just talk",
            "outcome": "You have a pleasant conversation."
        }
    ]
)
```

**Custom Programs:**
```python
from pixsim7_backend.domain.narrative import (
    NarrativeProgram,
    DialogueNode,
    ChoiceNode,
    ActionBlockNode,
    NarrativeEdge
)

program = NarrativeProgram(
    id="complex_interaction",
    version="1.0",
    kind="dialogue",
    name="Complex Interaction",
    nodes=[
        DialogueNode(
            id="intro",
            type="dialogue",
            mode="static",
            text="Welcome! What would you like to do?"
        ),
        ChoiceNode(
            id="choice",
            type="choice",
            prompt="Choose an activity:",
            choices=[
                {
                    "id": "romantic",
                    "text": "Spend time together",
                    "targetNodeId": "romantic_scene",
                    "condition": {"expression": "affinity >= 60"}
                },
                {
                    "id": "casual",
                    "text": "Chat casually",
                    "targetNodeId": "casual_talk"
                }
            ]
        ),
        ActionBlockNode(
            id="romantic_scene",
            type="action_block",
            mode="query",
            query={
                "location": "bedroom",
                "intimacy_level": "romantic",
                "mood": "tender"
            }
        ),
        DialogueNode(
            id="casual_talk",
            type="dialogue",
            mode="llm_program",
            program_id="casual_conversation"
        )
    ],
    edges=[
        NarrativeEdge(id="e1", from_="intro", to="choice"),
        # Choices handle their own routing
    ],
    entry_node_id="intro",
    metadata={"contentRating": "romantic"}
)
```

## API Changes

### Old Dialogue API
```python
# ❌ Deprecated (still works via shim)
POST /api/v1/game_dialogue/next-line/execute
{
    "npcId": 1,
    "sessionId": 123,
    "programId": "greeting"
}
```

### New Runtime API
```python
# ✅ Recommended
POST /api/v1/narrative-runtime/start
{
    "sessionId": 123,
    "npcId": 1,
    "programId": "greeting_program"
}
```

### Old Action Block API
```python
# ❌ Deprecated (still works via shim)
POST /api/v1/game_dialogue/actions/select
{
    "locationTag": "bedroom",
    "intimacyLevel": "romantic"
}
```

### New Runtime with Action Blocks
```python
# ✅ Recommended (part of narrative program)
POST /api/v1/narrative-runtime/start
{
    "sessionId": 123,
    "npcId": 1,
    "programId": "romantic_scene"  # Contains ActionBlockNode
}
```

## Intimacy Composer Migration

**Export scenes as programs:**

```typescript
import { export_intimacy_scene_as_program } from '@pixsim7/narrative';

// In intimacy composer
const programId = await exportSceneAsProgram(sceneConfig, world);

// Now usable in interactions
interactionOutcome.narrativeProgramId = programId;
```

The exporter automatically converts:
- Arc structure → ActionBlockNodes
- Progression gates → ChoiceNodes
- Rating constraints → Conditions

## Behavior System Integration

**Before:**
```python
# Direct dialogue call in behavior hook
dialogue_result = await call_dialogue(npc_id, program_id)
```

**After:**
```python
from pixsim7_backend.domain.narrative import create_behavior_dialogue_program

# Create program for behavior
program = create_behavior_dialogue_program(
    behavior_id="greet_on_approach",
    npc_id=npc_id,
    dialogue_prompt_id="casual_greeting",
    mood="friendly"
)

# Launch via runtime
result = await runtime.start(session, world, npc_id, program.id)
```

## Checking Migration Status

```python
from pixsim7_backend.domain.narrative.legacy_shims import get_migration_status

status = get_migration_status(world)
print(f"Migration progress: {status['migrationPercentage']}%")
print(f"Runtime interactions: {status['interactionsUsingRuntime']}")
print(f"Legacy interactions: {status['interactionsUsingLegacy']}")
```

## Common Patterns

### Pattern 1: Linear Dialogue → Simple Program
```python
# Helper creates program automatically
program = create_simple_dialogue_program(
    program_id="tutorial_intro",
    npc_id=npc_id,
    dialogue_lines=tutorial_lines
)
```

### Pattern 2: Dialogue + Generation → Single Program
```python
# Combine in one program
NarrativeProgram(
    nodes=[
        DialogueNode(id="intro", mode="static", text="Let's begin..."),
        ActionBlockNode(id="scene", mode="query", query={...}),
        DialogueNode(id="outro", mode="static", text="That was nice.")
    ],
    edges=[...]
)
```

### Pattern 3: Conditional Content → Branch Nodes
```python
BranchNode(
    id="check_affinity",
    branches=[
        {
            "id": "high",
            "condition": {"expression": "affinity >= 70"},
            "targetNodeId": "intimate_dialogue"
        },
        {
            "id": "low",
            "condition": {"expression": "affinity < 70"},
            "targetNodeId": "casual_dialogue"
        }
    ]
)
```

## Deprecation Timeline

- **Phase 1 (Current)**: Both old and new APIs work
- **Phase 2 (Future)**: Old APIs emit deprecation warnings
- **Phase 3 (Future)**: Old APIs removed (shims remain)

## Getting Help

- See: `docs/NARRATIVE_RUNTIME.md` for full documentation
- Examples: `examples/narrative_programs/`
- API Reference: `/api/v1/narrative-runtime` endpoints

## Checklist

- [ ] Reviewed this migration guide
- [ ] Identified interactions using old APIs
- [ ] Created narrative programs for complex flows
- [ ] Updated interaction outcomes to use `narrativeProgramId`
- [ ] Tested migration with existing content
- [ ] Monitored deprecation warnings
- [ ] Removed direct calls to old APIs
