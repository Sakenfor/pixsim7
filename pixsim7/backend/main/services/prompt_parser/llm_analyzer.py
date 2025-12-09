"""
LLM-based Prompt Analyzer

Uses Claude or other LLMs to analyze prompts with deeper semantic understanding.
Produces output compatible with SimplePromptParser for unified processing.
"""

import logging
from typing import Dict, Any, List, Optional

from .simple import PromptSegmentRole

logger = logging.getLogger(__name__)


# System prompt for LLM-based prompt analysis
ANALYSIS_SYSTEM_PROMPT = """You are a prompt analyzer for an AI video generation system.

Your task is to parse a prompt into semantic blocks, classifying each by role.

ROLES (use exactly these values):
- "character": Descriptions of people, creatures, beings (e.g., "A muscular werewolf")
- "action": Actions, movements, behaviors (e.g., "walks slowly toward the camera")
- "setting": Environment, location, time (e.g., "in a moonlit forest clearing")
- "mood": Emotional tone, atmosphere (e.g., "with a sense of mystery")
- "romance": Romantic or intimate content (e.g., "gazes lovingly")
- "other": Camera directions, technical instructions, or unclassifiable content

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
      "role": "character|action|setting|mood|romance|other",
      "text": "the exact text from the prompt",
      "category": "fine-grained label like 'entrance', 'description', 'camera_move'",
      "ontology_ids": ["act:walk", "manner:slow"]
    }
  ],
  "tags": ["has:character", "tone:soft", "cam:pov"]
}

Be precise. Extract meaningful semantic information. Return ONLY valid JSON."""


async def analyze_prompt_with_llm(
    text: str,
    model_id: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Analyze prompt using an LLM for deeper semantic understanding.

    Args:
        text: Prompt text to analyze
        model_id: LLM model to use (e.g., "claude-sonnet-4", "gpt-4")
        provider_id: Provider ID (e.g., "anthropic-llm", "openai-llm")

    Returns:
        Dict with same format as analyze_prompt():
        {
            "prompt": "<original text>",
            "blocks": [{"role": "...", "text": "...", "category": "...", "ontology_ids": [...]}],
            "tags": [...]
        }
    """
    import json

    # Import here to avoid circular imports
    from pixsim7.backend.main.services.llm.registry import llm_registry
    from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ProviderError

    # Default provider/model
    if not provider_id:
        provider_id = "anthropic-llm"
    if not model_id:
        model_id = "claude-sonnet-4-20250514"

    logger.info(f"LLM prompt analysis: provider={provider_id}, model={model_id}")

    try:
        llm_provider = llm_registry.get(provider_id)
    except ProviderNotFoundError:
        logger.warning(f"LLM provider {provider_id} not found, falling back to simple parser")
        # Fallback to simple parser
        from .simple import SimplePromptParser
        return await _fallback_to_simple(text)

    # Build the user prompt
    user_prompt = f"""Analyze this prompt:

{text}

Return the analysis as JSON following the specified schema."""

    # Call LLM - using edit_prompt interface with our analysis prompt
    try:
        # Combine system + user prompt since edit_prompt expects a single prompt
        full_prompt = f"{ANALYSIS_SYSTEM_PROMPT}\n\n{user_prompt}"

        response_text = await llm_provider.edit_prompt(
            model_id=model_id,
            prompt_before=full_prompt,
            context={"mode": "prompt_analysis"},
            account=None  # Uses environment API key
        )

        # Parse JSON response
        cleaned = _clean_json_response(response_text)
        result = json.loads(cleaned)

        # Validate and normalize the response
        blocks = _normalize_blocks(result.get("blocks", []))
        tags = result.get("tags", [])

        # Derive additional tags from blocks
        derived_tags = _derive_tags_from_blocks(blocks)
        all_tags = list(set(tags + derived_tags))

        logger.info(f"LLM analysis complete: {len(blocks)} blocks, {len(all_tags)} tags")

        return {
            "prompt": text,
            "blocks": blocks,
            "tags": sorted(all_tags),
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

    # Remove markdown code fences
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def _normalize_blocks(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize and validate blocks from LLM response."""
    valid_roles = {r.value for r in PromptSegmentRole}
    normalized = []

    for block in blocks:
        role = block.get("role", "other").lower()
        if role not in valid_roles:
            role = "other"

        normalized.append({
            "role": role,
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

        # Add ontology-based tags
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
    from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
    logger.info("Falling back to simple parser")
    return await analyze_prompt(text)
