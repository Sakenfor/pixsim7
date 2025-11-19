# Interactive Concept Discovery & Extraction Configs

## Overview

This system enables **dynamic, AI-powered learning** of new concepts and tags from prompt extractions, combined with **flexible extraction strategies** for different types of prompts.

### Key Features

1. **Interactive Concept Discovery**: AI discovers new concepts (block types, subtypes, tags) and asks you to confirm which ones should be formalized
2. **Reusability Scoring**: Automatically scores concepts based on generic vs. specific characteristics
3. **Extraction Configs**: Choose from 6 predefined strategies or create custom configs
4. **Smart Recommendations**: System recommends best extraction strategy based on prompt analysis
5. **Database-Driven Taxonomy**: All concepts stored in database, not hardcoded

---

## Extraction Configs

### Available Configs

| Config | Description | Blocks | Use Case |
|--------|-------------|--------|----------|
| **balanced** | Default balanced extraction | 4-6 | General purpose prompts |
| **aggressive** | Maximum granularity | 8-12 | Complex prompts needing fine control |
| **conservative** | Keep content together | 2-4 | Simple prompts, quick extraction |
| **narrative** | Story/character focused | Auto | Character-driven scenes |
| **technical** | Camera/visual focused | Auto | Technical cinematography |
| **mixed** | Comprehensive extraction | 7 | Both narrative and technical elements |

### Config Parameters

Each extraction config controls:

```python
{
    "extraction_mode": "auto|aggressive|conservative",
    "min_block_chars": 150-300,          # Minimum block size
    "max_block_chars": 300-600,          # Maximum block size
    "target_block_count": 3-10,          # Target number of blocks
    "concept_discovery_enabled": true,   # Enable concept discovery
    "concept_threshold": 0.3-0.7,        # Reusability threshold (0-1)
    "auto_confirm_generic": false,       # Auto-confirm generic concepts
    "preferred_block_types": [...],      # Focus on specific types
    "required_tags": [...],              # Tags that must be included
    "custom_instructions": "..."         # Additional AI instructions
}
```

### Using Extraction Configs

#### 1. List Available Configs

```bash
GET /api/v1/action-blocks/configs
```

Response:
```json
[
    {
        "config_id": "balanced",
        "name": "Balanced",
        "description": "Default balanced extraction - good for most prompts (4-6 blocks)",
        "extraction_mode": "auto",
        "min_block_chars": 200,
        "max_block_chars": 400,
        "target_block_count": 5,
        "concept_discovery_enabled": true,
        "concept_threshold": 0.5
    },
    {
        "config_id": "aggressive",
        "name": "Aggressive / Granular",
        "description": "Maximum granularity - extracts smallest reusable components (8-12 blocks)",
        "extraction_mode": "aggressive",
        "min_block_chars": 150,
        "max_block_chars": 300,
        "target_block_count": 10,
        "concept_threshold": 0.3
    }
    // ... more configs
]
```

#### 2. Get Recommended Config

```bash
POST /api/v1/action-blocks/configs/recommend
?prompt_text=A realistic werewolf grips a banana...
```

Response:
```json
{
    "recommended_config": {
        "config_id": "mixed",
        "name": "Mixed / Comprehensive",
        // ... full config
    },
    "reason": "Based on prompt analysis",
    "prompt_length": 1274,
    "prompt_preview": "A realistic werewolf grips a banana..."
}
```

The recommendation algorithm analyzes:
- **Narrative indicators**: character, story, emotion, personality
- **Technical indicators**: camera, lighting, render, consistent
- **Complexity**: length, sentence count
- **Content balance**: narrative vs technical ratio

#### 3. Extract with Config

```bash
POST /api/v1/action-blocks/extract/with-concepts
{
    "prompt_text": "A realistic werewolf grips a banana...",
    "config_id": "aggressive",  # Use aggressive config
    "source_prompt_version_id": null
}
```

---

## Interactive Concept Discovery

### Workflow

1. **Extract Prompt**: AI extracts blocks and discovers new concepts
2. **Review Suggestions**: System presents new concepts with reusability scores
3. **Confirm Concepts**: User confirms which concepts to formalize
4. **Use in Future**: Confirmed concepts become available for future extractions

### Example Flow

#### Step 1: Extract with Concept Discovery

```bash
POST /api/v1/action-blocks/extract/with-concepts
{
    "prompt_text": "A realistic werewolf grips a banana with his hairy werewolf hand. The banana has goo squirting out of its top. The goo is squirting about 15cm upwards.",
    "config_id": "aggressive"
}
```

Response:
```json
{
    "extraction_result": {
        "extraction_performed": true,
        "total_blocks": 8,
        "blocks_created": [
            {
                "id": "uuid-1",
                "block_id": "werewolf_grip_action",
                "kind": "transition",
                "complexity_level": "moderate",
                "prompt_preview": "A realistic werewolf grips..."
            },
            // ... more blocks
        ]
    },
    "concept_discovery": {
        "new_concepts": [
            {
                "type": "block_type",
                "value": "effect_description",
                "description": "Describes visual effects like liquid squirts",
                "found_in": "goo_squirt_effect",
                "reusable": true,
                "prompt_context": "The goo is squirting about 15cm upwards..."
            },
            {
                "type": "tag",
                "value": "effect_type:liquid_squirt",
                "tag_key": "effect_type",
                "tag_value": "liquid_squirt",
                "description": "Tag discovered in effect_description",
                "reusable": true
            },
            {
                "type": "tag",
                "value": "substance:goo",
                "tag_key": "substance",
                "tag_value": "goo",
                "description": "Specific substance type",
                "reusable": false  // Low reusability - very specific
            }
        ],
        "existing_concepts": [
            {
                "type": "block_type",
                "value": "character_description"
            },
            {
                "type": "block_type",
                "value": "action_choreography"
            }
        ],
        "suggestions": [
            {
                "action": "add_to_registry",
                "concept": { /* effect_type:liquid_squirt */ },
                "reason": "High reusability potential",
                "reusability_score": 0.75,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "consider",
                "concept": { /* substance:goo */ },
                "reason": "Moderate reusability",
                "reusability_score": 0.45,
                "recommendation": "Consider adding if you plan to reuse this pattern"
            }
        ]
    },
    "requires_confirmation": true,
    "message": "Extracted 8 blocks. Found 3 new concepts for your review."
}
```

#### Step 2: Confirm Concepts

Review the suggestions and decide which concepts to formalize:

```bash
POST /api/v1/action-blocks/concepts/confirm
{
    "concepts": [
        {
            "type": "block_type",
            "value": "effect_description"
        },
        {
            "type": "tag",
            "value": "effect_type:liquid_squirt",
            "tag_key": "effect_type",
            "tag_value": "liquid_squirt"
        }
        // Don't confirm "substance:goo" - too specific
    ],
    "confirmed_by": "username"
}
```

Response:
```json
{
    "confirmed_count": 2,
    "skipped_count": 0,
    "confirmed": [
        {
            "type": "block_type",
            "value": "effect_description",
            "confirmed_at": "2025-11-18T10:30:00Z",
            "confirmed_by": "username",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "effect_type:liquid_squirt",
            "confirmed_at": "2025-11-18T10:30:00Z",
            "confirmed_by": "username",
            "reusability_score": true
        }
    ],
    "skipped": []
}
```

#### Step 3: Use Confirmed Concepts

Next time you extract a prompt with similar effects, the system will:
1. Recognize "effect_description" as a known block type
2. Suggest "effect_type:liquid_squirt" tag for similar effects
3. Not re-discover these as "new" concepts

---

## Reusability Scoring

### How It Works

The system calculates a **reusability score (0-1)** for each discovered concept:

```python
Base score: 0.5

Generic terms (+0.2):
- camera, lighting, movement, position, angle
- action, response, continuity, effect

Specific terms (-0.3):
- banana, goo, buttocks, 15cm
- Character names, unique objects

Block types (+0.1):
- Generally reusable

Common tag patterns (+0.15):
- camera_*, intensity, mood, location, style
```

### Score Interpretation

| Score | Action | Meaning |
|-------|--------|---------|
| 0.7-1.0 | `add_to_registry` | High reusability - definitely add |
| 0.4-0.6 | `consider` | Moderate - add if you'll reuse this pattern |
| 0.0-0.3 | `skip` | Very specific - skip for general use |

### Examples

**High Reusability (0.75)**:
```json
{
    "type": "tag",
    "value": "camera_movement:dolly",
    "reusability_score": 0.75,
    "reason": "Generic camera term + common tag pattern"
}
```

**Moderate Reusability (0.45)**:
```json
{
    "type": "tag",
    "value": "effect_type:liquid_squirt",
    "reusability_score": 0.45,
    "reason": "Somewhat specific but potentially reusable for liquid effects"
}
```

**Low Reusability (0.2)**:
```json
{
    "type": "tag",
    "value": "object:banana",
    "reusability_score": 0.2,
    "reason": "Very specific object - unlikely to be reused"
}
```

---

## Concept Management

### Get Concept Statistics

```bash
GET /api/v1/action-blocks/concepts/stats
```

Response:
```json
{
    "total_block_types": 12,
    "block_types": {
        "character_description": 45,
        "action_choreography": 38,
        "camera_instruction": 52,
        "effect_description": 8,
        // ...
    },
    "total_tags": 87,
    "top_tags": [
        ["camera_movement:dolly", 23],
        ["intensity:8", 19],
        ["mood:intense", 15],
        // ...
    ],
    "cache_size": 42
}
```

### Get Concept Suggestions for New Prompt

```bash
GET /api/v1/action-blocks/concepts/suggestions
?prompt_text=A werewolf howls at the moon
```

Response:
```json
[
    {
        "type": "tag",
        "value": "character_type:werewolf",
        "tag_key": "character_type",
        "tag_value": "werewolf",
        "source": "similar_prompt",
        "similar_block_id": "uuid-of-similar-block",
        "confidence": 0.7
    },
    {
        "type": "tag",
        "value": "action:vocalization",
        "source": "similar_prompt",
        "confidence": 0.6
    }
]
```

The system finds similar prompts in the database using keyword matching and suggests relevant concepts.

---

## Advanced Usage

### Custom Extraction Config

Create your own extraction strategy:

```python
config_service = ExtractionConfigService()

custom_config = config_service.create_custom_config(
    config_data={
        "name": "My Custom Strategy",
        "description": "Optimized for my specific use case",
        "extraction_mode": "auto",
        "min_block_chars": 250,
        "max_block_chars": 450,
        "target_block_count": 6,
        "concept_threshold": 0.6,
        "preferred_block_types": ["character_description", "camera_instruction"],
        "custom_instructions": "Focus on cinematography and character details."
    },
    created_by="username"
)
```

### Batch Concept Confirmation

Confirm multiple concepts at once from different extractions:

```bash
POST /api/v1/action-blocks/concepts/confirm
{
    "concepts": [
        // From extraction 1
        {"type": "tag", "value": "lighting:dramatic"},
        // From extraction 2
        {"type": "tag", "value": "mood:tense"},
        // From extraction 3
        {"type": "block_type", "value": "transition_effect"}
    ]
}
```

### Auto-Confirm Generic Concepts

For "aggressive" config, generic concepts are auto-confirmed:

```python
{
    "config_id": "aggressive",
    "auto_confirm_generic": true  # Concepts with score > 0.7 auto-confirmed
}
```

---

## API Reference

### Extraction Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/action-blocks/extract` | POST | Standard extraction (no concept discovery) |
| `/action-blocks/extract/with-concepts` | POST | Extract with interactive concept discovery |

### Concept Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/action-blocks/concepts/confirm` | POST | Confirm discovered concepts |
| `/action-blocks/concepts/stats` | GET | Get concept usage statistics |
| `/action-blocks/concepts/suggestions` | GET | Get suggestions for new prompt |

### Config Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/action-blocks/configs` | GET | List all extraction configs |
| `/action-blocks/configs/{id}` | GET | Get specific config details |
| `/action-blocks/configs/recommend` | POST | Get recommended config for prompt |

---

## Best Practices

### When to Confirm Concepts

**✅ Confirm if:**
- Concept is generic and reusable (camera_movement, lighting, mood)
- You plan to create similar prompts in the future
- Concept represents a common pattern in your workflow
- Reusability score > 0.5

**❌ Skip if:**
- Concept is very specific (character names, unique objects)
- One-time use case
- Reusability score < 0.3

### Choosing Extraction Config

| Scenario | Recommended Config |
|----------|-------------------|
| General video generation | **balanced** |
| Complex multi-part prompt | **aggressive** |
| Quick extraction, simple prompt | **conservative** |
| Character-driven scene | **narrative** |
| Cinematography focused | **technical** |
| Both story and visuals | **mixed** |

### Concept Naming Conventions

Use namespace-style tags:
```
✅ Good:
- camera_movement:dolly
- intensity:8
- effect_type:liquid_squirt

❌ Avoid:
- dolly
- 8
- goo
```

---

## Technical Details

### Database Schema

Concepts are stored using:
- **ActionBlockDB.block_metadata**: Contains block_type, subtypes
- **ActionBlockDB.tags**: JSONB field with tag key-value pairs
- **ConceptRegistry.concept_cache**: In-memory cache for performance

### Concept Detection Logic

```sql
-- Check if block_type exists
SELECT * FROM action_blocks
WHERE block_metadata->>'block_type' = 'effect_description'
LIMIT 1

-- Check if tag exists (simplified)
SELECT * FROM action_blocks
WHERE tags @> '{"effect_type": "liquid_squirt"}'
LIMIT 1
```

### Performance

- **Concept cache**: Reduces database queries for common concepts
- **JSONB indexing**: GIN indexes on tags and block_metadata
- **Batch operations**: Confirm multiple concepts in one transaction

---

## Examples

### Example 1: Narrative Prompt

```bash
# Get recommendation
POST /configs/recommend
{"prompt_text": "Sarah feels a surge of determination. She clenches her fists..."}

# Returns: "narrative" config

# Extract with concept discovery
POST /extract/with-concepts
{
    "prompt_text": "Sarah feels a surge of determination...",
    "config_id": "narrative"
}

# Discovered concepts:
# - emotion:determination (reusability: 0.8)
# - action:clenching (reusability: 0.6)
# - character_name:Sarah (reusability: 0.2)

# Confirm generic concepts
POST /concepts/confirm
{
    "concepts": [
        {"type": "tag", "value": "emotion:determination"},
        {"type": "tag", "value": "action:clenching"}
    ]
}
```

### Example 2: Technical Prompt

```bash
# Get recommendation
POST /configs/recommend
{"prompt_text": "Camera dollies forward, lighting remains consistent..."}

# Returns: "technical" config

# Extract
POST /extract/with-concepts
{
    "prompt_text": "Camera dollies forward, lighting remains consistent...",
    "config_id": "technical"
}

# Discovered concepts:
# - camera_movement:dolly_forward (reusability: 0.9)
# - continuity:lighting (reusability: 0.85)

# Auto-confirmed (technical config auto-confirms generic concepts)
```

---

## Future Enhancements

### Planned Features

1. **Concept Hierarchies**: Parent-child relationships (e.g., liquid_squirt → squirt → effect)
2. **Community Concepts**: Share concepts across users
3. **Concept Versioning**: Track concept evolution over time
4. **ML-Based Scoring**: Train model on user confirmations
5. **Custom Config Persistence**: Save custom configs to database
6. **Concept Aliases**: Multiple names for same concept

### Contributions

To add new system configs, edit `extraction_config_service.py`:

```python
def _create_system_configs(self):
    return {
        # ... existing configs

        "your_new_config": ExtractionConfig(
            config_id="your_new_config",
            name="Your Config Name",
            description="What it does",
            # ... parameters
        )
    }
```

---

## Troubleshooting

### Concept Not Discovered

If AI doesn't discover a concept you expect:
1. Use more aggressive config (lower concept_threshold)
2. Check if concept already exists (it won't re-discover)
3. Use more specific language in prompt

### Too Many Concepts Suggested

If you get too many suggestions:
1. Use conservative config (higher concept_threshold)
2. Set `auto_confirm_generic: false`
3. Manually filter in confirmation step

### Extraction Too Granular

If blocks are too small:
1. Use conservative config
2. Increase `min_block_chars`
3. Decrease `target_block_count`

### Extraction Not Granular Enough

If blocks are too large:
1. Use aggressive config
2. Decrease `max_block_chars`
3. Increase `target_block_count`

---

## Summary

The Interactive Concept Discovery system enables:

1. **Dynamic Learning**: AI discovers new concepts from your prompts
2. **User Control**: You decide which concepts to formalize
3. **Flexible Extraction**: 6 configs for different prompt types
4. **Smart Recommendations**: System suggests best config and concepts
5. **Database-Driven**: All concepts stored in DB, not hardcoded

This creates a continuously improving, community-extensible taxonomy system that learns from actual usage patterns.
