"""
Prompt builder with layered construction for complex action blocks.

This module provides internal logic for constructing rich, structured prompts
from action blocks, handling camera directions, consistency notes, and more.
"""

from typing import List, Optional, Dict, Any
from .types_v2 import (
    CameraMovement,
    ConsistencyFlags,
    IntensityProgression,
    CameraMovementType,
    IntensityPattern
)


class LayeredPromptBuilder:
    """
    Builds structured prompts from layers, keeping the complexity
    internal while exposing simple strings to the schema.
    """

    @staticmethod
    def build_camera_direction(camera: CameraMovement) -> str:
        """Convert camera metadata to natural language direction."""
        if camera.type == CameraMovementType.STATIC:
            return "Camera remains static, focused on subjects."

        speed_text = camera.speed.value if camera.speed else "steady"

        if camera.type == CameraMovementType.ROTATION:
            path_text = camera.path.value if camera.path else "circular"
            return f"Camera begins {speed_text} {path_text} rotation around {camera.focus}."

        elif camera.type == CameraMovementType.DOLLY:
            direction = "in" if camera.path == "linear" else "along arc"
            return f"Camera dollies {direction} at {speed_text} pace, maintaining focus on {camera.focus}."

        elif camera.type == CameraMovementType.TRACKING:
            return f"Camera tracks {camera.focus} with {speed_text} following movement."

        elif camera.type == CameraMovementType.HANDHELD:
            return f"Handheld camera with natural movement, {speed_text} pace, following {camera.focus}."

        return ""

    @staticmethod
    def build_consistency_notes(consistency: ConsistencyFlags) -> str:
        """Convert consistency flags to natural language instructions."""
        notes = []

        if consistency.maintainPose:
            notes.append("Character maintains original pose throughout")

        if consistency.preserveLighting:
            notes.append("Lighting remains consistent")

        if consistency.preserveClothing:
            notes.append("Clothing state unchanged")

        if consistency.preservePosition:
            notes.append("Characters stay in their positions")

        if notes:
            return ". ".join(notes) + "."
        return ""

    @staticmethod
    def build_intensity_direction(progression: IntensityProgression) -> str:
        """Convert intensity progression to prompt guidance."""
        if progression.pattern == IntensityPattern.STEADY:
            return f"Maintain steady intensity level throughout."

        elif progression.pattern == IntensityPattern.BUILDING:
            if progression.peak > progression.start:
                return f"Intensity builds from subtle to more pronounced, peaking near the end."
            return f"Intensity gradually increases throughout."

        elif progression.pattern == IntensityPattern.PULSING:
            return f"Intensity pulses and varies, creating dynamic rhythm."

        elif progression.pattern == IntensityPattern.DECLINING:
            return f"Intensity gradually decreases, becoming calmer toward the end."

        return ""

    @classmethod
    def build_layered_prompt(
        cls,
        setup: str,
        primary_action: str,
        continuous_actions: Optional[List[str]] = None,
        camera_movement: Optional[CameraMovement] = None,
        consistency: Optional[ConsistencyFlags] = None,
        intensity: Optional[IntensityProgression] = None,
        custom_notes: Optional[str] = None
    ) -> str:
        """
        Build a complete prompt from structured layers.

        This is the internal logic that combines all elements into
        a cohesive prompt while keeping the schema simple.
        """
        sections = []

        # Opening setup
        sections.append(setup)

        # Main action
        sections.append(primary_action)

        # Continuous/background actions
        if continuous_actions:
            sections.append(" ".join(continuous_actions))

        # Camera direction
        if camera_movement:
            camera_text = cls.build_camera_direction(camera_movement)
            if camera_text:
                sections.append(camera_text)

        # Intensity guidance
        if intensity:
            intensity_text = cls.build_intensity_direction(intensity)
            if intensity_text:
                sections.append(intensity_text)

        # Consistency requirements
        if consistency:
            consistency_text = cls.build_consistency_notes(consistency)
            if consistency_text:
                sections.append(consistency_text)

        # Custom notes
        if custom_notes:
            sections.append(custom_notes)

        return "\n\n".join(sections)

    @staticmethod
    def extract_continuous_actions(full_prompt: str) -> List[str]:
        """
        Extract continuous/ongoing actions from a prompt.

        This helps identify patterns like "constantly", "throughout",
        "continuous", etc.
        """
        continuous_keywords = [
            "throughout", "constantly", "continuously", "ongoing",
            "maintaining", "rhythmically", "repeatedly", "persistently"
        ]

        actions = []
        sentences = full_prompt.split(".")

        for sentence in sentences:
            if any(keyword in sentence.lower() for keyword in continuous_keywords):
                actions.append(sentence.strip())

        return actions

    @staticmethod
    def enhance_prompt_with_metadata(
        base_prompt: str,
        metadata: Dict[str, Any]
    ) -> str:
        """
        Enhance a base prompt with additional metadata.

        This allows adding context without modifying the core prompt.
        """
        enhancements = []

        # Add character details if present
        if "character_appearance" in metadata:
            enhancements.append(metadata["character_appearance"])

        # Add environment details
        if "environment" in metadata:
            enhancements.append(f"Setting: {metadata['environment']}")

        # Add mood/atmosphere
        if "atmosphere" in metadata:
            enhancements.append(f"Atmosphere: {metadata['atmosphere']}")

        if enhancements:
            enhancement_text = ". ".join(enhancements)
            return f"{enhancement_text}\n\n{base_prompt}"

        return base_prompt


class PromptTemplate:
    """
    Templates for common prompt patterns.

    These help Claude Sonnet generate consistent action blocks.
    """

    INTIMATE_INTERACTION = """
{{lead}} and {{partner}} in {{location}}.

{{primary_action}}

{{continuous_elements}}

{{camera_direction}}

{{consistency_notes}}
"""

    SOLO_EXPRESSION = """
{{lead}} at {{location}}, {{mood}} mood.

{{primary_action}}

{{expression_changes}}

{{camera_direction}}

Maintain {{lead}}'s appearance and lighting throughout.
"""

    TRANSITION_MOVEMENT = """
Smooth transition as {{lead}} moves from {{start_position}} to {{end_position}}.

{{movement_description}}

{{pacing_notes}}

{{camera_direction}}

Keep character appearance consistent throughout transition.
"""

    DYNAMIC_INTERACTION = """
{{lead}} and {{partner}} engage in {{interaction_type}} at {{location}}.

{{setup}}

{{escalation}}

{{continuous_actions}}

{{camera_movement}}

Both characters' appearances remain consistent. {{intensity_notes}}
"""

    @classmethod
    def get_template(cls, template_type: str) -> str:
        """Get a template by type name."""
        templates = {
            "intimate": cls.INTIMATE_INTERACTION,
            "solo": cls.SOLO_EXPRESSION,
            "transition": cls.TRANSITION_MOVEMENT,
            "dynamic": cls.DYNAMIC_INTERACTION
        }
        return templates.get(template_type, cls.INTIMATE_INTERACTION)