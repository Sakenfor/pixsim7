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
from typing import Dict, Any, List, Set, Optional

from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from .simple import SimplePromptParser


async def parse_prompt_to_segments(
    text: str,
    model_id: Optional[str] = None,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """
    Parse prompt text into segments.

    Pure function: text → {"segments": [...]}
    Segments are transient parsed pieces (not stored PromptBlock entities).

    Args:
        text: Prompt text to parse
        model_id: Optional parser model ID (currently unused - simple parser only).
        role_registry: Optional PromptRoleRegistry for dynamic roles.
        parser_hints: Optional parser hints to augment role keywords.

    Returns:
        Dict with "segments" key containing list of:
        {
            "role": "<role_id>",
            "text": "...",
            "start_pos": int,
            "end_pos": int,
        }
    """
    # Currently only SimplePromptParser is implemented
    # model_id parameter is accepted for future extensibility but ignored
    parser = SimplePromptParser(hints=parser_hints, role_registry=role_registry)

    parsed = await parser.parse(text)

    segments: List[Dict[str, Any]] = []
    for seg in parsed.segments:
        segments.append({
            "role": seg.role,
            "text": seg.text,
            "start_pos": seg.start_pos,
            "end_pos": seg.end_pos,
        })

    return {"segments": segments}


# Backward-compatibility alias (deprecated, use parse_prompt_to_segments)
async def parse_prompt_to_blocks(
    text: str,
    model_id: Optional[str] = None,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """Deprecated: Use parse_prompt_to_segments instead."""
    result = await parse_prompt_to_segments(text, model_id, role_registry=role_registry, parser_hints=parser_hints)
    # Return old format for backward compatibility
    return {"blocks": result.get("segments", [])}


def _derive_tags_from_segments(segments: List[Dict[str, Any]]) -> List[str]:
    """
    Derive tags from parsed prompt segments.

    - Role tags: "has:character", "has:action", etc.
    - Simple intensity/mood hints based on keywords.
    """
    role_tags: Set[str] = set()
    keyword_tags: Set[str] = set()

    for segment in segments:
        role = segment.get("role")
        text = (segment.get("text") or "").lower()

        if role:
            role_tags.add(f"has:{role}")

        if any(word in text for word in ("gentle", "soft", "tender")):
            keyword_tags.add("tone:soft")
        if any(word in text for word in ("intense", "harsh", "rough", "violent")):
            keyword_tags.add("tone:intense")
        if any(word in text for word in ("pov", "first-person", "viewpoint")):
            keyword_tags.add("camera:pov")
        if any(word in text for word in ("close-up", "close up", "tight framing")):
            keyword_tags.add("camera:closeup")

    return sorted(role_tags) + sorted(keyword_tags)


async def analyze_prompt(
    text: str,
    analyzer_id: Optional[str] = None,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
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
          "segments": [...],
          "tags": ["has:character", "tone:soft", ...]
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
    result = await parse_prompt_to_segments(
        text,
        role_registry=role_registry,
        parser_hints=parser_hints,
    )
    segments: List[Dict[str, Any]] = result.get("segments", [])
    tags = _derive_tags_from_segments(segments)

    return {
        "prompt": text,
        "segments": segments,
        "tags": tags,
    }
