"""
Generation templates for Claude Sonnet to create action blocks.

These templates can be used to generate new action blocks dynamically,
including testing if we can recreate specific prompts from templates.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum

# Import CreatureType from concepts.py (single source of truth)
from .concepts import CreatureType


@dataclass
class GenerationTemplate:
    """Template for generating action blocks."""
    id: str
    name: str
    description: str
    template_prompt: str
    required_params: List[str]
    optional_params: List[str]
    content_rating_max: str = "mature_implied"

    def fill(self, **kwargs) -> str:
        """Fill template with provided parameters."""
        # Check required params
        for param in self.required_params:
            if param not in kwargs:
                raise ValueError(f"Required parameter '{param}' not provided")

        # Fill template
        prompt = self.template_prompt
        for key, value in kwargs.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in prompt:
                prompt = prompt.replace(placeholder, str(value))

        return prompt


# Core generation templates
TEMPLATES = {

    "creature_interaction_maintained_position": GenerationTemplate(
        id="creature_maintained_pos",
        name="Creature Interaction with Maintained Position",
        description="Character maintains position while creature interacts",
        template_prompt="""
{{character}} maintains {{initial_pose}} throughout in their original pose, body language {{character_state}}.
{{creature_description}} appears {{creature_position}}.
{{primary_interaction}}
{{continuous_actions}}
Camera {{camera_movement}}.
{{character_reactions}} while staying exactly where they started.
{{consistency_notes}}
""",
        required_params=[
            "character",
            "initial_pose",
            "character_state",
            "creature_description",
            "creature_position",
            "primary_interaction",
            "continuous_actions",
            "camera_movement"
        ],
        optional_params=[
            "character_reactions",
            "consistency_notes"
        ]
    ),

    "werewolf_specific": GenerationTemplate(
        id="werewolf_interaction",
        name="Werewolf Creature Interaction",
        description="Specific template matching the original werewolf prompt pattern",
        template_prompt="""
{{lead}} maintains their position throughout in their original pose, body language {{body_language}}.

The werewolf creature - {{creature_appearance}} - appears {{position_relative}}. {{creature_build}}. {{creature_features}}. Frame {{frame_state}}.

Camera begins {{camera_speed}} {{camera_movement}} around them.

{{primary_physical_action}}. {{action_details}}. {{creature_focus}}. {{creature_state}}.

{{lead}} {{character_reaction}} as camera {{camera_continues}}. {{character_action}}. {{creature_response}}. Frame {{frame_reaction}}.

{{escalation_action}}. {{creature_escalation}}. {{creature_intensity}}.

Camera completes {{camera_completion}}. {{lead}} stays in original position. {{creature_final_state}}. {{final_consistency}}.
""",
        required_params=[
            "lead",
            "body_language",
            "creature_appearance",
            "position_relative",
            "creature_build",
            "creature_features",
            "primary_physical_action",
            "action_details",
            "character_reaction",
            "creature_response"
        ],
        optional_params=[
            "frame_state",
            "camera_speed",
            "camera_movement",
            "creature_focus",
            "creature_state",
            "character_action",
            "frame_reaction",
            "escalation_action",
            "creature_escalation",
            "creature_intensity",
            "camera_completion",
            "creature_final_state",
            "final_consistency"
        ]
    ),

    "snake_coiling": GenerationTemplate(
        id="snake_coiling",
        name="Snake Coiling Interaction",
        description="Snake or serpent coiling around character",
        template_prompt="""
{{character}} {{initial_position}}, {{character_mood}}.

{{snake_description}} emerges from {{snake_origin}}. {{snake_appearance}}.

The serpent begins {{coiling_pattern}} around {{body_areas}}. {{texture_description}} creates {{sensory_detail}}.

{{character}} maintains position but {{reaction_description}}. Camera {{camera_movement}} to capture the coiling pattern.

Coils {{tightness_progression}}, {{movement_rhythm}}. {{snake_behavior}}.

{{character_breathing}} as the coiling {{completion_state}}. {{final_position}}.

Camera {{camera_final}}, showing {{visual_emphasis}}. Lighting remains {{lighting_consistency}}.
""",
        required_params=[
            "character",
            "initial_position",
            "snake_description",
            "coiling_pattern",
            "body_areas"
        ],
        optional_params=[
            "character_mood",
            "snake_origin",
            "snake_appearance",
            "texture_description",
            "sensory_detail",
            "reaction_description",
            "camera_movement",
            "tightness_progression",
            "movement_rhythm",
            "snake_behavior",
            "character_breathing",
            "completion_state",
            "final_position",
            "camera_final",
            "visual_emphasis",
            "lighting_consistency"
        ]
    ),

    "dynamic_interaction": GenerationTemplate(
        id="dynamic_interaction",
        name="Dynamic Two-Character Interaction",
        description="Flexible template for various two-character scenes",
        template_prompt="""
{{lead}} and {{partner}} in {{location}}, {{initial_distance}}.

{{initiating_action}} from {{initiator}}. {{action_quality}}.

{{receiving_character}} {{reaction_type}}, {{reaction_detail}}.

{{continuous_elements}} throughout the interaction.

Camera {{camera_behavior}}, {{camera_focus}}.

Intensity {{intensity_pattern}} as {{escalation_detail}}.

{{physical_progression}}. {{emotional_progression}}.

Both maintain {{consistency_elements}} throughout. {{final_state}}.
""",
        required_params=[
            "lead",
            "partner",
            "location",
            "initiating_action",
            "initiator"
        ],
        optional_params=[
            "initial_distance",
            "action_quality",
            "receiving_character",
            "reaction_type",
            "reaction_detail",
            "continuous_elements",
            "camera_behavior",
            "camera_focus",
            "intensity_pattern",
            "escalation_detail",
            "physical_progression",
            "emotional_progression",
            "consistency_elements",
            "final_state"
        ]
    )
}


class TemplateGenerator:
    """Generate action blocks from templates."""

    @staticmethod
    def generate_werewolf_recreation() -> Dict[str, Any]:
        """
        Recreate the original werewolf prompt using our template system.
        This tests if we can match the original complexity.
        """
        template = TEMPLATES["werewolf_specific"]

        filled_prompt = template.fill(
            lead="She",
            body_language="deliberately provocative. Testing how far she can push him while aware she's being watched",
            creature_appearance="3D realistic render, photorealistic with subtle cartoon expressiveness",
            position_relative="behind her pressed close",
            creature_build="Bulky muscular build covered in dense charcoal fur, powerful shoulders and chest",
            creature_features="Lupine features showing elongated muzzle with somewhat sly cunning expression, sharp yellow eyes with blown pupils, alert pointed ears, large clawed hands",
            frame_state="trembles violently. Struggling to maintain control",
            camera_speed="slow",
            camera_movement="rotation",
            primary_physical_action="His hands grip her buttocks possessively",
            action_details="fingers spreading wide then squeezing, kneading rhythmically. Palms pressing in deeply then dragging across soft curves. Alternating pressure, constant motion",
            creature_focus="Muzzle lowers to her lower back, sniffing along her skin",
            creature_state="Yellow eyes impossibly wide, focused entirely on her. Tongue lolling out, saliva dripping. Continuous low whining",
            character_reaction="glances toward camera with challenging expression",
            camera_continues="rotates past",
            character_action="turning only her head, keeping her position. \"Watch this\" energy. Then deliberately arches harder while staying in place",
            creature_response="His muzzle follows, sniffing along her spine. Nose trailing across her skin. Hands knead frantically - gripping, releasing, gripping harder",
            frame_reaction="shudders violently",
            escalation_action="She rolls her hips slowly without changing orientation",
            creature_escalation="His muzzle pressed closer, inhaling desperately",
            creature_intensity="Hands squeezing compulsively. Tongue hanging, saliva dripping steadily",
            camera_completion="rotation",
            creature_final_state="His muzzle pressed close, sniffing constantly. Hands gripping rhythmically",
            final_consistency="Her appearance and lighting remain consistent throughout"
        )

        return {
            "id": "werewolf_possession_rotation",
            "kind": "single_state",
            "tags": {
                "location": "dark_chamber",
                "pose": "standing_provocative",
                "intimacy_level": "very_intimate",
                "mood": "intense",
                "content_rating": "mature_implied",
                "requires_age_verification": False,
                "intensity": 9,
                "branch_type": "maintain",
                "custom": ["creature", "werewolf", "maintained_position"]
            },
            "referenceImage": {
                "tags": ["standing", "provocative", "creature_scene"],
                "crop": "full_body"
            },
            "isImageToVideo": True,
            "startPose": "standing_provocative",
            "endPose": "standing_provocative",
            "cameraMovement": {
                "type": "rotation",
                "speed": "slow",
                "path": "circular",
                "focus": "both_subjects"
            },
            "consistency": {
                "maintainPose": True,
                "preserveLighting": True,
                "preserveClothing": True,
                "preservePosition": True
            },
            "intensityProgression": {
                "start": 7,
                "peak": 9,
                "end": 8,
                "pattern": "building"
            },
            "prompt": filled_prompt,
            "style": "photorealistic_dramatic",
            "durationSec": 8.0,
            "compatibleNext": ["creature_climax", "creature_withdrawal", "character_turn"],
            "compatiblePrev": ["creature_approach", "character_tease"]
        }

    @staticmethod
    def generate_from_concept(
        concept: str,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate an action block from a concept and parameters."""
        if concept not in TEMPLATES:
            raise ValueError(f"Unknown concept template: {concept}")

        template = TEMPLATES[concept]
        filled_prompt = template.fill(**parameters)

        # Build action block structure
        return {
            "id": f"{concept}_generated_{hash(filled_prompt) % 10000}",
            "kind": "single_state",
            "tags": {
                "generated": True,
                "template_id": concept,
                "content_rating": template.content_rating_max
            },
            "prompt": filled_prompt,
            "durationSec": 8.0,
            # Other fields would be filled based on parameters
        }


def test_prompt_recreation(original_prompt: str) -> float:
    """
    Test how closely our template system can recreate the original prompt.

    Returns similarity score 0.0 to 1.0
    """
    generated_block = TemplateGenerator.generate_werewolf_recreation()
    generated_prompt = generated_block["prompt"]

    # Simple similarity check (would use better NLP in production)
    original_words = set(original_prompt.lower().split())
    generated_words = set(generated_prompt.lower().split())

    intersection = original_words & generated_words
    union = original_words | generated_words

    jaccard_similarity = len(intersection) / len(union) if union else 0

    # Check key phrases
    key_phrases = [
        "maintains her position throughout",
        "camera begins slow rotation",
        "gripping, releasing, gripping harder",
        "appearance and lighting remain consistent"
    ]

    phrase_matches = sum(1 for phrase in key_phrases if phrase in generated_prompt.lower())
    phrase_score = phrase_matches / len(key_phrases)

    # Combined score
    final_score = (jaccard_similarity * 0.6) + (phrase_score * 0.4)

    return final_score


# Sonnet prompt for generating new templates
SONNET_TEMPLATE_GENERATION_PROMPT = """
You are creating action block templates for a visual generation system.

Given this concept: {concept}
With these requirements: {requirements}

Generate a template following this structure:

1. CHARACTER SETUP
   - Initial position and state
   - Mood and body language

2. ENTITY/PARTNER INTRODUCTION
   - Appearance and characteristics
   - Initial positioning

3. PRIMARY INTERACTION
   - Main action or movement
   - Physical details

4. CONTINUOUS ELEMENTS
   - Actions happening throughout
   - Rhythms and patterns

5. CAMERA BEHAVIOR
   - Movement type and speed
   - Focus points

6. PROGRESSION/ESCALATION
   - How intensity changes
   - Character reactions

7. CONSISTENCY NOTES
   - What remains unchanged
   - Technical requirements

Output as a GenerationTemplate with:
- Clear template_prompt with {{placeholders}}
- List of required_params
- List of optional_params
- Appropriate content_rating_max

Keep content at "intimate" maximum, no explicit sexual content.
Focus on tension, movement, and emotional intensity.
"""

# ============================================================================
# Template Library and Helper Classes
# ============================================================================

class TemplateType(str, Enum):
    """Types of templates available"""
    CREATURE_INTERACTION = "creature_interaction"
    MOVEMENT = "movement"
    TRANSITION = "transition"
    DIALOGUE = "dialogue"
    ACTION = "action"


class TemplateLibrary:
    """
    Library for managing and accessing generation templates.
    Provides methods for retrieving templates by ID or type.
    """

    def __init__(self, templates: Dict[str, GenerationTemplate]):
        self.templates = templates

    def get_template(self, template_id: str) -> Optional[GenerationTemplate]:
        """Get a template by its ID."""
        return self.templates.get(template_id)

    def get_templates_by_type(self, template_type: str) -> List[GenerationTemplate]:
        """
        Get all templates matching a certain type/category.
        Currently returns all templates as we don't have explicit type categorization yet.
        """
        # For now, return all templates
        # TODO: Add type categorization to templates
        return list(self.templates.values())

    def fill_template(self, template_id: str, **kwargs) -> str:
        """Fill a template with the provided parameters."""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template '{template_id}' not found")
        return template.fill(**kwargs)


class PromptLayerBuilder:
    """
    Helper for building layered prompts from templates.
    Allows composing multiple template elements.
    """

    def __init__(self):
        self.layers: List[str] = []

    def add_layer(self, content: str) -> 'PromptLayerBuilder':
        """Add a content layer to the prompt."""
        self.layers.append(content)
        return self

    def build(self) -> str:
        """Build the final prompt from all layers."""
        return "\n\n".join(self.layers)


# Global template library instance
template_library = TemplateLibrary(TEMPLATES)
