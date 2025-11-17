"""
Dynamic action block generator using templates and Claude Sonnet integration.
Combines concept library with templates to generate novel action blocks.
"""

import json
import hashlib
from typing import Dict, Any, List, Optional, Union
from datetime import datetime
from dataclasses import dataclass, asdict

from .types_v2 import (
    EnhancedSingleStateBlock,
    EnhancedTransitionBlock,
    EnhancedActionBlockTags,
    CameraMovement,
    CameraMovementType,
    CameraSpeed,
    CameraPath,
    ConsistencyFlags,
    IntensityProgression,
    IntensityPattern,
    ContentRating
)
from .types import BranchIntent
from .concepts import (
    CreatureType,
    MovementType,
    InteractionType,
    BodyArea,
    concept_library
)
from .generation_templates import (
    template_library,
    PromptLayerBuilder,
    TemplateType
)


@dataclass
class PreviousSegmentSnapshot:
    """Snapshot data describing the previous media segment for continuity."""
    block_id: Optional[str] = None
    segment_id: Optional[str] = None
    asset_id: Optional[int] = None
    asset_url: Optional[str] = None
    pose: Optional[str] = None
    intensity: Optional[int] = None
    tags: Optional[List[str]] = None
    mood: Optional[str] = None
    branch_intent: Optional[str] = None
    summary: Optional[str] = None


@dataclass
class GenerationRequest:
    """Request for generating a new action block."""
    concept_type: str  # e.g., "creature_interaction", "position_maintenance"
    parameters: Dict[str, Any]
    content_rating: ContentRating = ContentRating.GENERAL
    duration: float = 6.0
    camera_settings: Optional[Dict[str, Any]] = None
    consistency_settings: Optional[Dict[str, Any]] = None
    intensity_settings: Optional[Dict[str, Any]] = None
    previous_segment: Optional[PreviousSegmentSnapshot] = None


@dataclass
class GenerationResult:
    """Result of action block generation."""
    success: bool
    action_block: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    generation_time: float = 0.0
    template_used: Optional[str] = None


class DynamicBlockGenerator:
    """Generates action blocks dynamically from concepts and templates."""

    def __init__(self, use_claude_api: bool = False):
        """
        Initialize generator.

        Args:
            use_claude_api: Whether to use Claude Sonnet for advanced generation
        """
        self.use_claude_api = use_claude_api
        self.concept_library = concept_library
        self.template_library = template_library
        self.generation_cache = {}

    def generate_block(self, request: GenerationRequest) -> GenerationResult:
        """
        Generate a new action block from a request.

        Args:
            request: Generation request with parameters

        Returns:
            GenerationResult with the generated block or error
        """
        start_time = datetime.now()

        try:
            # Check cache first
            cache_key = self._get_cache_key(request)
            if cache_key in self.generation_cache:
                cached_result = self.generation_cache[cache_key]
                cached_result.generation_time = 0.001  # Indicate cached
                return cached_result

            # Select appropriate template
            template = self._select_template(request)
            if not template:
                return GenerationResult(
                    success=False,
                    error_message=f"No template found for concept: {request.concept_type}"
                )

            # Generate prompt using template
            prompt = self._generate_prompt(template, request)
            if not prompt:
                return GenerationResult(
                    success=False,
                    error_message="Failed to generate prompt from template"
                )

            # Build action block structure
            action_block = self._build_action_block(
                prompt=prompt,
                request=request,
                template_id=template.id
            )

            # Validate the generated block
            validation_errors = self._validate_block(action_block)
            if validation_errors:
                return GenerationResult(
                    success=False,
                    error_message=f"Validation errors: {', '.join(validation_errors)}"
                )

            # Cache successful generation
            result = GenerationResult(
                success=True,
                action_block=action_block,
                generation_time=(datetime.now() - start_time).total_seconds(),
                template_used=template.id
            )
            self.generation_cache[cache_key] = result

            return result

        except Exception as e:
            return GenerationResult(
                success=False,
                error_message=f"Generation error: {str(e)}",
                generation_time=(datetime.now() - start_time).total_seconds()
            )

    def generate_creature_interaction(
        self,
        creature_type: CreatureType,
        character_name: str = "She",
        position: str = "standing",
        intensity: int = 5,
        previous_segment: Optional[PreviousSegmentSnapshot] = None,
        **kwargs
    ) -> GenerationResult:
        """
        Specialized method for generating creature interactions.

        Args:
            creature_type: Type of creature
            character_name: Name/pronoun for the character
            position: Character's position
            intensity: Intensity level (1-10)
            **kwargs: Additional parameters

        Returns:
            GenerationResult with creature interaction block
        """
        # Get creature properties
        creature = self.concept_library.get_creature(creature_type)
        if not creature:
            return GenerationResult(
                success=False,
                error_message=f"Unknown creature type: {creature_type}"
            )

        # Build parameters for template
        params = {
            "character": character_name,
            "position": position,
            "original_pose": f"{position}_pose",
            "creature_description": self._build_creature_description(creature),
            "relative_position": kwargs.get("relative_position", "behind them"),
            "primary_action": self._select_primary_action(creature, intensity),
            "action_details": self._build_action_details(creature, intensity),
            "continuous_actions": self._build_continuous_actions(creature),
            "character_reaction": kwargs.get("character_reaction", "responds"),
            "consistency_notes": "Appearance and lighting remain consistent",
            "camera_movement": kwargs.get("camera_movement", "begins slow rotation")
        }

        # Add any additional parameters
        params.update(kwargs)

        # Create generation request
        request = GenerationRequest(
            concept_type="creature_maintain_position",
            parameters=params,
            content_rating=self._determine_content_rating(intensity),
            duration=kwargs.get("duration", 8.0),
            camera_settings={
                "type": CameraMovementType.ROTATION,
                "speed": CameraSpeed.SLOW,
                "path": CameraPath.CIRCULAR
            },
            consistency_settings={
                "maintainPose": True,
                "preservePosition": True,
                "preserveLighting": True
            },
            intensity_settings={
                "start": max(1, intensity - 1),
                "peak": intensity,
                "end": max(1, intensity - 2),
                "pattern": IntensityPattern.BUILDING
            },
            previous_segment=previous_segment
        )

        return self.generate_block(request)

    def _apply_continuation_context(self, prompt: str, request: GenerationRequest) -> str:
        """Append continuation instructions if previous segment snapshot provided."""
        previous = request.previous_segment
        if not previous:
            return prompt

        continuation_lines: List[str] = []
        if previous.summary:
            continuation_lines.append(previous.summary.strip())
        else:
            if previous.block_id:
                continuation_lines.append(f"Continue directly from segment '{previous.block_id}'.")
            if previous.pose:
                continuation_lines.append(f"Characters begin already in pose '{previous.pose}'.")
            if previous.mood:
                continuation_lines.append(f"Maintain the '{previous.mood}' mood.")
        if previous.tags:
            continuation_lines.append(f"Preserve visual cues: {', '.join(previous.tags)}.")
        if previous.intensity:
            continuation_lines.append(f"Resume around intensity level {previous.intensity} and flow naturally.")

        if not continuation_lines:
            return prompt

        base_prompt = prompt.strip()
        continuation_notes = "\n".join(continuation_lines)
        return f"{base_prompt}\n\nContinuation Notes:\n{continuation_notes}"

    def generate_with_claude(
        self,
        concept: str,
        requirements: str,
        content_rating: ContentRating = ContentRating.GENERAL
    ) -> GenerationResult:
        """
        Generate using Claude Sonnet API (placeholder for actual implementation).

        Args:
            concept: Concept description
            requirements: Specific requirements
            content_rating: Maximum content rating

        Returns:
            GenerationResult with Claude-generated block
        """
        # This would integrate with Claude API in production
        # For now, return a placeholder
        return GenerationResult(
            success=False,
            error_message="Claude API integration not yet implemented"
        )

    def _select_template(self, request: GenerationRequest):
        """Select the best template for the request."""
        # Try exact match first
        template = self.template_library.get_template(request.concept_type)
        if template:
            return template

        # Try to find by type
        template_type_map = {
            "creature": TemplateType.CREATURE_INTERACTION,
            "position": TemplateType.POSITION_MAINTENANCE,
            "progressive": TemplateType.PROGRESSIVE_INTENSITY,
            "exploration": TemplateType.EXPLORATION,
            "transformation": TemplateType.TRANSFORMATION,
            "multi": TemplateType.MULTI_ENTITY
        }

        for key, template_type in template_type_map.items():
            if key in request.concept_type.lower():
                templates = self.template_library.get_templates_by_type(template_type)
                if templates:
                    return templates[0]

        return None

    def _generate_prompt(self, template, request: GenerationRequest) -> Optional[str]:
        """Generate prompt from template and parameters."""
        try:
            # Use template library's fill method
            include_camera = request.camera_settings is not None
            prompt = self.template_library.fill_template(
                template.id,
                request.parameters,
                include_camera=include_camera
            )
            prompt = self._apply_continuation_context(prompt, request)
            return prompt
        except Exception as e:
            print(f"Error generating prompt: {e}")
            return None

    def _build_action_block(
        self,
        prompt: str,
        request: GenerationRequest,
        template_id: str
    ) -> Dict[str, Any]:
        """Build complete action block structure."""
        # Generate unique ID
        block_id = f"gen_{template_id}_{self._generate_id(prompt)}"

        previous = request.previous_segment

        # Build tags
        tags = EnhancedActionBlockTags(
            content_rating=request.content_rating,
            intensity=request.parameters.get("intensity") or (previous.intensity if previous and previous.intensity else 5),
            custom=["generated", f"template:{template_id}"]
        )
        if previous:
            if previous.pose:
                tags.pose = previous.pose
            if previous.mood:
                tags.mood = previous.mood
            if previous.tags:
                tags.custom.extend([f"prev:{tag}" for tag in previous.tags])

            branch_value = request.parameters.get("branch_type") or previous.branch_intent
            if branch_value:
                try:
                    tags.branch_type = BranchIntent(branch_value)
                except ValueError:
                    tags.branch_type = None

        # Build camera movement
        camera = None
        if request.camera_settings:
            camera = CameraMovement(
                type=request.camera_settings.get("type", CameraMovementType.STATIC),
                speed=request.camera_settings.get("speed"),
                path=request.camera_settings.get("path"),
                focus=request.camera_settings.get("focus", "subjects")
            )

        # Build consistency flags
        consistency = None
        if request.consistency_settings:
            consistency = ConsistencyFlags(**request.consistency_settings)

        # Build intensity progression
        intensity_prog = None
        if request.intensity_settings:
            intensity_prog = IntensityProgression(
                start=request.intensity_settings.get("start", 5),
                peak=request.intensity_settings.get("peak", 7),
                end=request.intensity_settings.get("end", 5),
                pattern=request.intensity_settings.get("pattern", IntensityPattern.STEADY)
            )

        # Determine reference image
        reference_image = request.parameters.get("reference_image")
        if not reference_image and previous:
            reference_image = {
                "tags": previous.tags or ["continuation"],
                "crop": request.parameters.get("reference_crop", "full_body")
            }
            if previous.asset_id:
                reference_image["assetId"] = previous.asset_id
            elif previous.asset_url:
                reference_image["url"] = previous.asset_url

        if not reference_image:
            reference_image = {
                "tags": ["generated"],
                "crop": "full_body"
            }

        # Determine poses (default to previous pose if provided)
        start_pose = request.parameters.get("start_pose") or (previous.pose if previous and previous.pose else "neutral")
        end_pose = request.parameters.get("end_pose") or start_pose

        # Create the block
        block = EnhancedSingleStateBlock(
            id=block_id,
            tags=tags,
            referenceImage=reference_image,
            startPose=start_pose,
            endPose=end_pose,
            prompt=prompt,
            cameraMovement=camera,
            consistency=consistency,
            intensityProgression=intensity_prog,
            durationSec=request.duration
        )

        # Convert to dict and clean up
        block_dict = block.dict(exclude_none=True, by_alias=True)
        return block_dict

    def _validate_block(self, block: Dict[str, Any]) -> List[str]:
        """Validate generated block for correctness."""
        errors = []

        # Check required fields
        required_fields = ["id", "kind", "prompt", "startPose", "endPose"]
        for field in required_fields:
            if field not in block or not block[field]:
                errors.append(f"Missing required field: {field}")

        # Check prompt length
        if "prompt" in block and len(block["prompt"]) < 10:
            errors.append("Prompt too short")

        # Check duration
        if "durationSec" in block:
            duration = block["durationSec"]
            if duration < 3.0 or duration > 12.0:
                errors.append(f"Duration {duration} out of range (3-12 seconds)")

        return errors

    def _get_cache_key(self, request: GenerationRequest) -> str:
        """Generate cache key for request."""
        key_data = {
            "concept": request.concept_type,
            "params": sorted(request.parameters.items()),
            "rating": request.content_rating
        }
        if request.previous_segment:
            key_data["previous"] = {
                "block": request.previous_segment.block_id,
                "asset": request.previous_segment.asset_id,
                "url": request.previous_segment.asset_url,
                "pose": request.previous_segment.pose
            }
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()

    def _generate_id(self, prompt: str) -> str:
        """Generate unique ID based on prompt."""
        return hashlib.md5(prompt.encode()).hexdigest()[:8]

    def _build_creature_description(self, creature) -> str:
        """Build creature description from properties."""
        features = " ".join(creature.special_features[:3])
        return f"A {creature.size_category} {creature.type.value} with {features}"

    def _select_primary_action(self, creature, intensity: int) -> str:
        """Select primary action based on creature and intensity."""
        if intensity < 4:
            return f"The {creature.type.value} approaches cautiously"
        elif intensity < 7:
            return f"The {creature.type.value} makes direct contact"
        else:
            return f"The {creature.type.value} engages intensely"

    def _build_action_details(self, creature, intensity: int) -> str:
        """Build detailed action description."""
        actions = creature.unique_actions[:min(3, intensity // 3 + 1)]
        return f"using {', '.join(actions)}"

    def _build_continuous_actions(self, creature) -> str:
        """Build continuous action description."""
        if creature.unique_actions:
            return f"Continuous {creature.unique_actions[0]}"
        return "Maintaining contact"

    def _determine_content_rating(self, intensity: int) -> ContentRating:
        """Determine content rating based on intensity."""
        if intensity <= 3:
            return ContentRating.GENERAL
        elif intensity <= 5:
            return ContentRating.SUGGESTIVE
        elif intensity <= 7:
            return ContentRating.INTIMATE
        else:
            return ContentRating.EXPLICIT


# Singleton instance
generator = DynamicBlockGenerator()
