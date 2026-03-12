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

from .operations import AnalyzePromptRequest, AnalyzePromptResponse

router = APIRouter()

PROMPT_ANALYSIS_CONTRACT_VERSION = "2026-03-12.1"
PROMPT_ANALYZE_ENDPOINT = "/api/v1/prompts/analyze"


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
