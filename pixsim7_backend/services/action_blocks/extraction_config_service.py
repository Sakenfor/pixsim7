"""Extraction Config Service - Manage different AI extraction strategies

Provides different "prompt-parse configs" that users can choose from when importing prompts:
- Balanced: Default strategy with balanced extraction
- Aggressive: Maximum granularity, extracts smallest reusable components
- Conservative: Keep related content together, fewer but larger blocks
- Narrative: Optimized for story-focused prompts
- Technical: Optimized for technical/camera-focused prompts
- Custom: User-defined strategies

Each config includes:
- Extraction mode parameters
- Concept discovery sensitivity
- Block size preferences
- Tag generation rules
"""
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel, Field


class ExtractionConfig(BaseModel):
    """Configuration for AI prompt extraction"""
    config_id: str = Field(..., description="Unique config identifier")
    name: str = Field(..., description="Display name")
    description: str = Field(..., description="What this config does")
    extraction_mode: str = Field(default="auto", description="auto, aggressive, or conservative")
    min_block_chars: int = Field(default=150, description="Minimum characters per block")
    max_block_chars: int = Field(default=500, description="Maximum characters per block")
    target_block_count: Optional[int] = Field(None, description="Target number of blocks (if None, AI decides)")

    # Concept discovery settings
    concept_discovery_enabled: bool = Field(default=True, description="Enable concept discovery")
    concept_threshold: float = Field(default=0.5, description="Reusability threshold for concepts (0-1)")
    auto_confirm_generic: bool = Field(default=False, description="Auto-confirm generic concepts")

    # Block type preferences
    preferred_block_types: List[str] = Field(default_factory=list, description="Preferred block types to extract")
    required_tags: List[str] = Field(default_factory=list, description="Tags that must be included")

    # AI instructions
    custom_instructions: Optional[str] = Field(None, description="Additional instructions for AI")

    # Metadata
    is_system: bool = Field(default=True, description="System config vs user-created")
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExtractionConfigService:
    """Service for managing extraction configurations"""

    def __init__(self):
        """Initialize with default system configs"""
        self.system_configs = self._create_system_configs()

    def _create_system_configs(self) -> Dict[str, ExtractionConfig]:
        """Create default system configurations"""
        return {
            "balanced": ExtractionConfig(
                config_id="balanced",
                name="Balanced",
                description="Default balanced extraction - good for most prompts (4-6 blocks)",
                extraction_mode="auto",
                min_block_chars=200,
                max_block_chars=400,
                target_block_count=5,
                concept_discovery_enabled=True,
                concept_threshold=0.5,
                auto_confirm_generic=False,
                preferred_block_types=[],
                is_system=True
            ),

            "aggressive": ExtractionConfig(
                config_id="aggressive",
                name="Aggressive / Granular",
                description="Maximum granularity - extracts smallest reusable components (8-12 blocks)",
                extraction_mode="aggressive",
                min_block_chars=150,
                max_block_chars=300,
                target_block_count=10,
                concept_discovery_enabled=True,
                concept_threshold=0.3,  # Lower threshold = more concepts
                auto_confirm_generic=True,
                preferred_block_types=[],
                custom_instructions="Extract as many granular, atomic blocks as possible. "
                                   "Split complex descriptions into multiple simple blocks.",
                is_system=True
            ),

            "conservative": ExtractionConfig(
                config_id="conservative",
                name="Conservative / Minimal",
                description="Keep related content together - fewer but larger blocks (2-4 blocks)",
                extraction_mode="conservative",
                min_block_chars=300,
                max_block_chars=600,
                target_block_count=3,
                concept_discovery_enabled=True,
                concept_threshold=0.7,  # Higher threshold = fewer concepts
                auto_confirm_generic=False,
                preferred_block_types=[],
                custom_instructions="Extract only major, distinct components. "
                                   "Keep logically related content together.",
                is_system=True
            ),

            "narrative": ExtractionConfig(
                config_id="narrative",
                name="Narrative / Story-Focused",
                description="Optimized for story/character-focused prompts",
                extraction_mode="auto",
                min_block_chars=200,
                max_block_chars=500,
                target_block_count=None,
                concept_discovery_enabled=True,
                concept_threshold=0.5,
                auto_confirm_generic=False,
                preferred_block_types=[
                    "character_description",
                    "action_choreography",
                    "reaction_description",
                    "environment_description",
                    "emotion_description"
                ],
                custom_instructions="Focus on narrative elements: characters, actions, emotions, "
                                   "story progression. Extract character arcs and emotional beats.",
                is_system=True
            ),

            "technical": ExtractionConfig(
                config_id="technical",
                name="Technical / Camera-Focused",
                description="Optimized for technical/camera/visual prompts",
                extraction_mode="auto",
                min_block_chars=150,
                max_block_chars=400,
                target_block_count=None,
                concept_discovery_enabled=True,
                concept_threshold=0.6,
                auto_confirm_generic=True,
                preferred_block_types=[
                    "camera_instruction",
                    "lighting_instruction",
                    "continuity_instruction",
                    "style_instruction",
                    "render_instruction"
                ],
                custom_instructions="Focus on technical aspects: camera movements, lighting, "
                                   "rendering style, continuity requirements, visual effects.",
                required_tags=["camera_movement", "lighting", "style"],
                is_system=True
            ),

            "mixed": ExtractionConfig(
                config_id="mixed",
                name="Mixed / Comprehensive",
                description="Extract both narrative and technical blocks comprehensively",
                extraction_mode="auto",
                min_block_chars=200,
                max_block_chars=450,
                target_block_count=7,
                concept_discovery_enabled=True,
                concept_threshold=0.5,
                auto_confirm_generic=False,
                preferred_block_types=[
                    "character_description",
                    "action_choreography",
                    "camera_instruction",
                    "environment_description",
                    "style_instruction"
                ],
                custom_instructions="Extract a comprehensive mix of narrative and technical blocks. "
                                   "Balance story elements with visual/technical requirements.",
                is_system=True
            )
        }

    def list_configs(self, include_custom: bool = True) -> List[ExtractionConfig]:
        """List all available extraction configs

        Args:
            include_custom: Include user-created configs (not implemented yet)

        Returns:
            List of configs
        """
        configs = list(self.system_configs.values())

        # Sort by common usage order
        order = ["balanced", "aggressive", "conservative", "narrative", "technical", "mixed"]
        configs.sort(key=lambda x: order.index(x.config_id) if x.config_id in order else 999)

        return configs

    def get_config(self, config_id: str) -> Optional[ExtractionConfig]:
        """Get a specific extraction config

        Args:
            config_id: Config identifier

        Returns:
            Config or None if not found
        """
        return self.system_configs.get(config_id)

    def get_config_for_prompt(
        self,
        prompt_text: str,
        preferred_config: Optional[str] = None
    ) -> ExtractionConfig:
        """Recommend best config for a given prompt

        Args:
            prompt_text: Prompt to analyze
            preferred_config: User's preferred config (if any)

        Returns:
            Recommended extraction config
        """
        # If user specified a config, use it
        if preferred_config and preferred_config in self.system_configs:
            return self.system_configs[preferred_config]

        # Analyze prompt to recommend config
        prompt_lower = prompt_text.lower()

        # Check for narrative indicators
        narrative_keywords = [
            "character", "story", "emotion", "feel", "react", "express",
            "personality", "mood", "atmosphere", "tension", "drama"
        ]
        narrative_score = sum(1 for kw in narrative_keywords if kw in prompt_lower)

        # Check for technical indicators
        technical_keywords = [
            "camera", "rotation", "dolly", "pan", "zoom", "lighting",
            "render", "consistent", "preserve", "maintain", "style",
            "framerate", "resolution", "angle"
        ]
        technical_score = sum(1 for kw in technical_keywords if kw in prompt_lower)

        # Check complexity
        char_count = len(prompt_text)
        sentence_count = len([s for s in prompt_text.split('.') if s.strip()])

        # Make recommendation
        if narrative_score > technical_score * 1.5:
            return self.system_configs["narrative"]
        elif technical_score > narrative_score * 1.5:
            return self.system_configs["technical"]
        elif char_count > 1200 or sentence_count > 15:
            return self.system_configs["aggressive"]  # Complex prompt needs granular extraction
        elif char_count < 400:
            return self.system_configs["conservative"]  # Simple prompt
        else:
            return self.system_configs["balanced"]  # Default

    def create_custom_config(
        self,
        config_data: Dict[str, Any],
        created_by: str
    ) -> ExtractionConfig:
        """Create a user-defined custom config

        Args:
            config_data: Config parameters
            created_by: Username

        Returns:
            Created config

        Note:
            This creates in-memory configs for now.
            TODO: Add database storage for custom configs
        """
        config_id = config_data.get("config_id") or f"custom_{uuid4().hex[:8]}"

        config = ExtractionConfig(
            config_id=config_id,
            name=config_data["name"],
            description=config_data["description"],
            extraction_mode=config_data.get("extraction_mode", "auto"),
            min_block_chars=config_data.get("min_block_chars", 200),
            max_block_chars=config_data.get("max_block_chars", 400),
            target_block_count=config_data.get("target_block_count"),
            concept_discovery_enabled=config_data.get("concept_discovery_enabled", True),
            concept_threshold=config_data.get("concept_threshold", 0.5),
            auto_confirm_generic=config_data.get("auto_confirm_generic", False),
            preferred_block_types=config_data.get("preferred_block_types", []),
            required_tags=config_data.get("required_tags", []),
            custom_instructions=config_data.get("custom_instructions"),
            is_system=False,
            created_by=created_by
        )

        # Store in memory (TODO: persist to database)
        self.system_configs[config_id] = config

        return config

    def get_extraction_system_prompt(
        self,
        config: ExtractionConfig
    ) -> str:
        """Generate AI system prompt based on config

        Args:
            config: Extraction configuration

        Returns:
            Tailored system prompt for AI
        """
        base_prompt = """You are an expert at analyzing complex image/video generation prompts
and breaking them down into reusable, modular components.

Your task is to extract ActionBlocks from a complex prompt. Each ActionBlock should be:
- A self-contained, reusable component
- Have a clear purpose
- Compatible with other blocks (can be mixed and matched)
"""

        # Add block size constraints
        base_prompt += f"""
Block Size Requirements:
- Minimum {config.min_block_chars} characters per block
- Maximum {config.max_block_chars} characters per block
"""

        if config.target_block_count:
            base_prompt += f"- Target approximately {config.target_block_count} blocks total\n"

        # Add preferred block types
        if config.preferred_block_types:
            base_prompt += f"""
Focus on these block types:
{', '.join(config.preferred_block_types)}
"""

        # Add required tags
        if config.required_tags:
            base_prompt += f"""
Required tags to include:
{', '.join(config.required_tags)}
"""

        # Add custom instructions
        if config.custom_instructions:
            base_prompt += f"""
Special Instructions:
{config.custom_instructions}
"""

        # Add standard block types reference
        base_prompt += """
Common ActionBlock types:
- character_description: Physical appearance, species, style, render type
- pose_instruction: Body position, posture, orientation, stance
- camera_instruction: Camera movements, angles, framing, effects
- action_choreography: Physical actions, movements, gestures, interactions
- continuity_instruction: Technical requirements (lighting, consistency, preservation)
- reaction_description: Emotional reactions, expressions, eye contact
- environment_description: Setting, location, atmosphere, time of day
- style_instruction: Visual style, rendering approach, aesthetic

Return ONLY a valid JSON array of block objects. No other text."""

        return base_prompt
