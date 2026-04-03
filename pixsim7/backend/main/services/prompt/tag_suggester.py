"""
AI-assisted tag suggestion for PromptFamily library organization.

Separate from the structural prompt analyzer — this module asks the LLM
to produce short human-readable tags suitable for browsing a prompt library
(e.g. "character:warrior", "location:forest"), not structural role tags
(e.g. "has:character").

Entry point: suggest_family_tags()
"""
from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, List, Optional

from .tag_vocabulary import tag_vocabulary_registry

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Slug validation: prefix:value, lowercase, hyphens allowed
_TAG_RE = re.compile(r"^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$")


def _build_system_prompt(mode_id: Optional[str]) -> str:
    vocab = tag_vocabulary_registry.get(mode_id)

    prefix_lines = "\n".join(
        f"  {p.prefix}: {p.description}"
        + (f" — e.g. {', '.join(p.prefix + ':' + ex for ex in p.examples[:4])}" if p.examples else "")
        for p in vocab.prefixes
    )

    return (
        f"You generate short library-organization tags for AI image/video generation prompts.\n\n"
        f"{vocab.instruction}\n\n"
        f"Available tag prefixes (use ONLY these):\n{prefix_lines}\n\n"
        f"Rules:\n"
        f"- Return {vocab.min_tags}–{vocab.max_tags} tags total\n"
        f"- Format: prefix:value  (lowercase, hyphens for spaces, e.g. character:dark-elf)\n"
        f"- Be specific but not over-specific — aim for reusable library labels\n"
        f"- Return a JSON array only, no other text: [\"tag:value\", ...]"
    )


def _parse_response(text: str) -> List[str]:
    """Extract and validate tags from LLM JSON response."""
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if not match:
        return []
    try:
        raw = json.loads(match.group())
    except json.JSONDecodeError:
        return []
    return [t for t in raw if isinstance(t, str) and _TAG_RE.match(t)]


async def suggest_family_tags(
    prompt_text: str,
    mode_id: Optional[str],
    *,
    db: "AsyncSession",
    user_id: Optional[int] = None,
    provider_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> List[str]:
    """
    Ask the LLM to suggest library-organization tags for a prompt family.

    Args:
        prompt_text: The prompt text to tag (typically the latest version).
        mode_id:     AuthoringMode id or PromptFamily.category used to select
                     the vocabulary from tag_vocabulary.yaml.
        db:          DB session for AI Hub provider resolution.
        user_id:     Optional user for credential resolution.
        provider_id: Override LLM provider (defaults to system default).
        model_id:    Override model (defaults to system default).

    Returns:
        List of validated tag slugs, e.g. ["character:warrior", "design:armored"].
        Empty list on any failure — caller should treat as no-op.
    """
    from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService

    try:
        ai_hub = AiHubService(db)
        resolved_provider_id, resolved_model_id = await ai_hub.resolve_provider_and_model(
            provider_id=provider_id,
            model_id=model_id,
        )

        system_prompt = _build_system_prompt(mode_id)
        full_prompt = f"{system_prompt}\n\nPrompt to tag:\n{prompt_text}"

        execution = await ai_hub.execute_prompt(
            provider_id=resolved_provider_id,
            model_id=resolved_model_id,
            prompt_before=full_prompt,
            context={"mode": "family_tag_suggestion", "authoring_mode": mode_id},
            user_id=user_id,
        )
        response_text = execution["prompt_after"]
        tags = _parse_response(response_text)

        logger.info(
            "tag_suggestion_complete",
            extra={"mode_id": mode_id, "tag_count": len(tags), "tags": tags},
        )
        return tags

    except Exception:
        logger.warning("tag_suggestion_failed", exc_info=True)
        return []
