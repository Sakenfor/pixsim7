# Concept Discovery Workflow - Complete Example

This document demonstrates the complete end-to-end workflow of the interactive concept discovery system using the werewolf banana prompt as an example.

---

## Original Prompt

```
A realistic werewolf grips a banana with his hairy werewolf hand.
The banana has goo squirting out of its top.
The goo is squirting about 15cm upwards.
Close-up on the werewolf's hand gripping the banana.
The goo lands on the werewolf's hairy buttocks.
Camera rotation follows the goo as it arcs through the air.
Cut to: The werewolf's face reacting with surprise.
Maintain realistic fur rendering throughout.
Keep lighting consistent across all cuts.
```

**Stats**: 524 characters, complex prompt with narrative + technical elements

---

## Step 1: Get Config Recommendation

**Request:**
```bash
POST /api/v1/action-blocks/configs/recommend
Content-Type: application/json

{
    "prompt_text": "A realistic werewolf grips a banana with his hairy werewolf hand..."
}
```

**Response:**
```json
{
    "recommended_config": {
        "config_id": "mixed",
        "name": "Mixed / Comprehensive",
        "description": "Extract both narrative and technical blocks comprehensively",
        "extraction_mode": "auto",
        "min_block_chars": 200,
        "max_block_chars": 450,
        "target_block_count": 7,
        "concept_discovery_enabled": true,
        "concept_threshold": 0.5
    },
    "reason": "Based on prompt analysis",
    "prompt_length": 524,
    "prompt_preview": "A realistic werewolf grips a banana with his hairy werewolf hand..."
}
```

**Why "mixed"?**
- Contains both narrative elements (character, action, reaction)
- Contains technical elements (camera, lighting, rendering)
- Balanced narrative score: 3 (werewolf, face, reaction)
- Balanced technical score: 4 (camera, rotation, realistic, consistent)
- Medium length (524 chars) → comprehensive extraction needed

---

## Step 2: Extract with Concept Discovery

**Request:**
```bash
POST /api/v1/action-blocks/extract/with-concepts
Content-Type: application/json

{
    "prompt_text": "A realistic werewolf grips a banana with his hairy werewolf hand. The banana has goo squirting out of its top. The goo is squirting about 15cm upwards. Close-up on the werewolf's hand gripping the banana. The goo lands on the werewolf's hairy buttocks. Camera rotation follows the goo as it arcs through the air. Cut to: The werewolf's face reacting with surprise. Maintain realistic fur rendering throughout. Keep lighting consistent across all cuts.",
    "config_id": "mixed",
    "source_prompt_version_id": null
}
```

**Response:**
```json
{
    "extraction_result": {
        "extraction_performed": true,
        "analysis": {
            "char_count": 524,
            "word_count": 79,
            "sentence_count": 9,
            "complexity_score": 6.5,
            "detected_categories": {
                "character": ["werewolf", "realistic"],
                "action": ["grip", "touch"],
                "camera": ["camera", "rotation"]
            },
            "suitable_for_extraction": true
        },
        "blocks_created": [
            {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "block_id": "werewolf_character_desc",
                "kind": "single_state",
                "complexity_level": "moderate",
                "char_count": 215,
                "prompt_preview": "A realistic werewolf with hairy fur. Realistic fur rendering throughout..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "block_id": "banana_grip_action",
                "kind": "transition",
                "complexity_level": "moderate",
                "char_count": 198,
                "prompt_preview": "The werewolf grips a banana with his hairy werewolf hand..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440003",
                "block_id": "goo_squirt_effect",
                "kind": "transition",
                "complexity_level": "moderate",
                "char_count": 187,
                "prompt_preview": "The banana has goo squirting out of its top. The goo is squirting about 15cm upwards..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440004",
                "block_id": "hand_closeup_camera",
                "kind": "single_state",
                "complexity_level": "simple",
                "char_count": 165,
                "prompt_preview": "Close-up on the werewolf's hand gripping the banana..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440005",
                "block_id": "goo_landing_action",
                "kind": "transition",
                "complexity_level": "simple",
                "char_count": 152,
                "prompt_preview": "The goo lands on the werewolf's hairy buttocks..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440006",
                "block_id": "camera_rotation_track",
                "kind": "transition",
                "complexity_level": "moderate",
                "char_count": 178,
                "prompt_preview": "Camera rotation follows the goo as it arcs through the air..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440007",
                "block_id": "werewolf_reaction_shot",
                "kind": "single_state",
                "complexity_level": "simple",
                "char_count": 145,
                "prompt_preview": "Cut to: The werewolf's face reacting with surprise..."
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440008",
                "block_id": "lighting_continuity",
                "kind": "single_state",
                "complexity_level": "simple",
                "char_count": 132,
                "prompt_preview": "Keep lighting consistent across all cuts..."
            }
        ],
        "total_blocks": 8,
        "composition_info": {
            "original_length": 524,
            "blocks_total_length": 1372,
            "compression_ratio": 0.38
        }
    },
    "concept_discovery": {
        "new_concepts": [
            {
                "type": "block_type",
                "value": "effect_description",
                "description": "Describes visual effects like liquid squirts and arcs",
                "found_in": "goo_squirt_effect",
                "reusable": true,
                "prompt_context": "The banana has goo squirting out of its top. The goo is squirting about 15cm..."
            },
            {
                "type": "subtype",
                "value": "liquid_squirt",
                "description": "Subtype found in effect_description",
                "found_in": "goo_squirt_effect",
                "reusable": true,
                "prompt_context": "The banana has goo squirting out of its top..."
            },
            {
                "type": "tag",
                "value": "effect_type:liquid_squirt",
                "tag_key": "effect_type",
                "tag_value": "liquid_squirt",
                "description": "Tag discovered in effect_description",
                "found_in": "goo_squirt_effect",
                "reusable": true,
                "prompt_context": "The banana has goo squirting out of its top..."
            },
            {
                "type": "tag",
                "value": "substance:goo",
                "tag_key": "substance",
                "tag_value": "goo",
                "description": "Tag discovered in effect_description",
                "found_in": "goo_squirt_effect",
                "reusable": false,
                "prompt_context": "The banana has goo squirting out of its top..."
            },
            {
                "type": "tag",
                "value": "distance:15cm",
                "tag_key": "distance",
                "tag_value": "15cm",
                "description": "Tag discovered in effect_description",
                "found_in": "goo_squirt_effect",
                "reusable": false,
                "prompt_context": "The goo is squirting about 15cm upwards..."
            },
            {
                "type": "tag",
                "value": "shot_type:closeup",
                "tag_key": "shot_type",
                "tag_value": "closeup",
                "description": "Tag discovered in camera_instruction",
                "found_in": "hand_closeup_camera",
                "reusable": true,
                "prompt_context": "Close-up on the werewolf's hand gripping the banana..."
            },
            {
                "type": "tag",
                "value": "camera_movement:rotation",
                "tag_key": "camera_movement",
                "tag_value": "rotation",
                "description": "Tag discovered in camera_instruction",
                "found_in": "camera_rotation_track",
                "reusable": true,
                "prompt_context": "Camera rotation follows the goo as it arcs..."
            },
            {
                "type": "tag",
                "value": "transition:cut",
                "tag_key": "transition",
                "tag_value": "cut",
                "description": "Tag discovered in action_choreography",
                "found_in": "werewolf_reaction_shot",
                "reusable": true,
                "prompt_context": "Cut to: The werewolf's face reacting with surprise..."
            },
            {
                "type": "tag",
                "value": "emotion:surprise",
                "tag_key": "emotion",
                "tag_value": "surprise",
                "description": "Tag discovered in reaction_description",
                "found_in": "werewolf_reaction_shot",
                "reusable": true,
                "prompt_context": "The werewolf's face reacting with surprise..."
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
            },
            {
                "type": "block_type",
                "value": "camera_instruction"
            },
            {
                "type": "block_type",
                "value": "reaction_description"
            },
            {
                "type": "block_type",
                "value": "continuity_instruction"
            }
        ],
        "suggestions": [
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "block_type",
                    "value": "effect_description"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.75,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "tag",
                    "value": "effect_type:liquid_squirt"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.70,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "tag",
                    "value": "shot_type:closeup"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.85,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "tag",
                    "value": "camera_movement:rotation"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.90,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "tag",
                    "value": "transition:cut"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.88,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "add_to_registry",
                "concept": {
                    "type": "tag",
                    "value": "emotion:surprise"
                },
                "reason": "High reusability potential",
                "reusability_score": 0.82,
                "recommendation": "Add as new concept for future use"
            },
            {
                "action": "consider",
                "concept": {
                    "type": "tag",
                    "value": "substance:goo"
                },
                "reason": "Moderate reusability",
                "reusability_score": 0.35,
                "recommendation": "Consider adding if you plan to reuse this pattern"
            },
            {
                "action": "skip",
                "concept": {
                    "type": "tag",
                    "value": "distance:15cm"
                },
                "reason": "Very specific to this scenario",
                "reusability_score": 0.15,
                "recommendation": "Skip - too specific for general use"
            }
        ]
    },
    "requires_confirmation": true,
    "message": "Extracted 8 blocks. Found 9 new concepts for your review."
}
```

---

## Step 3: Review & Decide

The user reviews the suggestions:

### High Priority (score > 0.7) - **CONFIRM THESE**
✅ `effect_description` (0.75) - New block type for visual effects
✅ `effect_type:liquid_squirt` (0.70) - Useful for liquid effects
✅ `shot_type:closeup` (0.85) - Very reusable camera concept
✅ `camera_movement:rotation` (0.90) - Generic camera movement
✅ `transition:cut` (0.88) - Common editing technique
✅ `emotion:surprise` (0.82) - Reusable emotion tag

### Medium Priority (score 0.3-0.6) - **MAYBE CONFIRM**
⚠️ `substance:goo` (0.35) - If you do lots of goo/slime effects, confirm it

### Low Priority (score < 0.3) - **SKIP**
❌ `distance:15cm` (0.15) - Too specific, unlikely to reuse exact measurement
❌ `liquid_squirt` subtype (0.45) - Covered by tag, don't need subtype

---

## Step 4: Confirm Selected Concepts

**Request:**
```bash
POST /api/v1/action-blocks/concepts/confirm
Content-Type: application/json

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
        },
        {
            "type": "tag",
            "value": "shot_type:closeup",
            "tag_key": "shot_type",
            "tag_value": "closeup"
        },
        {
            "type": "tag",
            "value": "camera_movement:rotation",
            "tag_key": "camera_movement",
            "tag_value": "rotation"
        },
        {
            "type": "tag",
            "value": "transition:cut",
            "tag_key": "transition",
            "tag_value": "cut"
        },
        {
            "type": "tag",
            "value": "emotion:surprise",
            "tag_key": "emotion",
            "tag_value": "surprise"
        }
    ],
    "confirmed_by": "user123"
}
```

**Response:**
```json
{
    "confirmed_count": 6,
    "skipped_count": 0,
    "confirmed": [
        {
            "type": "block_type",
            "value": "effect_description",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "effect_type:liquid_squirt",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "shot_type:closeup",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "camera_movement:rotation",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "transition:cut",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        },
        {
            "type": "tag",
            "value": "emotion:surprise",
            "confirmed_at": "2025-11-18T10:45:00Z",
            "confirmed_by": "user123",
            "reusability_score": true
        }
    ],
    "skipped": []
}
```

---

## Step 5: Benefits for Future Extractions

### Next Time You Import Similar Prompt

**Prompt:** "Blood squirts from a wound. Camera rotates to follow the blood arc."

**AI Extraction:**
- Recognizes `effect_description` as existing block type (won't suggest as new)
- Suggests `effect_type:liquid_squirt` tag (already formalized)
- Suggests `camera_movement:rotation` tag (already formalized)
- **Only new concept**: Maybe `substance:blood` (vs goo)

**User sees:**
```json
{
    "new_concepts": [
        {
            "type": "tag",
            "value": "substance:blood",
            "reusability_score": 0.6,
            "recommendation": "Consider - similar to 'goo' but different substance"
        }
    ],
    "existing_concepts": [
        {
            "type": "block_type",
            "value": "effect_description"
        },
        {
            "type": "tag",
            "value": "effect_type:liquid_squirt"
        },
        {
            "type": "tag",
            "value": "camera_movement:rotation"
        }
    ]
}
```

Much cleaner! Only 1 new concept to review instead of 9.

---

## Step 6: Using Confirmed Concepts

### Get Suggestions for New Prompt

**Request:**
```bash
GET /api/v1/action-blocks/concepts/suggestions
?prompt_text=A vampire reacts with shock. Close-up on his face.
```

**Response:**
```json
[
    {
        "type": "tag",
        "value": "emotion:surprise",
        "tag_key": "emotion",
        "tag_value": "surprise",
        "source": "similar_prompt",
        "similar_block_id": "550e8400-e29b-41d4-a716-446655440007",
        "confidence": 0.8,
        "note": "Similar to 'reacting with surprise' from werewolf prompt"
    },
    {
        "type": "tag",
        "value": "shot_type:closeup",
        "tag_key": "shot_type",
        "tag_value": "closeup",
        "source": "similar_prompt",
        "similar_block_id": "550e8400-e29b-41d4-a716-446655440004",
        "confidence": 0.9,
        "note": "Direct match for 'close-up on face'"
    }
]
```

The system learns from your previous confirmations!

---

## Complete Database State After Workflow

### Action Blocks Table
```
8 new rows in action_blocks table:
- werewolf_character_desc
- banana_grip_action
- goo_squirt_effect (with new effect_description type!)
- hand_closeup_camera
- goo_landing_action
- camera_rotation_track
- werewolf_reaction_shot
- lighting_continuity
```

### Concept Registry Cache
```python
{
    "block_type:effect_description": {"confirmed": True, "usage_count": 1},
    "tag:effect_type:liquid_squirt": {"confirmed": True, "usage_count": 1},
    "tag:shot_type:closeup": {"confirmed": True, "usage_count": 1},
    "tag:camera_movement:rotation": {"confirmed": True, "usage_count": 1},
    "tag:transition:cut": {"confirmed": True, "usage_count": 1},
    "tag:emotion:surprise": {"confirmed": True, "usage_count": 1}
}
```

### Query Statistics

```bash
GET /api/v1/action-blocks/concepts/stats
```

```json
{
    "total_block_types": 6,
    "block_types": {
        "character_description": 1,
        "action_choreography": 2,
        "camera_instruction": 2,
        "reaction_description": 1,
        "continuity_instruction": 1,
        "effect_description": 1  // NEW!
    },
    "total_tags": 6,
    "top_tags": [
        ["effect_type:liquid_squirt", 1],  // NEW!
        ["shot_type:closeup", 1],  // NEW!
        ["camera_movement:rotation", 1],  // NEW!
        ["transition:cut", 1],  // NEW!
        ["emotion:surprise", 1]  // NEW!
    ],
    "cache_size": 6
}
```

---

## Summary

### What Happened

1. **AI analyzed** prompt and recommended "mixed" config
2. **AI extracted** 8 reusable blocks from complex prompt
3. **AI discovered** 9 new concepts with reusability scores
4. **User reviewed** suggestions and confirmed 6 high-value concepts
5. **System learned** new patterns for future use
6. **Database grew** with both blocks and concepts

### Time Saved

- **First extraction**: 30 seconds to review and confirm 6 concepts
- **Future extractions**: Automatically uses confirmed concepts, no review needed
- **After 10 similar prompts**: System learns your patterns, minimal review

### Quality Improved

- **Consistent taxonomy**: Same tags used across all blocks
- **Discoverable blocks**: Easy to search by `effect_type:liquid_squirt`
- **Reusable components**: Mix and match confirmed concepts
- **Community growth**: Share concepts with other users (future feature)

---

## Alternative Scenarios

### Scenario 1: User Chooses "Aggressive" Config

```json
{
    "config_id": "aggressive",
    "auto_confirm_generic": true  // Auto-confirms score > 0.7
}
```

**Result:**
- 12 blocks instead of 8 (more granular)
- Generic concepts auto-confirmed (camera_movement, shot_type, transition, emotion)
- Only specific concepts need review (substance:goo, distance:15cm)

### Scenario 2: User Skips All Concepts

```bash
POST /action-blocks/concepts/confirm
{
    "concepts": []  // Don't confirm anything
}
```

**Result:**
- Blocks still created and usable
- No concepts added to registry
- Next similar prompt will re-discover same concepts

### Scenario 3: User Confirms "substance:goo"

If user confirms low-score concept:

```json
{
    "type": "tag",
    "value": "substance:goo",
    "confirmed_by": "user123"
}
```

**Effect:**
- Added to registry with usage_count = 1
- Future goo-related prompts will suggest this tag
- User can build a library of unusual/specific concepts

---

## Next Steps

1. **Import more prompts** - System learns from each extraction
2. **Review concept stats** - See which concepts are most used
3. **Create custom config** - Optimize for your specific workflow
4. **Share concepts** - (Future) Share with community

The system continuously improves as you use it! 🚀
