"""
LLM-based Prompt Analyzer

Uses Claude or other LLMs to analyze prompts with deeper semantic understanding.
Produces output compatible with SimplePromptParser for unified processing.
"""

import logging
import re
from typing import Dict, Any, List, Optional, TYPE_CHECKING

from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

BASE_ANALYSIS_SYSTEM_PROMPT = """You are a prompt analyzer for an AI video generation system.

Your task is to parse a prompt into semantic candidates, classifying each by role.

ROLES (use exactly these values):
{role_lines}

INSTRUCTIONS:
1. Split the prompt into logical semantic units (phrases or sentences)
2. Assign each block the most appropriate role
3. Extract ontology IDs that describe the content semantically
4. Identify a category label for fine-grained classification

Ontology ID format: "prefix:name"
Prefer canonical vocabulary IDs from the registry when possible:
- mood:* (mood:tender, mood:passionate)
- location:* (location:forest, location:bedroom)
- camera:* (camera:angle_pov, camera:framing_closeup)
- spatial:* (spatial:orient_profile, spatial:depth_background)
- pose:* (pose:standing_neutral)
- rating:* (rating:sfw)
- part:* (part:face)
Do not use legacy prefixes such as cam:, manner:, act:, or state:.

RESPONSE FORMAT (JSON only, no other text):
{
  "candidates": [
    {
      "role": "<role_id>",
      "text": "the exact text from the prompt",
      "category": "fine-grained label like 'entrance', 'description', 'camera_move'",
      "ontology_ids": ["mood:tender", "camera:angle_pov"]
    }
  ],
  "tags": ["has:<role_id>", "tone:soft", "camera:pov"]
}

Be precise. Extract meaningful semantic information. Return ONLY valid JSON."""

COMPACT_ANALYSIS_SYSTEM_PROMPT = """Parse this prompt into semantic candidates. Return JSON only.

ROLES:
{role_lines}

JSON format: {{"candidates":[{{"role":"<role_id>","text":"exact text","ontology_ids":["prefix:name"]}}],"tags":["has:<role>"]}}

Ontology prefixes: mood, location, camera, spatial, pose, rating, part.
Return ONLY valid JSON."""


async def analyze_prompt_with_llm(
    text: str,
    model_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    instance_config: Optional[Dict[str, Any]] = None,
    role_registry: Optional[PromptRoleRegistry] = None,
    db: Optional["AsyncSession"] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Analyze prompt using an LLM for deeper semantic understanding.

    Args:
        text: Prompt text to analyze
        model_id: LLM model to use (e.g., "claude-sonnet-4", "gpt-4")
        provider_id: Provider ID (e.g., "anthropic-llm", "openai-llm")
        instance_config: Optional provider instance config override
        db: Optional database session for centralized AI Hub runtime resolution
        user_id: Optional user ID for credential/account resolution when db is provided

    Returns:
        Dict with same format as analyze_prompt():
        {
            "prompt": "<original text>",
            "candidates": [{"role": "...", "text": "...", "category": "...", "ontology_ids": [...]}],
            "tags": [...]
        }
    """
    import json

    from pixsim7.backend.main.services.llm.registry import llm_registry
    from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ProviderError

    ai_hub = AiHubService(db)
    resolved_provider_id, resolved_model_id = await ai_hub.resolve_provider_and_model(
        provider_id=provider_id,
        model_id=model_id,
    )
    logger.info(
        "LLM prompt analysis: provider=%s, model=%s",
        resolved_provider_id,
        resolved_model_id,
    )
    role_registry = role_registry or PromptRoleRegistry.default()

    config = instance_config or {}
    analysis_system_prompt = config.get("analysis_system_prompt")
    analysis_user_prompt = config.get("analysis_user_prompt")

    provider_config = {
        key: value
        for key, value in config.items()
        if key not in {"analysis_system_prompt", "analysis_user_prompt"}
    }

    user_prompt = _build_user_prompt(text, analysis_user_prompt)
    use_compact_system_prompt = resolved_provider_id == "local-llm"

    try:
        full_prompt = f"{_build_system_prompt(role_registry, analysis_system_prompt, compact=use_compact_system_prompt)}\n\n{user_prompt}"

        if db is not None:
            execution = await ai_hub.execute_prompt(
                provider_id=resolved_provider_id,
                model_id=resolved_model_id,
                prompt_before=full_prompt,
                context={"mode": "prompt_analysis"},
                user_id=user_id,
                instance_config=provider_config or None,
            )
            response_text = execution["prompt_after"]
        else:
            try:
                llm_provider = llm_registry.get(resolved_provider_id)
            except ProviderNotFoundError:
                logger.warning(
                    "LLM provider %s not found, falling back to simple parser",
                    resolved_provider_id,
                )
                return await _fallback_to_simple(text)

            response_text = await llm_provider.edit_prompt(
                model_id=resolved_model_id,
                prompt_before=full_prompt,
                context={"mode": "prompt_analysis"},
                account=None,
                instance_config=provider_config or None,
            )

        cleaned = _clean_json_response(response_text)
        result = json.loads(cleaned)

        raw_candidates = result.get("candidates") or result.get("blocks") or []
        candidates = _normalize_candidates(raw_candidates, role_registry)

        logger.info(f"LLM analysis complete: {len(candidates)} candidates")

        return {
            "prompt": text,
            "candidates": candidates,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        return await _fallback_to_simple(text)
    except ProviderError as e:
        logger.error(f"LLM provider error: {e}")
        return await _fallback_to_simple(text)
    except Exception as e:
        logger.error(f"Unexpected error in LLM analysis: {e}")
        return await _fallback_to_simple(text)


def _clean_json_response(response: str) -> str:
    """Clean LLM response to extract JSON."""
    cleaned = response.strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


_ONTOLOGY_ID_RE = re.compile(r"^[a-z][a-z0-9_]*:[a-z0-9_]+$")
_MAX_ONTOLOGY_ID_LEN = 80


def _sanitize_ontology_ids(raw: Any) -> List[str]:
    """Filter ontology IDs to canonical ``prefix:name`` entries only."""
    if not isinstance(raw, list):
        return []
    result: List[str] = []
    for value in raw:
        if not isinstance(value, str):
            continue
        oid = value.strip().lower()
        if not oid or len(oid) > _MAX_ONTOLOGY_ID_LEN:
            continue
        if not _ONTOLOGY_ID_RE.match(oid):
            continue
        result.append(oid)
    return result


def _normalize_candidates(
    candidates: List[Dict[str, Any]],
    role_registry: PromptRoleRegistry,
) -> List[Dict[str, Any]]:
    """Normalize and validate candidates from LLM response."""
    normalized = []

    for candidate in candidates:
        role = candidate.get("role")
        role_id = role_registry.resolve_role_id(str(role)) if role else "other"
        if not role_registry.has_role(role_id):
            role_id = "other"

        normalized.append({
            "role": role_id,
            "text": candidate.get("text", ""),
            "category": candidate.get("category"),
            "ontology_ids": _sanitize_ontology_ids(candidate.get("ontology_ids")),
            "source_type": "llm",
        })

    return normalized


async def _fallback_to_simple(text: str) -> Dict[str, Any]:
    """Fallback to simple parser when LLM fails."""
    from .dsl_adapter import analyze_prompt
    logger.info("Falling back to simple parser")
    return await analyze_prompt(text)


def _build_system_prompt(
    role_registry: PromptRoleRegistry,
    override_prompt: Optional[str],
    *,
    compact: bool = False,
) -> str:
    role_lines = []
    for role in role_registry.list_roles(sort_by_priority=True):
        description = role.description or role.label
        role_lines.append(f'- "{role.id}": {description}')
    rendered_role_lines = "\n".join(role_lines)

    if not override_prompt:
        template = COMPACT_ANALYSIS_SYSTEM_PROMPT if compact else BASE_ANALYSIS_SYSTEM_PROMPT
        return template.format(role_lines=rendered_role_lines)

    if "{role_lines}" in override_prompt:
        return override_prompt.replace("{role_lines}", rendered_role_lines)

    return f"{override_prompt}\n\nROLES:\n{rendered_role_lines}"


def _build_user_prompt(text: str, override_prompt: Optional[str]) -> str:
    if not override_prompt:
        return f"""Analyze this prompt:

{text}

Return the analysis as JSON following the specified schema."""

    if "{text}" in override_prompt:
        return override_prompt.replace("{text}", text)

    return f"{override_prompt}\n\n{text}"
