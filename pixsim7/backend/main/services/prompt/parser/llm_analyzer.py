"""
LLM-based Prompt Analyzer

Uses Claude or other LLMs to analyze prompts with deeper semantic understanding.
Produces output compatible with SimplePromptParser for unified processing.
"""

import logging
from typing import Dict, Any, List, Optional

from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry

logger = logging.getLogger(__name__)

BASE_ANALYSIS_SYSTEM_PROMPT = """You are a prompt analyzer for an AI video generation system.

Your task is to parse a prompt into semantic blocks, classifying each by role.

ROLES (use exactly these values):
{role_lines}

INSTRUCTIONS:
1. Split the prompt into logical semantic units (phrases or sentences)
2. Assign each block the most appropriate role
3. Extract ontology IDs that describe the content semantically
4. Identify a category label for fine-grained classification

Ontology ID format: "prefix:name"
- act: actions (act:walk, act:embrace, act:look)
- state: states (state:aroused, state:tired, state:happy)
- part: anatomy (part:face, part:hand, part:chest)
- manner: how something is done (manner:gentle, manner:aggressive)
- cam: camera (cam:pov, cam:closeup, cam:pan)

RESPONSE FORMAT (JSON only, no other text):
{
  "blocks": [
    {
      "role": "<role_id>",
      "text": "the exact text from the prompt",
      "category": "fine-grained label like 'entrance', 'description', 'camera_move'",
      "ontology_ids": ["act:walk", "manner:slow"]
    }
  ],
  "tags": ["has:<role_id>", "tone:soft", "cam:pov"]
}

Be precise. Extract meaningful semantic information. Return ONLY valid JSON."""


async def analyze_prompt_with_llm(
    text: str,
    model_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    instance_config: Optional[Dict[str, Any]] = None,
    role_registry: Optional[PromptRoleRegistry] = None,
) -> Dict[str, Any]:
    """
    Analyze prompt using an LLM for deeper semantic understanding.

    Args:
        text: Prompt text to analyze
        model_id: LLM model to use (e.g., "claude-sonnet-4", "gpt-4")
        provider_id: Provider ID (e.g., "anthropic-llm", "openai-llm")
        instance_config: Optional provider instance config override

    Returns:
        Dict with same format as analyze_prompt():
        {
            "prompt": "<original text>",
            "blocks": [{"role": "...", "text": "...", "category": "...", "ontology_ids": [...]}],
            "tags": [...]
        }
    """
    import json

    from pixsim7.backend.main.services.llm.registry import llm_registry
    from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ProviderError

    if not provider_id:
        provider_id = "anthropic-llm"
    if not model_id:
        model_id = "claude-sonnet-4-20250514"

    logger.info(f"LLM prompt analysis: provider={provider_id}, model={model_id}")
    role_registry = role_registry or PromptRoleRegistry.default()

    try:
        llm_provider = llm_registry.get(provider_id)
    except ProviderNotFoundError:
        logger.warning(f"LLM provider {provider_id} not found, falling back to simple parser")
        return await _fallback_to_simple(text)

    config = instance_config or {}
    analysis_system_prompt = config.get("analysis_system_prompt")
    analysis_user_prompt = config.get("analysis_user_prompt")

    provider_config = {
        key: value
        for key, value in config.items()
        if key not in {"analysis_system_prompt", "analysis_user_prompt"}
    }

    user_prompt = _build_user_prompt(text, analysis_user_prompt)

    try:
        full_prompt = f"{_build_system_prompt(role_registry, analysis_system_prompt)}\n\n{user_prompt}"

        response_text = await llm_provider.edit_prompt(
            model_id=model_id,
            prompt_before=full_prompt,
            context={"mode": "prompt_analysis"},
            account=None,
            instance_config=provider_config or None,
        )

        cleaned = _clean_json_response(response_text)
        result = json.loads(cleaned)

        blocks = _normalize_blocks(result.get("blocks", []), role_registry)
        tags = result.get("tags", [])

        derived_tags = _derive_tags_from_blocks(blocks)
        all_tags = list(set(tags + derived_tags))

        logger.info(f"LLM analysis complete: {len(blocks)} blocks, {len(all_tags)} tags")

        sorted_tags = sorted(all_tags)
        return {
            "prompt": text,
            "blocks": blocks,
            "tags": sorted_tags,
            "tags_flat": sorted_tags,  # Consistent with simple parser output
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


def _normalize_blocks(
    blocks: List[Dict[str, Any]],
    role_registry: PromptRoleRegistry,
) -> List[Dict[str, Any]]:
    """Normalize and validate blocks from LLM response."""
    normalized = []

    for block in blocks:
        role = block.get("role")
        role_id = role_registry.resolve_role_id(str(role)) if role else "other"
        if not role_registry.has_role(role_id):
            role_id = "other"

        normalized.append({
            "role": role_id,
            "text": block.get("text", ""),
            "category": block.get("category"),
            "ontology_ids": block.get("ontology_ids", []),
        })

    return normalized


def _derive_tags_from_blocks(blocks: List[Dict[str, Any]]) -> List[str]:
    """Derive standard tags from blocks."""
    tags = set()

    for block in blocks:
        role = block.get("role")
        if role:
            tags.add(f"has:{role}")

        for oid in block.get("ontology_ids", []):
            if oid.startswith("cam:"):
                tags.add(f"camera:{oid.split(':')[1]}")
            elif oid.startswith("manner:"):
                manner = oid.split(':')[1]
                if manner in ("gentle", "soft", "tender"):
                    tags.add("tone:soft")
                elif manner in ("intense", "aggressive", "rough"):
                    tags.add("tone:intense")

    return list(tags)


async def _fallback_to_simple(text: str) -> Dict[str, Any]:
    """Fallback to simple parser when LLM fails."""
    from .dsl_adapter import analyze_prompt
    logger.info("Falling back to simple parser")
    return await analyze_prompt(text)


def _build_system_prompt(
    role_registry: PromptRoleRegistry,
    override_prompt: Optional[str],
) -> str:
    role_lines = []
    for role in role_registry.list_roles(sort_by_priority=True):
        description = role.description or role.label
        role_lines.append(f'- "{role.id}": {description}')
    rendered_role_lines = "\n".join(role_lines)

    if not override_prompt:
        return BASE_ANALYSIS_SYSTEM_PROMPT.format(role_lines=rendered_role_lines)

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
