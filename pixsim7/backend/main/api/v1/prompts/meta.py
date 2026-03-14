"""
Prompt analysis metadata endpoints.

Provides machine-readable contract discovery for AI agents and tools.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import get_current_user
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    DEFAULT_PROMPT_ANALYZER_ID,
    resolve_prompt_default_analyzer_ids,
)
from pixsim7.backend.main.services.prompt.parser import analyzer_registry
from pixsim7.backend.main.services.prompt.authoring_workflow_registry import (
    authoring_workflow_registry,
)

from .operations import (
    AnalyzePromptRequest,
    AnalyzePromptResponse,
    ApplyPromptEditRequest,
)
from pixsim7.backend.main.shared.schemas.error_response import ErrorResponse
from .schemas import CreatePromptFamilyRequest, CreatePromptVersionRequest

router = APIRouter()

PROMPT_ANALYSIS_CONTRACT_VERSION = "2026-03-13.1"
PROMPT_AUTHORING_CONTRACT_VERSION = "2026-03-14.5"
PROMPT_ANALYZE_ENDPOINT = "/api/v1/prompts/analyze"
PROMPT_CREATE_FAMILY_ENDPOINT = "/api/v1/prompts/families"
PROMPT_LIST_FAMILIES_ENDPOINT = "/api/v1/prompts/families"
PROMPT_CREATE_VERSION_ENDPOINT = "/api/v1/prompts/families/{family_id}/versions"
PROMPT_APPLY_EDIT_ENDPOINT = "/api/v1/prompts/versions/{version_id}/apply-edit"
PROMPT_SEARCH_SIMILAR_ENDPOINT = "/api/v1/prompts/search/similar"
BLOCK_TAG_DICTIONARY_ENDPOINT = "/api/v1/block-templates/meta/blocks/tag-dictionary"
ONTOLOGY_USAGE_ENDPOINT = "/api/v1/dev/ontology/usage"


class PromptAnalyzerPresetContract(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    source: str = "builtin"


class PromptAnalyzerContract(BaseModel):
    id: str
    name: str
    kind: str
    target: str
    enabled: bool
    is_default: bool
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    source_plugin_id: Optional[str] = None
    presets: List[PromptAnalyzerPresetContract] = Field(default_factory=list)


class AnalyzerResolutionStepContract(BaseModel):
    step: int
    key: str
    description: str


class PromptAnalysisContractResponse(BaseModel):
    version: str
    endpoint: str
    summary: str
    analyzer_resolution_order: List[AnalyzerResolutionStepContract]
    request_schema: Dict[str, Any]
    response_schema: Dict[str, Any]
    prompt_analyzers: List[PromptAnalyzerContract]
    deprecations: List[Dict[str, Any]]
    examples: List[Dict[str, Any]]


class PromptAuthoringEndpointContract(BaseModel):
    id: str
    method: str
    path: str
    summary: str


class GenerationHintContract(BaseModel):
    operation: str = Field(description="OperationType value (text_to_image, image_to_image, etc.).")
    priority: int = Field(
        description="Lower = preferred. UI picks the first compatible option."
    )
    requires_input_asset: bool = Field(
        False, description="Whether this operation needs a source asset."
    )
    auto_bind: Optional[str] = Field(
        None,
        description=(
            "How to auto-attach input asset. "
            "'parent_output' = output of parent version's generation. "
            "'viewer_asset' = currently viewed asset. "
            "Null = manual selection."
        ),
    )
    note: Optional[str] = Field(None, description="Optional context for this hint.")


class PromptAuthoringModeContract(BaseModel):
    id: str
    label: str
    description: str
    sequence_role: Optional[str] = Field(
        None, description="Mapped sequence role (initial, continuation, transition)."
    )
    generation_hints: List[GenerationHintContract] = Field(
        default_factory=list,
        description=(
            "Ranked list of compatible generation operations. "
            "UI picks the first one compatible with current context (assets available, etc.)."
        ),
    )
    recommended_tags: List[str] = Field(default_factory=list)
    required_fields: List[str] = Field(default_factory=list)


class PromptAuthoringSequenceRoleContract(BaseModel):
    id: str
    description: str


class PromptAuthoringWorkflowStepContract(BaseModel):
    step: int
    endpoint_id: str = Field(description="References an endpoint id from the endpoints list.")
    required: bool = True
    precondition: Optional[str] = Field(
        None, description="Human-readable precondition (e.g. 'requires existing version_id')."
    )
    outputs: List[str] = Field(
        default_factory=list,
        description="Data keys produced by this step (e.g. 'family_id', 'version_id').",
    )
    consumes: List[str] = Field(
        default_factory=list,
        description="Data keys from prior steps that this step needs.",
    )
    note: Optional[str] = None


class PromptAuthoringWorkflowContract(BaseModel):
    id: str
    label: str
    description: str
    audience: List[str] = Field(
        description="Who this workflow is for: 'agent', 'user', or both.",
    )
    steps: List[PromptAuthoringWorkflowStepContract]


class PromptValidValuesContract(BaseModel):
    field: str
    values: List[str]
    extensible: bool = Field(
        True, description="Whether agents may supply values outside this list."
    )
    description: Optional[str] = None


class PreAuthoringCheckContract(BaseModel):
    id: str
    label: str
    description: str
    endpoint: PromptAuthoringEndpointContract
    contract_ref: Optional[str] = Field(
        None,
        description=(
            "Meta contract ID that owns this endpoint. "
            "Resolve via GET /api/v1/meta/contracts for full graph."
        ),
    )
    when: str = Field(description="When to perform this check (e.g. 'before creating a family').")
    example_params: Optional[Dict[str, Any]] = Field(
        None, description="Example query/body params for the check endpoint."
    )


class FieldConstraintContract(BaseModel):
    field: str
    max_length: Optional[int] = None
    min_length: Optional[int] = None
    required: bool = False
    note: Optional[str] = None


class IdempotencyRuleContract(BaseModel):
    scope: str = Field(description="What this rule applies to (e.g. 'create_family').")
    behavior: str = Field(description="What happens on duplicate/retry.")
    unique_key: Optional[str] = Field(None, description="Field(s) that enforce uniqueness.")


class PromptAuthoringContractResponse(BaseModel):
    version: str
    summary: str
    endpoints: List[PromptAuthoringEndpointContract]
    workflows: List[PromptAuthoringWorkflowContract]
    valid_values: List[PromptValidValuesContract]
    pre_authoring_checks: List[PreAuthoringCheckContract]
    constraints: List[FieldConstraintContract]
    error_schema: Dict[str, Any]
    idempotency: List[IdempotencyRuleContract]
    create_family_request_schema: Dict[str, Any]
    create_version_request_schema: Dict[str, Any]
    apply_edit_request_schema: Dict[str, Any]
    analyze_request_schema: Dict[str, Any]
    analyze_response_schema: Dict[str, Any]
    field_ownership: List[Dict[str, Any]]
    sequence_roles: List[PromptAuthoringSequenceRoleContract]
    authoring_modes: List[PromptAuthoringModeContract]
    deprecations: List[Dict[str, Any]]
    examples: List[Dict[str, Any]]


def _coerce_label(preset_id: str, payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("label", "name", "title"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return preset_id.replace("_", " ").replace("-", " ").title()


def _coerce_description(payload: Any) -> Optional[str]:
    if isinstance(payload, dict):
        description = payload.get("description")
        if isinstance(description, str) and description.strip():
            return description.strip()
    return None


def _extract_analyzer_presets(analyzer_config: Dict[str, Any]) -> List[PromptAnalyzerPresetContract]:
    raw_presets = analyzer_config.get("presets")
    if not isinstance(raw_presets, dict):
        return []

    presets: List[PromptAnalyzerPresetContract] = []
    for preset_id, payload in raw_presets.items():
        if not isinstance(preset_id, str) or not preset_id.strip():
            continue
        normalized_id = preset_id.strip()
        presets.append(
            PromptAnalyzerPresetContract(
                id=normalized_id,
                label=_coerce_label(normalized_id, payload),
                description=_coerce_description(payload),
            )
        )
    presets.sort(key=lambda preset: preset.id)
    return presets


@router.get("/meta/analysis-contract", response_model=PromptAnalysisContractResponse)
async def get_prompt_analysis_contract(current_user=Depends(get_current_user)):
    """
    Return a machine-readable contract for prompt analysis.

    Intended as a single discovery endpoint for local/remote AI agents.
    """
    prompt_analyzers: List[PromptAnalyzerContract] = []
    for analyzer in analyzer_registry.list_prompt_analyzers(include_legacy=False):
        prompt_analyzers.append(
            PromptAnalyzerContract(
                id=analyzer.id,
                name=analyzer.name,
                kind=analyzer.kind.value,
                target=analyzer.target.value,
                enabled=analyzer.enabled,
                is_default=analyzer.is_default,
                provider_id=analyzer.provider_id,
                model_id=analyzer.model_id,
                source_plugin_id=analyzer.source_plugin_id,
                presets=_extract_analyzer_presets(analyzer.config or {}),
            )
        )
    prompt_analyzers.sort(key=lambda item: (not item.is_default, item.id))

    user_default_ids = resolve_prompt_default_analyzer_ids(getattr(current_user, "preferences", None))
    user_default_ids_note = ", ".join(user_default_ids) if user_default_ids else "(none)"

    analyzer_resolution_order = [
        AnalyzerResolutionStepContract(
            step=1,
            key="request.analyzer_id",
            description="If provided, normalize to canonical prompt analyzer ID (legacy aliases accepted).",
        ),
        AnalyzerResolutionStepContract(
            step=2,
            key="request.analyzer_instance_id",
            description=(
                "If provided and owned by user, instance analyzer/provider/model/config overrides apply "
                "and can replace step 1 selection."
            ),
        ),
        AnalyzerResolutionStepContract(
            step=3,
            key="user.preferences.analyzer.prompt_default_ids",
            description=f"Ordered user defaults (enabled prompt analyzers only). Current user: {user_default_ids_note}.",
        ),
        AnalyzerResolutionStepContract(
            step=4,
            key="registry.default(prompt)",
            description="Prompt target default from analyzer registry.",
        ),
        AnalyzerResolutionStepContract(
            step=5,
            key="hardcoded_fallback",
            description=f"Always fallback to `{DEFAULT_PROMPT_ANALYZER_ID}`.",
        ),
    ]

    deprecations = [
        {
            "field": "provider_hints.prompt_analysis",
            "status": "deprecated",
            "behavior": "Rejected by create-version API (HTTP 400).",
            "use_instead": "prompt_analysis field on prompt version payloads.",
        }
    ]

    examples = [
        {
            "name": "default-analysis",
            "request": {"text": "cinematic portrait, warm rim light"},
            "notes": "Analyzer resolves from user defaults then fallback chain.",
        },
        {
            "name": "instance-and-preset",
            "request": {
                "text": "close-up portrait, low angle, dramatic contrast",
                "analyzer_instance_id": 42,
                "preset_id": "blocks_tags",
                "pack_ids": ["core.camera", "core.direction"],
            },
            "notes": "Instance-level provider/model/config can override analyzer defaults.",
        },
        {
            "name": "agent-authored-analysis-persistence",
            "request": {
                "prompt_text": "raw prose prompt text",
                "prompt_analysis": {
                    "analyzer_id": "prompt:agent-authored",
                    "candidates": [],
                    "tags": ["style:etching"],
                    "source": "local-agent",
                },
            },
            "notes": "Use create prompt version endpoints when storing analysis to DB.",
        },
    ]

    return PromptAnalysisContractResponse(
        version=PROMPT_ANALYSIS_CONTRACT_VERSION,
        endpoint=PROMPT_ANALYZE_ENDPOINT,
        summary=(
            "Canonical contract for prompt analysis preview and analyzer selection. "
            "Use this for machine discovery before calling /prompts/analyze."
        ),
        analyzer_resolution_order=analyzer_resolution_order,
        request_schema=AnalyzePromptRequest.model_json_schema(),
        response_schema=AnalyzePromptResponse.model_json_schema(),
        prompt_analyzers=prompt_analyzers,
        deprecations=deprecations,
        examples=examples,
    )


@router.get("/meta/authoring-contract", response_model=PromptAuthoringContractResponse)
async def get_prompt_authoring_contract(
    current_user=Depends(get_current_user),
    audience: Optional[str] = None,
):
    """
    Return machine-readable prompt authoring and persistence contract.

    Query params:
        audience: Optional filter — "agent" or "user". Omit for all workflows.

    Intended for any consumer that needs a single endpoint describing how to:
    1) create families
    2) create versions
    3) persist prompt_analysis from /prompts/analyze
    """
    endpoints = [
        PromptAuthoringEndpointContract(
            id="prompts.list_families",
            method="GET",
            path=PROMPT_LIST_FAMILIES_ENDPOINT,
            summary="List existing families. Check before creating to avoid duplicates.",
        ),
        PromptAuthoringEndpointContract(
            id="prompts.create_family",
            method="POST",
            path=PROMPT_CREATE_FAMILY_ENDPOINT,
            summary="Create a prompt family container.",
        ),
        PromptAuthoringEndpointContract(
            id="prompts.create_version",
            method="POST",
            path=PROMPT_CREATE_VERSION_ENDPOINT,
            summary="Create a prompt version under a family and optionally persist prompt_analysis.",
        ),
        PromptAuthoringEndpointContract(
            id="prompts.analyze",
            method="POST",
            path=PROMPT_ANALYZE_ENDPOINT,
            summary="Analyze raw prompt text before persistence.",
        ),
        PromptAuthoringEndpointContract(
            id="prompts.apply_edit",
            method="POST",
            path=PROMPT_APPLY_EDIT_ENDPOINT,
            summary="Apply structured chat-style edits to an existing version and create a child version.",
        ),
        PromptAuthoringEndpointContract(
            id="prompts.search_similar",
            method="GET",
            path=PROMPT_SEARCH_SIMILAR_ENDPOINT,
            summary="Find similar prompts by text. Use before creating to check for near-duplicates.",
        ),
    ]

    # -- Dynamic workflows (from registry — plugins can extend) -----------
    workflows = [
        PromptAuthoringWorkflowContract(
            id=wf.id,
            label=wf.label,
            description=wf.description,
            audience=wf.audience,
            steps=[
                PromptAuthoringWorkflowStepContract(
                    step=s.step,
                    endpoint_id=s.endpoint_id,
                    required=s.required,
                    precondition=s.precondition,
                    outputs=s.outputs,
                    consumes=s.consumes,
                    note=s.note,
                )
                for s in wf.steps
            ],
        )
        for wf in authoring_workflow_registry.list_for_audience(audience)
    ]

    # -- Valid values ------------------------------------------------------
    valid_values = [
        PromptValidValuesContract(
            field="prompt_type",
            values=["visual", "narrative", "hybrid"],
            extensible=False,
            description="Classification of what the prompt produces.",
        ),
        PromptValidValuesContract(
            field="category",
            values=[
                "scene_setup", "scene_continuation", "tool_edit",
                "character_design", "environment", "action", "dialogue",
            ],
            extensible=True,
            description="Thematic category. Extensible — agents may introduce new categories.",
        ),
        PromptValidValuesContract(
            field="tags (namespace prefixes)",
            values=[
                "sequence:", "intent:", "mode:", "style:", "location:",
                "creature:", "feature:", "camera:", "angle:", "mood:",
                "palette:", "accent:", "clothing:", "prop:", "scope:",
            ],
            extensible=True,
            description="Known tag namespace prefixes. Free-form values after the colon.",
        ),
    ]

    # -- Pre-authoring checks ----------------------------------------------
    pre_authoring_checks = [
        PreAuthoringCheckContract(
            id="dedup_families",
            label="Check for duplicate families",
            description=(
                "Before creating a new family, list existing families filtered by "
                "prompt_type and/or category to avoid duplicates."
            ),
            endpoint=PromptAuthoringEndpointContract(
                id="prompts.list_families",
                method="GET",
                path=PROMPT_LIST_FAMILIES_ENDPOINT,
                summary="List existing families. Filter by prompt_type, category, is_active.",
            ),
            contract_ref="prompts.authoring",
            when="Before creating a new family.",
            example_params={"prompt_type": "visual", "category": "scene_setup", "limit": 20},
        ),
        PreAuthoringCheckContract(
            id="dedup_similar",
            label="Search for similar prompts",
            description=(
                "Before creating a version with new prompt text, check if a "
                "semantically similar prompt already exists."
            ),
            endpoint=PromptAuthoringEndpointContract(
                id="prompts.search_similar",
                method="GET",
                path=PROMPT_SEARCH_SIMILAR_ENDPOINT,
                summary="Find similar prompts by text similarity.",
            ),
            contract_ref="prompts.authoring",
            when="Before creating a version with novel prompt text.",
            example_params={"prompt": "cinematic portrait, warm rim light", "limit": 5, "threshold": 0.5},
        ),
        PreAuthoringCheckContract(
            id="discover_tags",
            label="Discover tag vocabulary",
            description=(
                "Fetch the canonical tag dictionary to discover registered tag keys, "
                "allowed values, and usage stats across block primitives. "
                "Use this to pick tags that match existing vocabulary."
            ),
            endpoint=PromptAuthoringEndpointContract(
                id="blocks.tag_dictionary",
                method="GET",
                path=BLOCK_TAG_DICTIONARY_ENDPOINT,
                summary="Canonical block tag dictionary with keys, values, and usage stats.",
            ),
            contract_ref="blocks.discovery",
            when="Before tagging a family or version, to align with registered vocabulary.",
            example_params={"include_values": True, "include_aliases": True, "limit_values_per_key": 20},
        ),
        PreAuthoringCheckContract(
            id="discover_ontology",
            label="Discover ontology concepts",
            description=(
                "Browse registered ontology vocabulary IDs and their usage counts "
                "across the system. Useful for understanding which semantic concepts "
                "are already modelled."
            ),
            endpoint=PromptAuthoringEndpointContract(
                id="ontology.usage",
                method="GET",
                path=ONTOLOGY_USAGE_ENDPOINT,
                summary="Ontology vocabulary IDs with usage counts.",
            ),
            when="When authoring prompts that reference domain concepts (moods, poses, locations).",
        ),
    ]

    sequence_roles = [
        PromptAuthoringSequenceRoleContract(
            id="initial",
            description="First scene/setup prompt. No continuity assumptions.",
        ),
        PromptAuthoringSequenceRoleContract(
            id="continuation",
            description="Prompt continues prior context and should preserve continuity.",
        ),
        PromptAuthoringSequenceRoleContract(
            id="transition",
            description="Prompt bridges between states/scenes with continuity constraints.",
        ),
    ]

    authoring_modes = [
        PromptAuthoringModeContract(
            id="scene_setup",
            label="Scene Setup",
            description="Long-form initial scene prompt with style, setting, and cast setup.",
            sequence_role="initial",
            generation_hints=[
                GenerationHintContract(operation="text_to_image", priority=1, requires_input_asset=False),
                GenerationHintContract(operation="text_to_video", priority=2, requires_input_asset=False),
            ],
            recommended_tags=["sequence:initial", "intent:setup", "mode:scene_setup"],
            required_fields=["prompt_text"],
        ),
        PromptAuthoringModeContract(
            id="scene_continuation",
            label="Scene Continuation",
            description="Short-to-medium continuation prompt that advances from previous context.",
            sequence_role="continuation",
            generation_hints=[
                GenerationHintContract(
                    operation="image_to_video", priority=1,
                    requires_input_asset=True, auto_bind="parent_output",
                ),
                GenerationHintContract(
                    operation="image_to_image", priority=2,
                    requires_input_asset=True, auto_bind="parent_output",
                ),
                GenerationHintContract(operation="text_to_image", priority=3, requires_input_asset=False),
            ],
            recommended_tags=["sequence:continuation", "intent:advance", "mode:continuation"],
            required_fields=["prompt_text", "parent_version_id"],
        ),
        PromptAuthoringModeContract(
            id="tool_edit",
            label="Tool Edit",
            description="Prompt intended for mask/tool-style edits (replace/modify specific regions).",
            sequence_role=None,
            generation_hints=[
                GenerationHintContract(
                    operation="image_to_image", priority=1,
                    requires_input_asset=True, auto_bind="viewer_asset",
                ),
            ],
            recommended_tags=["intent:modify", "mode:tool_edit", "scope:region_or_mask"],
            required_fields=["prompt_text"],
        ),
        PromptAuthoringModeContract(
            id="patch_edit",
            label="Patch Edit",
            description="Targeted edit to an existing generation — change specific elements while preserving the rest.",
            sequence_role=None,
            generation_hints=[
                GenerationHintContract(
                    operation="image_to_image", priority=1,
                    requires_input_asset=True, auto_bind="parent_output",
                ),
            ],
            recommended_tags=["intent:modify", "mode:patch_edit", "scope:targeted"],
            required_fields=["prompt_text", "parent_version_id"],
        ),
        PromptAuthoringModeContract(
            id="variation",
            label="Variation",
            description=(
                "Generate a variation of an existing output — same general concept "
                "with bounded divergence in composition, angle, or detail."
            ),
            sequence_role=None,
            generation_hints=[
                GenerationHintContract(
                    operation="image_to_image", priority=1,
                    requires_input_asset=True, auto_bind="parent_output",
                ),
                GenerationHintContract(operation="text_to_image", priority=2, requires_input_asset=False),
            ],
            recommended_tags=["intent:generate", "mode:variation", "scope:bounded"],
            required_fields=["prompt_text"],
        ),
        PromptAuthoringModeContract(
            id="character_design",
            label="Character Design",
            description=(
                "Detailed character or creature concept — anatomical description, "
                "distinctive features, materials, and personality cues. "
                "Focus is on defining a single entity, not a full scene."
            ),
            sequence_role="initial",
            generation_hints=[
                GenerationHintContract(operation="text_to_image", priority=1, requires_input_asset=False),
                GenerationHintContract(
                    operation="image_to_image", priority=2,
                    requires_input_asset=True, auto_bind="viewer_asset",
                    note="Refine from a rough sketch or reference.",
                ),
            ],
            recommended_tags=["intent:setup", "mode:character_design", "scope:entity"],
            required_fields=["prompt_text"],
        ),
    ]

    deprecations = [
        {
            "field": "provider_hints.prompt_analysis",
            "status": "deprecated",
            "behavior": "Rejected by create-version API (HTTP 422).",
            "use_instead": "prompt_analysis field on prompt version payloads.",
        }
    ]

    field_ownership = [
        {
            "field": "prompt_text",
            "owner": "authoring",
            "description": "Canonical prose prompt used for generation.",
        },
        {
            "field": "prompt_analysis.authoring.history[].edit_ops",
            "owner": "authoring",
            "description": "Canonical machine-readable tweak intents per version step.",
        },
        {
            "field": "commit_message",
            "owner": "authoring",
            "description": "Human-readable changelog for what changed in this version.",
        },
        {
            "field": "provider_hints",
            "owner": "metadata",
            "description": "Provider/version metadata only; must not contain prompt_analysis.",
        },
    ]

    examples = [
        {
            "name": "create-family",
            "request": {
                "method": "POST",
                "path": PROMPT_CREATE_FAMILY_ENDPOINT,
                "body": {
                    "title": "Victorian Consultation Room",
                    "prompt_type": "visual",
                    "category": "scene_setup",
                    "tags": ["style:victorian_etching", "location:consultation_room"],
                },
            },
        },
        {
            "name": "create-initial-version-with-analysis",
            "request": {
                "method": "POST",
                "path": PROMPT_CREATE_VERSION_ENDPOINT,
                "body": {
                    "prompt_text": "Raw prose scene setup text...",
                    "commit_message": "Initial scene setup draft",
                    "tags": ["sequence:initial", "intent:setup"],
                    "prompt_analysis": {
                        "analyzer_id": "prompt:agent-authored",
                        "tags": ["style:victorian_etching"],
                        "candidates": [],
                        "source": "local-agent",
                    },
                },
            },
            "notes": "Persist analysis in prompt_analysis, not provider_hints.",
        },
        {
            "name": "create-continuation-version",
            "request": {
                "method": "POST",
                "path": PROMPT_CREATE_VERSION_ENDPOINT,
                "body": {
                    "prompt_text": "Character reaches for the medical instrument.",
                    "parent_version_id": "prev-version-uuid",
                    "commit_message": "Continuation beat",
                    "tags": ["sequence:continuation", "intent:advance"],
                },
            },
        },
        {
            "name": "apply-edit-to-existing-version",
            "request": {
                "method": "POST",
                "path": PROMPT_APPLY_EDIT_ENDPOINT,
                "body": {
                    "instruction": "Less detail in interior, more brass accents.",
                    "prompt_text": "Updated prose prompt text...",
                    "edit_ops": [
                        {
                            "intent": "modify",
                            "target": "vehicle.interior.detail",
                            "direction": "decrease",
                        },
                        {
                            "intent": "add",
                            "target": "vehicle.material.brass",
                            "direction": "increase",
                        },
                    ],
                },
            },
            "notes": (
                "Creates a child version with parent_version_id and persists edit_ops in "
                "prompt_analysis.authoring.history."
            ),
        },
    ]

    # -- Field constraints -------------------------------------------------
    constraints = [
        FieldConstraintContract(
            field="family.title", max_length=255, required=True,
        ),
        FieldConstraintContract(
            field="family.slug", max_length=100,
            note="Auto-generated from title if omitted. Must be unique.",
        ),
        FieldConstraintContract(
            field="family.prompt_type", max_length=50, required=True,
        ),
        FieldConstraintContract(
            field="family.category", max_length=100,
        ),
        FieldConstraintContract(
            field="version.prompt_text", min_length=1, required=True,
            note="No hard max on create_version. Analyze endpoint caps at 10000 chars.",
        ),
        FieldConstraintContract(
            field="version.commit_message", max_length=500,
        ),
        FieldConstraintContract(
            field="analyze.text", min_length=1, max_length=10000, required=True,
        ),
    ]

    # -- Error schema ------------------------------------------------------
    error_schema = ErrorResponse.model_json_schema()

    # -- Idempotency -------------------------------------------------------
    idempotency = [
        IdempotencyRuleContract(
            scope="create_family",
            unique_key="slug",
            behavior=(
                "Slug is unique. If omitted, auto-generated from title. "
                "Creating a family with a duplicate slug returns HTTP 409 Conflict. "
                "Retrying with the same title may produce the same slug — check for "
                "conflict or list families first."
            ),
        ),
        IdempotencyRuleContract(
            scope="create_version",
            unique_key="prompt_hash (SHA256 of prompt_text)",
            behavior=(
                "Versions are NOT deduplicated — identical prompt_text creates a new "
                "version with a new version_number. The prompt_hash field is indexed "
                "for lookup but does not enforce uniqueness. Safe to retry but will "
                "create duplicates."
            ),
        ),
        IdempotencyRuleContract(
            scope="apply_edit",
            unique_key=None,
            behavior=(
                "Each call creates a new child version. Not idempotent — retrying "
                "creates duplicate child versions. Use version_number or created_at "
                "to detect duplicates client-side."
            ),
        ),
    ]

    return PromptAuthoringContractResponse(
        version=PROMPT_AUTHORING_CONTRACT_VERSION,
        summary=(
            "Canonical authoring contract for AI agents and UI wizards that write prompt "
            "families/versions and persist optional prompt analysis. Start with "
            "pre_authoring_checks for discovery, pick a workflow, check valid_values "
            "and constraints, then call endpoints. See error_schema for failure shapes "
            "and idempotency for retry behavior."
        ),
        endpoints=endpoints,
        workflows=workflows,
        valid_values=valid_values,
        pre_authoring_checks=pre_authoring_checks,
        constraints=constraints,
        error_schema=error_schema,
        idempotency=idempotency,
        create_family_request_schema=CreatePromptFamilyRequest.model_json_schema(),
        create_version_request_schema=CreatePromptVersionRequest.model_json_schema(),
        apply_edit_request_schema=ApplyPromptEditRequest.model_json_schema(),
        analyze_request_schema=AnalyzePromptRequest.model_json_schema(),
        analyze_response_schema=AnalyzePromptResponse.model_json_schema(),
        field_ownership=field_ownership,
        sequence_roles=sequence_roles,
        authoring_modes=authoring_modes,
        deprecations=deprecations,
        examples=examples,
    )
