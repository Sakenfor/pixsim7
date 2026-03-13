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

from .operations import (
    AnalyzePromptRequest,
    AnalyzePromptResponse,
    ApplyPromptEditRequest,
)
from .schemas import CreatePromptFamilyRequest, CreatePromptVersionRequest

router = APIRouter()

PROMPT_ANALYSIS_CONTRACT_VERSION = "2026-03-12.1"
PROMPT_AUTHORING_CONTRACT_VERSION = "2026-03-13.2"
PROMPT_ANALYZE_ENDPOINT = "/api/v1/prompts/analyze"
PROMPT_CREATE_FAMILY_ENDPOINT = "/api/v1/prompts/families"
PROMPT_CREATE_VERSION_ENDPOINT = "/api/v1/prompts/families/{family_id}/versions"
PROMPT_APPLY_EDIT_ENDPOINT = "/api/v1/prompts/versions/{version_id}/apply-edit"


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


class PromptAuthoringModeContract(BaseModel):
    id: str
    label: str
    description: str
    recommended_tags: List[str] = Field(default_factory=list)
    required_fields: List[str] = Field(default_factory=list)


class PromptAuthoringSequenceRoleContract(BaseModel):
    id: str
    description: str


class PromptAuthoringContractResponse(BaseModel):
    version: str
    summary: str
    endpoints: List[PromptAuthoringEndpointContract]
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
async def get_prompt_authoring_contract(current_user=Depends(get_current_user)):
    """
    Return machine-readable prompt authoring and persistence contract.

    Intended for AI agents that need a single endpoint describing how to:
    1) create families
    2) create versions
    3) persist prompt_analysis from /prompts/analyze
    """
    endpoints = [
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
            recommended_tags=["sequence:initial", "intent:setup", "mode:scene_setup"],
            required_fields=["prompt_text"],
        ),
        PromptAuthoringModeContract(
            id="scene_continuation",
            label="Scene Continuation",
            description="Short-to-medium continuation prompt that advances from previous context.",
            recommended_tags=["sequence:continuation", "intent:advance", "mode:continuation"],
            required_fields=["prompt_text", "parent_version_id"],
        ),
        PromptAuthoringModeContract(
            id="tool_edit",
            label="Tool Edit",
            description="Prompt intended for mask/tool-style edits (replace/modify specific regions).",
            recommended_tags=["intent:modify", "mode:tool_edit", "scope:region_or_mask"],
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

    return PromptAuthoringContractResponse(
        version=PROMPT_AUTHORING_CONTRACT_VERSION,
        summary=(
            "Canonical authoring contract for AI agents that write prompt families/versions "
            "and persist optional prompt analysis."
        ),
        endpoints=endpoints,
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
