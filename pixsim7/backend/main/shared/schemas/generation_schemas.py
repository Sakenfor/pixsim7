"""
Pydantic schemas for Generation API

These schemas map the frontend GenerationNodeConfig types to backend
Generation model and provide request/response validation.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict, AliasChoices
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from uuid import UUID

from pixsim7.backend.main.domain.enums import GenerationStatus, OperationType, normalize_enum
from pixsim7.backend.main.shared.schemas.entity_ref import (
    AssetRef,
    UserRef,
    WorkspaceRef,
    GenerationRef,
    AccountRef,
)
from pixsim7.backend.main.shared.schemas.composition_schemas import CompositionAsset


# ===== GENERATION CONFIG SCHEMAS =====
# These mirror the frontend types from packages/types/src/generation.ts

class SceneRefSchema(BaseModel):
    """Scene reference for generation context"""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    mood: Optional[str] = None
    summary: Optional[str] = None
    location: Optional[str] = None
    emotional_state: Optional[str] = Field(None, alias="emotionalState")


class PlayerContextSnapshotSchema(BaseModel):
    """Player state snapshot for generation context"""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    playthrough_id: Optional[str] = Field(None, alias="playthroughId")
    player_id: Optional[str] = Field(None, alias="playerId")
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
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    rating: Optional[str] = Field(None, pattern="^(G|PG|PG-13|R)$")
    required_elements: Optional[List[str]] = Field(None, alias="requiredElements")
    avoid_elements: Optional[List[str]] = Field(None, alias="avoidElements")
    content_rules: Optional[List[str]] = Field(None, alias="contentRules")


class StyleRulesSchema(BaseModel):
    """
    Style and transition rules

    Provider-specific settings convention:
    - Additional provider-specific fields can be nested under a key matching the
      provider_id (e.g., style.pixverse = { model, quality, off_peak, ... })
    - The backend's _canonicalize_params extracts these to top-level canonical fields
    - This allows the schema to remain backward-compatible while supporting provider extensions
    """
    # Allow extra fields for provider-specific extensions (e.g., pixverse: {...})
    model_config = ConfigDict(extra="allow", populate_by_name=True, serialize_by_alias=True)

    mood_from: Optional[str] = Field(None, alias="moodFrom")
    mood_to: Optional[str] = Field(None, alias="moodTo")
    pacing: Optional[str] = Field(None, pattern="^(slow|medium|fast)$")
    transition_type: Optional[str] = Field(None, pattern="^(gradual|abrupt)$", alias="transitionType")


class FallbackConfigSchema(BaseModel):
    """Fallback configuration for failed generations"""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    mode: str = Field(..., pattern="^(default_content|skip|retry|placeholder)$")
    default_content_id: Optional[str] = Field(None, alias="defaultContentId")
    max_retries: Optional[int] = Field(None, ge=1, le=10, alias="maxRetries")
    timeout_ms: Optional[int] = Field(None, ge=1000, alias="timeoutMs")


class GenerationNodeConfigSchema(BaseModel):
    """
    Complete generation node configuration

    This schema mirrors GenerationNodeConfig from packages/types/src/generation.ts

    Additional fields for Control Center integration:
    - prompt: Text prompt for generation
    - image_url: Source image URL for image_to_video operations
    - video_url: Source video URL for video_extend operations
    - image_urls: Image URLs for video_transition operations
    - source_asset_id(s): Asset references for provider URL resolution
    - prompts: Transition prompts for video_transition operations
    """
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="allow")

    generation_type: str = Field(..., alias="generationType")
    semantic_type: Optional[str] = Field(None, alias="semanticType")
    resolution_mode: Literal["strict", "dynamic", "override_only"] = Field(
        "strict", alias="resolutionMode"
    )
    operation_override: Optional[str] = Field(None, alias="operationOverride")

    @field_validator('generation_type')
    @classmethod
    def validate_generation_type(cls, v: str) -> str:
        """Validate generation_type against canonical generation types."""
        from pixsim7.backend.main.shared.operation_mapping import CANONICAL_GENERATION_TYPES
        if v not in CANONICAL_GENERATION_TYPES:
            valid = sorted(CANONICAL_GENERATION_TYPES)
            raise ValueError(f"Invalid generation_type '{v}'. Must be one of: {valid}")
        return v

    @field_validator('operation_override')
    @classmethod
    def validate_operation_override(cls, v: Optional[str]) -> Optional[str]:
        """Validate operation_override against canonical generation types."""
        if v is None:
            return v
        from pixsim7.backend.main.shared.operation_mapping import CANONICAL_GENERATION_TYPES
        if v not in CANONICAL_GENERATION_TYPES:
            valid = sorted(CANONICAL_GENERATION_TYPES)
            raise ValueError(f"Invalid operation_override '{v}'. Must be one of: {valid}")
        return v

    @model_validator(mode="after")
    def validate_resolution_mode(self):
        if self.resolution_mode == "override_only" and not self.operation_override:
            raise ValueError("operationOverride is required when resolutionMode='override_only'")
        return self
    purpose: str = Field(..., pattern="^(gap_fill|variation|adaptive|ambient)$")
    style: StyleRulesSchema
    duration: DurationRuleSchema
    constraints: ConstraintSetSchema
    strategy: str = Field(..., pattern="^(once|per_playthrough|per_player|always)$")
    seed_source: Optional[str] = Field(
        None, pattern="^(playthrough|player|timestamp|fixed)$", alias="seedSource"
    )
    fallback: FallbackConfigSchema
    template_id: Optional[str] = Field(None, alias="templateId")
    enabled: bool = True
    version: int = Field(1, ge=1)

    # Control Center fields - passed through for canonicalization
    prompt: Optional[str] = None

    # Asset input fields - NEW pattern (preferred)
    # Frontend passes asset IDs, backend resolves to provider-specific URLs
    source_asset_id: Optional[int] = Field(
        None,
        alias="sourceAssetId",
        description="Asset ID for single-asset operations (image_to_video, image_to_image, video_extend). Backend resolves to provider-specific URL."
    )
    source_asset_ids: Optional[List[int]] = Field(
        None,
        alias="sourceAssetIds",
        description="Asset IDs for multi-asset operations (video_transition). Backend resolves each to provider-specific URL."
    )

    # Canonical multi-image composition input (preferred for fusion + image edit)
    composition_assets: Optional[List[CompositionAsset]] = Field(
        None,
        description="Structured composition assets (role/layer/intent) for multi-image operations.",
    )

    # Legacy asset URL fields - DEPRECATED
    # These are kept for backwards compatibility but will be removed in a future release.
    # New code should use source_asset_id/source_asset_ids instead.
    image_url: Optional[str] = Field(
        None,
        deprecated=True,
        description="DEPRECATED: Use source_asset_id instead. Direct image URL (legacy pattern)."
    )
    video_url: Optional[str] = Field(
        None,
        deprecated=True,
        description="DEPRECATED: Use source_asset_id instead. Direct video URL (legacy pattern)."
    )
    image_urls: Optional[List[str]] = Field(
        None,
        deprecated=True,
        description="DEPRECATED: Use source_asset_ids instead. List of image URLs (legacy pattern)."
    )

    # Multi-prompt field for video_transition
    prompts: Optional[List[str]] = None


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
    workspace: Optional[WorkspaceRef] = Field(
        default=None, validation_alias=AliasChoices("workspace", "workspace_id")
    )
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

    # Scheduling
    priority: int = Field(5, ge=0, le=10)
    scheduled_at: Optional[datetime] = None
    parent_generation: Optional[GenerationRef] = Field(
        default=None, validation_alias=AliasChoices("parent_generation", "parent_generation_id")
    )

    # Deduplication control
    force_new: bool = Field(False, description="Skip dedup and cache, always create new generation")

    # Asset versioning
    version_intent: str = Field(
        "new",
        pattern="^(new|version)$",
        description=(
            "How to handle output asset versioning. "
            "'new' = create standalone asset (default). "
            "'version' = create new version of input asset (requires exactly one input)."
        )
    )
    version_message: Optional[str] = Field(
        None,
        max_length=500,
        description="What changed in this version (for version_intent='version'). E.g., 'Fixed hand anatomy'"
    )

    # Account preference
    preferred_account_id: Optional[int] = Field(
        None,
        description="Preferred provider account ID. Worker tries this account first, falls back to normal selection."
    )

    # Prompt analysis settings (validated against analyzer registry)
    analyzer_id: Optional[str] = Field(
        None,
        description="Analyzer ID for prompt parsing (e.g., 'parser:simple', 'llm:claude'). See GET /api/v1/analyzers for available options."
    )

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "config": {
                    "generation_type": "video_transition",
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
    )


# ===== RESPONSE SCHEMAS =====

class GenerationResponse(BaseModel):
    """
    Generation response - mirrors Generation model
    """

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: int
    user: UserRef = Field(..., validation_alias=AliasChoices("user", "user_id"))
    workspace: Optional[WorkspaceRef] = Field(
        default=None, validation_alias=AliasChoices("workspace", "workspace_id")
    )

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
    parent_generation: Optional[GenerationRef] = Field(
        default=None, validation_alias=AliasChoices("parent_generation", "parent_generation_id")
    )

    # Result
    asset: Optional[AssetRef] = Field(
        default=None, validation_alias=AliasChoices("asset", "asset_id")
    )

    # Account info (for UI display)
    account: Optional[AccountRef] = Field(
        default=None, validation_alias=AliasChoices("account", "account_id")
    )
    account_email: Optional[str] = None

    # Metadata
    name: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    # Validators to handle uppercase DB values
    @field_validator("operation_type", mode="before")
    @classmethod
    def normalize_operation_type(cls, v):
        return normalize_enum(v, OperationType)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v):
        return normalize_enum(v, GenerationStatus)

    # Computed fields
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate generation duration"""
        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()


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
