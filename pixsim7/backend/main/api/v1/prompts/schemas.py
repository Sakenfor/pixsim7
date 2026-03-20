"""
Prompt API Request/Response Models

Pydantic schemas for prompt versioning API endpoints.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class CreatePromptFamilyRequest(BaseModel):
    title: str = Field(..., description="Human-readable title")
    prompt_type: str = Field(..., description="'visual', 'narrative', or 'hybrid'")
    slug: Optional[str] = Field(None, description="URL-safe identifier (auto-generated if not provided)")
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    game_world_id: Optional[UUID] = None
    npc_id: Optional[UUID] = None
    scene_id: Optional[UUID] = None
    action_concept_id: Optional[str] = None


class UpdatePromptFamilyRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


class CreatePromptVersionRequest(BaseModel):
    prompt_text: str = Field(..., description="The actual prompt text")
    commit_message: Optional[str] = Field(None, description="Description of changes")
    author: Optional[str] = None
    parent_version_id: Optional[UUID] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    provider_hints: Dict[str, Any] = Field(
        default_factory=dict,
        description="Provider/version metadata only. Must not contain prompt_analysis.",
    )
    prompt_analysis: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Canonical structured analysis for this prompt version.",
    )
    tags: List[str] = Field(default_factory=list)


class BatchVersionRequest(CreatePromptVersionRequest):
    """
    Request model for batch version creation.

    Uses the same fields as CreatePromptVersionRequest for now, but is
    defined separately so it can evolve independently if needed.
    """
    pass


class ForkFromArtifactRequest(BaseModel):
    artifact_id: int = Field(..., description="Source artifact to fork from")
    family_id: UUID = Field(..., description="Target family for new version")
    commit_message: str = Field(..., description="Description of changes")
    modifications: Optional[str] = Field(None, description="Modified prompt text")
    author: Optional[str] = None


class PromptFamilyResponse(BaseModel):
    id: UUID
    slug: str
    title: str
    description: Optional[str]
    prompt_type: str
    category: Optional[str]
    tags: List[str]
    is_active: bool
    version_count: Optional[int] = None

    class Config:
        from_attributes = True


class BranchSummary(BaseModel):
    name: str
    head_version_id: Optional[str] = None
    latest_version_number: Optional[int] = None
    commit_count: int = 0
    last_commit: Optional[str] = None
    author: Optional[str] = None
    is_main: bool = False


class CreateBranchRequest(BaseModel):
    branch_name: str = Field(..., description="Name for the new branch")
    from_version_id: Optional[UUID] = Field(None, description="Branch from this version (latest if omitted)")
    author: Optional[str] = None


class PromptVersionResponse(BaseModel):
    id: UUID
    family_id: UUID
    version_number: int
    prompt_text: str
    commit_message: Optional[str]
    author: Optional[str]
    parent_version_id: Optional[UUID] = None
    branch_name: Optional[str] = None
    generation_count: int
    successful_assets: int
    tags: List[str]
    created_at: str

    class Config:
        from_attributes = True


class PromptVariantResponse(BaseModel):
    id: int
    prompt_version_id: UUID
    output_asset_id: int
    input_asset_ids: List[int]
    user_id: Optional[int]
    user_rating: Optional[int]
    quality_score: Optional[float]
    is_favorite: bool
    notes: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class CreatePromptVariantRequest(BaseModel):
    prompt_version_id: UUID
    output_asset_id: int
    input_asset_ids: List[int] = Field(default_factory=list)
    generation_id: Optional[int] = None


class RatePromptVariantRequest(BaseModel):
    user_rating: Optional[int] = Field(None, description="1-5 rating")
    is_favorite: Optional[bool] = None
    notes: Optional[str] = None
    quality_score: Optional[float] = None
