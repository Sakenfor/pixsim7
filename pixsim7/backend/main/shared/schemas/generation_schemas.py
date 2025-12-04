"""
Pydantic schemas for Generation API

These schemas map the frontend GenerationNodeConfig types to backend
Generation model and provide request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

from pixsim7.backend.main.domain.enums import GenerationStatus, OperationType


# ===== GENERATION CONFIG SCHEMAS =====
# These mirror the frontend types from packages/types/src/generation.ts

class SceneRefSchema(BaseModel):
    """Scene reference for generation context"""
    id: str
    mood: Optional[str] = None
    summary: Optional[str] = None
    location: Optional[str] = None
    emotional_state: Optional[str] = None


class PlayerContextSnapshotSchema(BaseModel):
    """Player state snapshot for generation context"""
    playthrough_id: Optional[str] = None
    player_id: Optional[str] = None
    choices: Optional[Dict[str, Any]] = None
    flags: Optional[Dict[str, bool]] = None
    stats: Optional[Dict[str, float]] = None


class DurationRuleSchema(BaseModel):
    """Duration constraints for generated content"""
    min: Optional[float] = Field(None, ge=0, description="Minimum duration in seconds")
    max: Optional[float] = Field(None, ge=0, description="Maximum duration in seconds")
    target: Optional[float] = Field(None, ge=0, description="Target duration in seconds")


class ConstraintSetSchema(BaseModel):
    """Content constraints and rating"""
    rating: Optional[str] = Field(None, pattern="^(G|PG|PG-13|R)$")
    required_elements: Optional[List[str]] = None
    avoid_elements: Optional[List[str]] = None
    content_rules: Optional[List[str]] = None


class StyleRulesSchema(BaseModel):
    """
    Style and transition rules

    Provider-specific settings convention:
    - Additional provider-specific fields can be nested under a key matching the
      provider_id (e.g., style.pixverse = { model, quality, off_peak, ... })
    - The backend's _canonicalize_params extracts these to top-level canonical fields
    - This allows the schema to remain backward-compatible while supporting provider extensions
    """
    mood_from: Optional[str] = None
    mood_to: Optional[str] = None
    pacing: Optional[str] = Field(None, pattern="^(slow|medium|fast)$")
    transition_type: Optional[str] = Field(None, pattern="^(gradual|abrupt)$")

    # Allow extra fields for provider-specific extensions (e.g., pixverse: {...})
    model_config = {"extra": "allow"}


class FallbackConfigSchema(BaseModel):
    """Fallback configuration for failed generations"""
    mode: str = Field(..., pattern="^(default_content|skip|retry|placeholder)$")
    default_content_id: Optional[str] = None
    max_retries: Optional[int] = Field(None, ge=1, le=10)
    timeout_ms: Optional[int] = Field(None, ge=1000)


class GenerationNodeConfigSchema(BaseModel):
    """
    Complete generation node configuration

    This schema mirrors GenerationNodeConfig from packages/types/src/generation.ts

    Additional fields for Control Center integration:
    - prompt: Text prompt for generation
    - image_url: Source image URL for image_to_video operations
    - video_url: Source video URL for video_extend operations
    - image_urls: Image URLs for video_transition operations
    - prompts: Transition prompts for video_transition operations
    """
    generation_type: str = Field(..., pattern="^(transition|variation|dialogue|environment|npc_response|fusion)$")
    purpose: str = Field(..., pattern="^(gap_fill|variation|adaptive|ambient)$")
    style: StyleRulesSchema
    duration: DurationRuleSchema
    constraints: ConstraintSetSchema
    strategy: str = Field(..., pattern="^(once|per_playthrough|per_player|always)$")
    seed_source: Optional[str] = Field(None, pattern="^(playthrough|player|timestamp|fixed)$")
    fallback: FallbackConfigSchema
    template_id: Optional[str] = None
    enabled: bool = True
    version: int = Field(1, ge=1)

    # Control Center fields - passed through for canonicalization
    prompt: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    prompts: Optional[List[str]] = None

    # Allow extra fields for future extensions
    model_config = {"extra": "allow"}


class GenerationSocialContextSchema(BaseModel):
    """
    Social and relationship context for generation

    From Task 09 - integrates intimacy and relationship state
    """
    tier_id: Optional[str] = None
    intimacy_level_id: Optional[str] = None
    relationship_state: Optional[Dict[str, Any]] = None
    content_rating: Optional[str] = Field(None, pattern="^(G|PG|PG-13|R)$")
    world_max_rating: Optional[str] = Field(None, pattern="^(G|PG|PG-13|R)$")
    user_max_rating: Optional[str] = Field(None, pattern="^(G|PG|PG-13|R)$")


# ===== REQUEST SCHEMAS =====

class CreateGenerationRequest(BaseModel):
    """
    Request to create a new generation from a Generation Node

    This combines:
    - Generation config (strategy, style, constraints)
    - Scene context (from/to scenes)
    - Player context (playthrough, choices, stats)
    - Social context (intimacy, relationship state)
    - Prompt versioning (template_id or prompt_version_id)
    """
    # Required fields
    config: GenerationNodeConfigSchema
    provider_id: str = Field(..., min_length=1, max_length=50)

    # Scene context
    from_scene: Optional[SceneRefSchema] = None
    to_scene: Optional[SceneRefSchema] = None

    # Player context
    player_context: Optional[PlayerContextSnapshotSchema] = None

    # Social context (from Task 09)
    social_context: Optional[GenerationSocialContextSchema] = None

    # Prompt versioning
    prompt_version_id: Optional[UUID] = None
    template_id: Optional[str] = None  # Maps to prompt family
    template_variables: Optional[Dict[str, Any]] = None

    # Workspace and metadata
    workspace_id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

    # Scheduling
    priority: int = Field(5, ge=0, le=10)
    scheduled_at: Optional[datetime] = None
    parent_generation_id: Optional[int] = None

    # Deduplication control
    force_new: bool = Field(False, description="Skip dedup and cache, always create new generation")

    class Config:
        json_schema_extra = {
            "example": {
                "config": {
                    "generation_type": "transition",
                    "purpose": "gap_fill",
                    "style": {
                        "mood_from": "tense",
                        "mood_to": "calm",
                        "pacing": "medium",
                        "transition_type": "gradual"
                    },
                    "duration": {
                        "min": 5.0,
                        "max": 15.0,
                        "target": 10.0
                    },
                    "constraints": {
                        "rating": "PG-13",
                        "required_elements": ["character_A"],
                        "avoid_elements": ["violence"]
                    },
                    "strategy": "per_playthrough",
                    "seed_source": "playthrough",
                    "fallback": {
                        "mode": "placeholder",
                        "timeout_ms": 30000
                    },
                    "enabled": True,
                    "version": 1
                },
                "provider_id": "pixverse",
                "from_scene": {
                    "id": "scene-123",
                    "mood": "tense"
                },
                "to_scene": {
                    "id": "scene-456",
                    "mood": "calm"
                },
                "priority": 5
            }
        }


# ===== RESPONSE SCHEMAS =====

class GenerationResponse(BaseModel):
    """
    Generation response - mirrors Generation model
    """
    id: int
    user_id: int
    workspace_id: Optional[int]

    # Operation
    operation_type: OperationType
    provider_id: str

    # Params
    raw_params: Dict[str, Any]
    canonical_params: Dict[str, Any]

    # Inputs & reproducibility
    inputs: List[Dict[str, Any]]
    reproducible_hash: Optional[str]

    # Prompt versioning
    prompt_version_id: Optional[UUID]
    final_prompt: Optional[str]
    prompt_config: Optional[Dict[str, Any]]
    prompt_source_type: Optional[str]

    # Lifecycle
    status: GenerationStatus
    priority: int
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    retry_count: int
    parent_generation_id: Optional[int]

    # Result
    asset_id: Optional[int]

    # Metadata
    name: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    # Computed fields
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate generation duration"""
        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    class Config:
        from_attributes = True


class GenerationListResponse(BaseModel):
    """
    Paginated list of generations
    """
    generations: List[GenerationResponse]
    total: int
    limit: int
    offset: int

    @property
    def has_more(self) -> bool:
        """Check if there are more results"""
        return self.offset + len(self.generations) < self.total
