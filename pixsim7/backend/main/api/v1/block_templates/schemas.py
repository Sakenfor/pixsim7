"""Pydantic request/response models for block templates API."""
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from uuid import UUID
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.prompt.block.template_slots import TemplateSlotSpec


# ===== Template Schemas =====

class TemplateSlotInput(TemplateSlotSpec):
    """Canonical template slot input shape (strict)."""


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    slots: List[TemplateSlotInput] = Field(default_factory=list)
    composition_strategy: str = Field("sequential")
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    template_metadata: Dict[str, Any] = Field(default_factory=dict)
    character_bindings: Dict[str, Any] = Field(default_factory=dict)


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    slots: Optional[List[TemplateSlotInput]] = None
    composition_strategy: Optional[str] = None
    package_name: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    template_metadata: Optional[Dict[str, Any]] = None
    character_bindings: Optional[Dict[str, Any]] = None


class RollTemplateRequest(BaseModel):
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    exclude_block_ids: Optional[List[UUID]] = Field(None, description="Block IDs to exclude globally")
    character_bindings: Optional[Dict[str, Any]] = Field(None, description="Override character bindings for this roll")
    control_values: Optional[Dict[str, Any]] = Field(
        None,
        description="Template control overrides (control_id -> value); defaults to each control's defaultValue",
    )


class PreviewSlotRequest(BaseModel):
    slot: TemplateSlotInput
    limit: int = Field(5, ge=1, le=20)


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slots: List[Dict[str, Any]] = Field(default_factory=list)
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    created_by: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None
    roll_count: int = 0
    template_metadata: Dict[str, Any] = Field(default_factory=dict)
    character_bindings: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateSummaryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slot_count: int = 0
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    owner_user_id: Optional[int] = None
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None
    roll_count: int = 0
    composition_role_gap_count: int = 0
    composition_role_ids: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateSlotPackageCountResponse(BaseModel):
    package_name: Optional[str] = None
    count: int = 0


class TemplateSlotDiagnosticsResponse(BaseModel):
    slot_index: int
    label: str
    kind: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None
    selection_strategy: str
    optional: bool = False
    slot_package_name: Optional[str] = None
    template_package_name: Optional[str] = None
    status_hint: str = "queryable"
    total_matches: int = 0
    package_match_counts: List[TemplateSlotPackageCountResponse] = Field(default_factory=list)
    template_package_match_count: int = 0
    other_package_match_count: int = 0
    has_matches_outside_template_package: bool = False
    would_need_fallback_if_template_package_restricted: bool = False
    composition_role_hint: Optional[str] = None
    composition_role_confidence: Optional[str] = None
    composition_role_reason: Optional[str] = None


class TemplateDiagnosticsTemplateSummaryResponse(BaseModel):
    id: str
    name: str
    slug: str
    package_name: Optional[str] = None
    composition_strategy: str
    slot_count: int
    slot_schema_version: Optional[int] = None
    source: Dict[str, Any] = Field(default_factory=dict)
    dependencies: Dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[str] = None


class TemplateDiagnosticsResponse(BaseModel):
    success: bool = True
    template: TemplateDiagnosticsTemplateSummaryResponse
    slots: List[TemplateSlotDiagnosticsResponse] = Field(default_factory=list)


class ResolveWorkbenchRequest(BaseModel):
    resolver_id: str = Field("next_v1")
    seed: Optional[int] = None
    intent: Dict[str, Any] = Field(default_factory=dict)
    candidates_by_target: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    constraints: List[Dict[str, Any]] = Field(default_factory=list)
    pairwise_bonuses: List[Dict[str, Any]] = Field(default_factory=list)
    debug: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)


class CompileWorkbenchTemplateRequest(BaseModel):
    template_id: Optional[UUID] = Field(None, description="Template ID to compile into a ResolutionRequest")
    slug: Optional[str] = Field(None, description="Template slug to compile into a ResolutionRequest")
    candidate_limit: int = Field(24, ge=1, le=200, description="Max candidates fetched per target")
    control_values: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional template control overrides applied before compiling intent/candidates",
    )
    compiler_id: str = Field("compiler_v1", description="Compiler to use (default: compiler_v1)")


# ===== Block Schemas =====

class BlockResponse(BaseModel):
    id: UUID
    block_id: str
    composition_role: Optional[str] = None
    category: Optional[str] = None
    kind: str = "single_state"
    default_intent: Optional[str] = None
    text: str = ""
    tags: Dict[str, Any] = Field(default_factory=dict)
    capabilities: List[str] = Field(default_factory=list)
    complexity_level: Optional[str] = None
    package_name: Optional[str] = None
    description: Optional[str] = None
    word_count: int = 0

    class Config:
        from_attributes = True


class UpsertPrimitiveBlockRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=64)
    text: str = Field(..., min_length=1)
    tags: Dict[str, Any] = Field(default_factory=dict)
    capabilities: List[str] = Field(default_factory=list)
    source: Literal["system", "user", "imported"] = "imported"
    is_public: bool = True
    avg_rating: Optional[float] = None
    usage_count: Optional[int] = Field(default=None, ge=0)


class UpsertPrimitiveBlockResponse(BaseModel):
    status: Literal["created", "updated"]
    block: BlockResponse


class DeletePrimitiveBlockResponse(BaseModel):
    success: bool = True
    deleted_block_id: str


class BlockCatalogRowResponse(BaseModel):
    id: UUID
    block_id: str
    composition_role: Optional[str] = None
    category: Optional[str] = None
    package_name: Optional[str] = None
    kind: str = "single_state"
    default_intent: Optional[str] = None
    tags: Dict[str, Any] = Field(default_factory=dict)
    capabilities: List[str] = Field(default_factory=list)
    word_count: int = 0
    text_preview: str = ""


# ===== Matrix Schemas =====

class BlockMatrixCellSampleResponse(BaseModel):
    id: UUID
    block_id: str
    package_name: Optional[str] = None
    composition_role: Optional[str] = None
    category: Optional[str] = None


class BlockMatrixCellResponse(BaseModel):
    row_value: str
    col_value: str
    count: int
    samples: List[BlockMatrixCellSampleResponse] = Field(default_factory=list)


class BlockMatrixResponse(BaseModel):
    row_key: str
    col_key: str
    row_values: List[str] = Field(default_factory=list)
    col_values: List[str] = Field(default_factory=list)
    total_blocks: int = 0
    filters: Dict[str, Any] = Field(default_factory=dict)
    cells: List[BlockMatrixCellResponse] = Field(default_factory=list)


# ===== Content Pack Schemas =====

class ContentPackMatrixPresetResponse(BaseModel):
    label: str
    query: Dict[str, Any] = Field(default_factory=dict)


class ContentPackMatrixManifestResponse(BaseModel):
    pack_name: str
    source: str
    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    matrix_presets: List[ContentPackMatrixPresetResponse] = Field(default_factory=list)


# ===== Tag Dictionary Schemas =====

class BlockTagDictionaryValueSummaryResponse(BaseModel):
    value: str
    count: int
    status: str = "observed"


class BlockTagDictionaryAliasesResponse(BaseModel):
    keys: List[str] = Field(default_factory=list)
    values: Dict[str, str] = Field(default_factory=dict)


class BlockTagDictionaryExampleResponse(BaseModel):
    id: UUID
    block_id: str
    package_name: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None


class BlockTagDictionaryKeyResponse(BaseModel):
    key: str
    status: str = "canonical"
    description: Optional[str] = None
    data_type: str = "string"
    observed_count: int = 0
    common_values: List[BlockTagDictionaryValueSummaryResponse] = Field(default_factory=list)
    aliases: Optional[BlockTagDictionaryAliasesResponse] = None
    examples: List[BlockTagDictionaryExampleResponse] = Field(default_factory=list)


class BlockTagDictionaryWarningResponse(BaseModel):
    kind: str
    message: str
    keys: List[str] = Field(default_factory=list)


class BlockTagDictionaryResponse(BaseModel):
    version: int = 1
    generated_at: str
    scope: Dict[str, Any] = Field(default_factory=dict)
    keys: List[BlockTagDictionaryKeyResponse] = Field(default_factory=list)
    warnings: List[BlockTagDictionaryWarningResponse] = Field(default_factory=list)
