"""
Prompt DSL Adapter

Thin adapter layer between PixSim7's native prompt parser and the rest of PixSim7.
Converts parsed prompts into PixSim7-shaped JSON (parser-agnostic).

Purpose:
- Keep parser usage isolated and swappable
- Prevent parser types from leaking into database or API responses
- Provide stable PixSim7 schema for parsed prompts

Design:
- Pure function: text → dict (no side effects)
- No database access
- No LLM calls
- Returns plain dicts/strings only
"""
from typing import Dict, Any, List, Optional

from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from pixsim7.backend.main.services.prompt.candidates import candidates_from_segments
from pixsim7.backend.main.services.prompt.parser.primitive_projection import (
    enrich_candidates_with_primitive_projection,
    normalize_primitive_projection_mode,
)
from .simple import SimplePromptParser


async def parse_prompt_to_candidates(
    text: str,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Parse prompt text into normalized candidates.

    Pure function: text → {"candidates": [...]}
    Candidates are transient parsed pieces (not stored PromptBlock entities).

    Vocabulary (keywords, hints) is controlled via role_registry — enrich it
    with semantic packs before calling.  Behavior (stemming, thresholds, etc.)
    is controlled via parser_config.

    Args:
        text: Prompt text to parse
        role_registry: Optional PromptRoleRegistry (enriched with pack hints).
        parser_config: Optional config dict for parser behavior.

    Returns:
        Dict with "candidates" key containing list of:
        {
            "role": "<role_id>",
            "text": "...",
            "start_pos": int,
            "end_pos": int,
            "sentence_index": int,
            "confidence": float,
            "matched_keywords": [...],
            "metadata": { ... },
            "role_scores": { ... },
        }
    """
    parser = SimplePromptParser(role_registry=role_registry, config=parser_config)

    parsed = await parser.parse(text)

    candidates = candidates_from_segments(parsed.segments, source_type="parsed")
    dumped_candidates = [candidate.model_dump() for candidate in candidates]

    projection_mode = normalize_primitive_projection_mode(
        (parser_config or {}).get("primitive_projection_mode")
    )
    if projection_mode != "off":
        dumped_candidates = enrich_candidates_with_primitive_projection(
            dumped_candidates,
            mode=projection_mode,
        )

    return {"candidates": dumped_candidates}


async def analyze_prompt(
    text: str,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Parse and analyze a prompt using the simple parser.

    Pure function, no DB access, no LLM calls, no routing.
    Returns PixSim7-shaped JSON only.

    Vocabulary is controlled via role_registry — semantic packs enrich it
    with hints before this function is called.  Behavior (stemming,
    thresholds, role overrides) is controlled via parser_config.

    Args:
        text: Raw prompt text from any source (UI, files, external systems).
        role_registry: Optional PromptRoleRegistry (enriched with pack hints).
        parser_config: Optional config dict for parser behavior.

    Returns:
        {
          "prompt": "<original text>",
          "candidates": [
            {
              "role": "character",
              "text": "...",
              "start_pos": 0,
              "end_pos": 10,
              "confidence": 0.85,
              "matched_keywords": ["vampire"]
            },
            ...
          ]
        }

    Tags are derived from candidates at asset creation time and stored
    in the asset_tag join table (source='analysis').
    """
    result = await parse_prompt_to_candidates(
        text,
        role_registry=role_registry,
        parser_config=parser_config,
    )
    candidates: List[Dict[str, Any]] = result.get("candidates", [])

    return {
        "prompt": text,
        "candidates": candidates,
    }
