# Action Engine Session Resume & Extension Guide

## Current State Summary

### What We've Built

1. **Narrative Prompt Engine** (COMPLETED)
   - Location: `pixsim7/backend/main/domain/narrative/`
   - Generates dialogue prompts based on NPC relationships, world state
   - API: `/api/v1/game/dialogue/next-line`

2. **Action Prompt Engine** (COMPLETED)
   - Location: `pixsim7/backend/main/domain/narrative/action_blocks/`
   - Generates 5-8 second video clip prompts
   - Supports both v1 (basic) and v2 (enhanced) blocks
   - API: `/api/v1/game/dialogue/actions/select`

3. **Key Enhancements Added**
   - Camera movement metadata (rotation, dolly, tracking, etc.)
   - Consistency flags (maintainPose, preserveLighting, etc.)
   - Content rating system (general → explicit)
   - Intensity progression patterns
   - Backward compatible with v1 blocks

### Files Created/Modified

```
pixsim7/backend/main/domain/narrative/
├── engine.py                          # Narrative engine
├── context.py                         # Context models
├── programs.py                        # Prompt programs
├── relationships.py                   # Relationship helpers
├── intent_mapping.py                  # Intent alignment
├── action_blocks/
│   ├── __init__.py
│   ├── types.py                      # V1 action block types
│   ├── types_v2.py                   # V2 enhanced types
│   ├── engine.py                     # Action selector (updated)
│   ├── pose_taxonomy.py              # Pose mapping system
│   ├── prompt_builder.py             # Layered prompt construction
│   └── library/
│       ├── bench_park_actions.json   # Example blocks
│       ├── bar_lounge_actions.json   # Example blocks
│       └── enhanced_intimate_actions.json # V2 examples

pixsim7/backend/main/api/v1/
├── game_dialogue.py                  # All dialogue/action APIs

docs/
├── NARRATIVE_PROMPT_ENGINE_SPEC.md   # Original spec
├── NARRATIVE_PROMPT_SCHEMA.md        # JSON schema
├── NARRATIVE_ENGINE_USAGE.md         # Usage guide
├── ACTION_PROMPT_ENGINE_SPEC.md      # Original spec
├── ACTION_ENGINE_USAGE.md            # Usage guide
├── ACTION_BLOCK_GENERATION_GUIDE.md  # For Claude Sonnet
```

## Extension Architecture for New Concepts

### Current Limitations
- Action blocks are pre-defined in JSON files
- New creature types, positions, interactions need new blocks
- No runtime generation of novel concepts

### Proposed Extension System

```python
# Three-tier system:
1. Static Library (existing JSON blocks)
2. Template System (parameterized blocks)
3. Dynamic Generation (Claude Sonnet API)
```

## Next Session Tasks

### 1. Implement Dynamic Block Generator
Create `pixsim7/backend/main/domain/narrative/action_blocks/generator.py`:
- Template-based generation
- Claude Sonnet integration
- Concept combination system

### 2. Add Generation API Endpoints
Extend `game_dialogue.py`:
- `POST /api/v1/game/dialogue/actions/generate` - Generate new block
- `POST /api/v1/game/dialogue/actions/test` - Test generation quality

### 3. Create Concept Library
New file `pixsim7/backend/main/domain/narrative/action_blocks/concepts.py`:
- Creature types and their properties
- Interaction patterns
- Body area mappings
- Movement vocabularies

## Original Prompt Analysis

The user provided this complex prompt that we need to support:

### Key Elements Extracted
1. **Creature**: 3D realistic werewolf with specific features
2. **Maintained Position**: "She maintains her position throughout"
3. **Camera Work**: "Camera begins slow rotation around them"
4. **Continuous Actions**: Gripping, kneading, sniffing throughout
5. **Intensity Build**: Progressive escalation
6. **Consistency**: "appearance and lighting remain consistent"

### Pattern Template
```
[Character] maintains [position] throughout in [original_pose].
[Creature] with [appearance] appears [relative_position].
[Primary_action] with [specific_details].
[Continuous_actions] throughout.
Camera [movement_type] around them.
[Character_reaction] while staying in place.
[Consistency_notes].
```

## Testing Framework Needed

To test if AI can regenerate the original from templates:

```python
def test_generation_accuracy(
    original_prompt: str,
    template: str,
    parameters: dict
) -> float:
    """Test how closely generated matches original."""
    generated = generate_from_template(template, parameters)
    return calculate_similarity(original_prompt, generated)
```

## Key Decisions for Next Session

1. **Storage**: Should generated blocks be cached in DB or memory?
2. **Validation**: How strict should validation be for Sonnet-generated blocks?
3. **Content Filtering**: Should we pre-filter or post-filter inappropriate content?
4. **Template Granularity**: How detailed should templates be?

## Questions to Address

1. How to handle creature-specific movements (slithering vs walking)?
2. Should body areas be anatomically tagged or free text?
3. How to ensure generated content stays within rating bounds?
4. Should templates be version-controlled?

## Current System Capabilities

✅ Can handle:
- Camera movement (rotation, tracking, etc.)
- Position maintenance
- Intensity progression
- Multi-character scenes
- Content rating

❌ Cannot currently handle:
- Novel creatures without predefined blocks
- Dynamic position combinations
- Runtime generation from concepts
- Automatic variation creation

## Resume Point

To continue development:
1. Read this document
2. Review the enhanced action block schema in `types_v2.py`
3. Start with implementing the generator system
4. Test with the werewolf prompt as first example