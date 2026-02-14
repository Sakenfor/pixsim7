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
from pixsim7.backend.main.services.prompt.tag_derivation import (
    PromptTag,
    derive_structured_and_flat_tags,
)
from .simple import SimplePromptParser


async def parse_prompt_to_candidates(
    text: str,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
    parser_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Parse prompt text into normalized candidates.

    Pure function: text → {"candidates": [...]}
    Candidates are transient parsed pieces (not stored PromptBlock entities).

    Args:
        text: Prompt text to parse
        role_registry: Optional PromptRoleRegistry for dynamic roles.
        parser_hints: Optional parser hints to augment role keywords.
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
    # Currently only SimplePromptParser is implemented.
    parser = SimplePromptParser(hints=parser_hints, role_registry=role_registry, config=parser_config)

    parsed = await parser.parse(text)

    candidates = candidates_from_segments(parsed.segments, source_type="parsed")
    return {"candidates": [candidate.model_dump() for candidate in candidates]}


def _derive_tags_from_candidates(
    candidates: List[Dict[str, Any]],
    *,
    structured: bool = True,
) -> tuple[List[PromptTag], List[str]]:
    """
    Derive tags from parsed prompt candidates.

    Returns structured tags with segment linking and flat tags for backward compatibility.

    Args:
        candidates: List of candidate dicts from parse_prompt_to_candidates
        structured: If True, return full structured tags; if False, only flat

    Returns:
        Tuple of (structured_tags, flat_tags)
        - structured_tags: List of PromptTag dicts with segment indices
        - flat_tags: Simple list of tag strings for backward compatibility
    """
    _ = structured
    return derive_structured_and_flat_tags(candidates)


async def analyze_prompt(
    text: str,
    analyzer_id: Optional[str] = None,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
    parser_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generic, source-agnostic prompt analysis.

    Pure function, no DB access, no source assumptions.
    Returns PixSim7-shaped JSON only.

    Args:
        text: Raw prompt text from any source (UI, files, external systems).
        analyzer_id: Which analyzer to use:
            - "parser:simple" (default): Fast keyword-based parser
            - "llm:claude": Claude-based semantic analysis
            - "llm:openai": OpenAI-based semantic analysis
        role_registry: Optional PromptRoleRegistry for dynamic roles.
        parser_hints: Optional parser hints to augment role keywords.

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
          ],
          "tags": [
            {"tag": "has:character", "candidates": [0], "source": "role", "confidence": 0.85},
            ...
          ],
          "tags_flat": ["has:character", "has:setting", ...]
        }
    """
    if not analyzer_id:
        analyzer_id = "parser:simple"

    if role_registry is None and parser_hints:
        role_registry = PromptRoleRegistry.default()
        role_registry.apply_hints(parser_hints)

    if analyzer_id.startswith("llm:"):
        from .llm_analyzer import analyze_prompt_with_llm

        provider_map = {
            "llm:claude": "anthropic-llm",
            "llm:openai": "openai-llm",
        }
        provider_id = provider_map.get(analyzer_id, "anthropic-llm")

        return await analyze_prompt_with_llm(
            text=text,
            provider_id=provider_id,
            role_registry=role_registry,
        )

    # Default: use simple parser
    result = await parse_prompt_to_candidates(
        text,
        role_registry=role_registry,
        parser_hints=parser_hints,
        parser_config=parser_config,
    )
    candidates: List[Dict[str, Any]] = result.get("candidates", [])

    # Derive structured tags with segment linking.
    tags, tags_flat = derive_structured_and_flat_tags(candidates)

    return {
        "prompt": text,
        "candidates": candidates,
        "tags": tags,
        "tags_flat": tags_flat,
    }
