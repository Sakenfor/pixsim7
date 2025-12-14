# Claude Sonnet Prompt Injection Guide
## How to Add New Action Blocks to the PixSim7 System

---

## 🎯 Quick Start for Sonnet

Hello Claude Sonnet! This guide will help you inject new prompts into the PixSim7 action generation system after collaborating with users to create them.

### What You're Working With

The system has three ways to add new content:
1. **Quick JSON Injection** - Add to existing JSON files (easiest, no Python changes)
2. **Template Creation** - Create reusable templates (medium complexity)
3. **Concept Extension** - Add new creatures/interactions (requires Python edits)

---

## 📦 Method 1: Action Block Packages (Recommended)

The easiest way is to create JSON packages that can be dropped into the system without modifying Python code.

### Step 1: Create a Package File

Create a new JSON file in: `pixsim7/backend/main/domain/narrative/action_blocks/packages/`

Example: `werewolf_advanced_pack.json`

```json
{
  "package_info": {
    "name": "werewolf_advanced",
    "version": "1.0.0",
    "author": "Claude Sonnet + User",
    "description": "Advanced werewolf interaction blocks",
    "content_rating_max": "intimate"
  },
  "creatures": {
    "werewolf_alpha": {
      "base_type": "werewolf",
      "special_features": ["alpha_presence", "pack_leader_aura", "dominant_stance"],
      "unique_actions": ["commanding", "pack_calling", "territory_marking"]
    }
  },
  "templates": {
    "werewolf_possession_enhanced": {
      "template": "{{character}} is in {{position}}. {{creature_description}} exhibits {{behavior_pattern}}. Primary action: {{primary_action}}. Camera {{camera_movement}}. Intensity {{intensity_pattern}}. {{consistency_note}}",
      "required_params": ["character", "position", "creature_description", "behavior_pattern", "primary_action"],
      "optional_params": ["camera_movement", "intensity_pattern", "consistency_note"]
    }
  },
  "action_blocks": [
    {
      "id": "werewolf_possession_rotate_v2",
      "kind": "single_state",
      "prompt": "[YOUR COLLABORATIVE PROMPT HERE]",
      "tags": {
        "creature": "werewolf",
        "intensity": 9,
        "content_rating": "intimate"
      },
      "cameraMovement": {
        "type": "rotation",
        "speed": "slow",
        "path": "circular"
      },
      "consistency": {
        "maintainPose": true,
        "preserveLighting": true,
        "preserveClothing": true
      },
      "durationSec": 8.0
    }
  ]
}
```

### Step 2: Load the Package

Tell the user to run this Python snippet to load your package:

```python
from pixsim7.backend.main.domain.narrative.action_blocks.package_loader import PackageLoader

loader = PackageLoader()
loader.load_package("werewolf_advanced_pack.json")
```

---

## 🔧 Method 2: Direct Template Injection

When you need to create a reusable template for variations:

### Step 1: Identify the Pattern

When working with a user's prompt, identify:
- **Fixed elements** (always the same)
- **Variable elements** (change between uses)
- **Optional elements** (may or may not be present)

### Step 2: Create Template Structure

```python
# Add this to a new file: custom_templates.py

CUSTOM_TEMPLATE = {
    "id": "unique_template_id",
    "name": "Descriptive Name",
    "template": """
{{character}} in {{initial_state}}.
{{creature}} performs {{action}} with {{detail_level}} intensity.
Camera {{camera_behavior}}.
{{consistency_requirements}}.
    """,
    "required_params": ["character", "creature", "action"],
    "optional_params": ["initial_state", "detail_level", "camera_behavior", "consistency_requirements"]
}
```

### Step 3: Test Your Template

```python
# Test snippet for the user to verify
from pixsim7.backend.main.domain.narrative.action_blocks.generation_templates import template_library

# Your filled parameters
params = {
    "character": "She",
    "creature": "werewolf",
    "action": "grips possessively",
    "initial_state": "standing position",
    "detail_level": "extreme",
    "camera_behavior": "slowly rotates",
    "consistency_requirements": "Lighting and position remain unchanged"
}

# Generate the prompt
result = template_library.fill_template("unique_template_id", params)
print(result)
```

---

## 🎨 Method 3: Prompt Engineering Guidelines

When creating prompts with users, follow this structure for best results:

### Optimal Prompt Structure

```
1. CHARACTER SETUP (1-2 sentences)
   - Position/pose
   - Initial state/mood
   - Maintained elements

2. CREATURE/PARTNER INTRODUCTION (2-3 sentences)
   - Appearance description
   - Initial positioning
   - Special characteristics

3. PRIMARY ACTION SEQUENCE (3-4 sentences)
   - Main physical interactions
   - Detailed movement descriptions
   - Sensory details

4. PROGRESSION/ESCALATION (2-3 sentences)
   - How intensity changes
   - Character responses
   - Creature reactions

5. CAMERA BEHAVIOR (1 sentence)
   - Movement type and speed
   - What to focus on

6. CONSISTENCY NOTES (1 sentence)
   - What remains unchanged
   - Technical requirements
```

### Example Prompt Analysis (One Pattern)

```markdown
ORIGINAL USER PROMPT:
"A vampire seduces her while she's frozen in place"

ENHANCED COLLABORATIVE PROMPT:
"She stands frozen in place, unable to move, eyes wide with anticipation.
The vampire materializes behind her, cold presence making her shiver,
pale hands hovering just above her skin.
His fingers trace patterns in the air above her shoulders, never quite touching,
creating an electric tension. His hypnotic gaze locks onto her reflection
in the mirror ahead. She watches helplessly as his fangs extend.
Intensity builds as he leans closer, cold breath on her neck.
Camera slowly circles them, capturing the tension from all angles.
She remains completely frozen throughout, only her breathing changes."
```

This “frozen in place” pattern is **just one** style. When you generate broader libraries, deliberately mix in other patterns where:
- Both characters move together (e.g., walking toward a wall, sitting down, shifting positions on a couch).
- The lead moves more and the partner reacts.
- The partner moves more while the lead reacts.

Use the JSON `consistency` flags to control this on a per-block basis (some with `maintainPose: true`, many with it `false`), so the overall library has healthy movement variety instead of defaulting to static poses.

---

## 🚀 Quick Injection Workflows

### Workflow A: User Has Complete Prompt

1. User provides finished prompt
2. You create a JSON block:
```json
{
  "id": "generated_[timestamp]",
  "prompt": "[USER'S PROMPT]",
  "tags": { /* analyze prompt for appropriate tags */ },
  "durationSec": 8.0
}
```
3. Save to: `pixsim7/backend/main/domain/narrative/action_blocks/library/user_generated.json`

### Workflow B: User Wants Variations

1. User provides base concept
2. You create a template with variables
3. Generate 3-5 variations
4. Package them together

### Workflow C: New Creature Type

1. Create creature definition:
```json
{
  "type": "new_creature_name",
  "movement_types": ["walking", "floating"],
  "special_features": ["feature1", "feature2"],
  "unique_actions": ["action1", "action2"]
}
```
2. Create 2-3 example blocks using this creature
3. Package everything together

---

## 📋 Validation Checklist

Before injecting any prompt, verify:

- [ ] **Length**: Between 50-500 words
- [ ] **Structure**: Clear beginning, middle, end
- [ ] **Consistency flags**: Specified what should remain constant
- [ ] **Camera behavior**: Defined if relevant
- [ ] **Content rating**: Appropriately tagged
- [ ] **Duration**: Between 3-12 seconds
- [ ] **Unique ID**: No conflicts with existing IDs

---

## 🔍 Testing Your Injection

### Quick Test Endpoint

After injection, test using:

```bash
POST /api/v1/game/dialogue/actions/test
{
  "original_prompt": "[your prompt]",
  "test_type": "custom_validation"
}
```

### Python Test Script

```python
# Save as test_injection.py
from pixsim7.backend.main.domain.narrative.action_blocks.generator import DynamicBlockGenerator

generator = DynamicBlockGenerator()

# Test your injected content
result = generator.generate_block({
    "concept_type": "your_template_id",
    "parameters": { /* your params */ }
})

print(f"Success: {result.success}")
if result.action_block:
    print(f"Generated prompt: {result.action_block['prompt']}")
```

---

## 💡 Pro Tips for Sonnet

1. **Preserve User Intent**: Always maintain the core essence of what the user wants
2. **Add Technical Details**: Camera, consistency, duration enhance generation quality
3. **Use Existing Patterns**: Check existing templates before creating new ones
4. **Test Incrementally**: Start simple, add complexity gradually
5. **Version Everything**: Keep track of iterations for rollback

---

## 📚 System File Reference

Key files you might need to know about:

```
pixsim7/backend/main/domain/narrative/action_blocks/
├── generator.py           # Main generation engine
├── concepts.py           # Creature and interaction definitions
├── generation_templates.py  # Template system
├── types_v2.py          # Data structures
├── library/             # JSON action blocks
│   ├── bench_park_actions.json
│   ├── bar_lounge_actions.json
│   └── [your_additions].json
└── packages/            # Your packaged content goes here
    └── [your_packages].json
```

---

## 🎯 Quick Command Reference

```python
# Load a package
loader.load_package("package_name.json")

# Test a template
template_library.fill_template("template_id", params)

# Generate from concept
generator.generate_creature_interaction(
    creature_type="werewolf",
    character_name="She",
    intensity=8
)

# Validate a prompt
test_prompt_recreation("your prompt here")
```

---

## 📝 Example Complete Workflow

**User says**: "I want a scene with a dragon protecting someone"

**You (Sonnet) would**:

1. Collaborate to enhance the prompt
2. Create a package file:
```json
{
  "package_info": {
    "name": "dragon_protector",
    "created_date": "2024-01-15",
    "created_with": "User collaboration"
  },
  "action_blocks": [
    {
      "id": "dragon_protective_stance",
      "prompt": "She stands behind the massive dragon, hand resting on its scales. The dragon spreads its wings wide, creating a protective barrier, smoke billowing from its nostrils as it watches for threats. Low rumbling growl vibrates through its body. She feels safe, leaning into its warmth. Camera slowly pans around them, showing the impressive wingspan. The dragon maintains its protective stance throughout.",
      "tags": {
        "creature": "dragon",
        "mood": "protective",
        "intensity": 4
      },
      "cameraMovement": {
        "type": "tracking",
        "speed": "slow",
        "focus": "both_subjects"
      },
      "durationSec": 7.0
    }
  ]
}
```

3. Tell user to save and load it:
```python
# Save as: packages/dragon_protector.json
# Then load with:
loader.load_package("dragon_protector.json")
```

---

This guide should help you (Sonnet) quickly understand and work with the system when users want to create new prompts!
