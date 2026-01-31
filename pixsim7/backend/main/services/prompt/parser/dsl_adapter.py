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
from typing import Dict, Any, List, Set, Optional, TypedDict

from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from .simple import SimplePromptParser


class PromptTag(TypedDict, total=False):
    """Structured tag with segment linking."""
    tag: str
    segments: List[int]  # Indices into segments array
    source: str  # 'role' | 'keyword' | 'ontology'
    confidence: float


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
            "confidence": float,
            "matched_keywords": [...],
        }
    """
    # Currently only SimplePromptParser is implemented
    # model_id parameter is accepted for future extensibility but ignored
    parser = SimplePromptParser(hints=parser_hints, role_registry=role_registry)

    parsed = await parser.parse(text)

    segments: List[Dict[str, Any]] = []
    for seg in parsed.segments:
        segment_dict: Dict[str, Any] = {
            "role": seg.role,
            "text": seg.text,
            "start_pos": seg.start_pos,
            "end_pos": seg.end_pos,
            "confidence": seg.confidence,
        }
        # Only include matched_keywords if non-empty
        if seg.matched_keywords:
            segment_dict["matched_keywords"] = seg.matched_keywords
        segments.append(segment_dict)

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


def _derive_tags_from_segments(
    segments: List[Dict[str, Any]],
    *,
    structured: bool = True,
) -> tuple[List[PromptTag], List[str]]:
    """
    Derive tags from parsed prompt segments.

    Returns structured tags with segment linking and flat tags for backward compatibility.

    Args:
        segments: List of segment dicts from parse_prompt_to_segments
        structured: If True, return full structured tags; if False, only flat

    Returns:
        Tuple of (structured_tags, flat_tags)
        - structured_tags: List of PromptTag dicts with segment indices
        - flat_tags: Simple list of tag strings for backward compatibility
    """
    # Track which segments contribute to each tag
    role_tag_segments: Dict[str, List[int]] = {}
    role_tag_confidence: Dict[str, float] = {}
    keyword_tags: Dict[str, tuple[List[int], str]] = {}  # tag -> (segments, source)

    for idx, segment in enumerate(segments):
        role = segment.get("role")
        text = (segment.get("text") or "").lower()
        confidence = segment.get("confidence", 0.0)

        # Role-based tags
        if role and role != "other":
            tag = f"has:{role}"
            if tag not in role_tag_segments:
                role_tag_segments[tag] = []
                role_tag_confidence[tag] = 0.0
            role_tag_segments[tag].append(idx)
            # Keep max confidence for the tag
            role_tag_confidence[tag] = max(role_tag_confidence[tag], confidence)

        # Keyword-based tags for tone/camera
        if any(word in text for word in ("gentle", "soft", "tender")):
            _add_keyword_tag(keyword_tags, "tone:soft", idx, "keyword")
        if any(word in text for word in ("intense", "harsh", "rough", "violent")):
            _add_keyword_tag(keyword_tags, "tone:intense", idx, "keyword")
        if any(word in text for word in ("pov", "first-person", "viewpoint")):
            _add_keyword_tag(keyword_tags, "camera:pov", idx, "keyword")
        if any(word in text for word in ("close-up", "close up", "tight framing")):
            _add_keyword_tag(keyword_tags, "camera:closeup", idx, "keyword")

    # Build structured tags
    structured_tags: List[PromptTag] = []

    # Add role tags (sorted for consistency)
    for tag in sorted(role_tag_segments.keys()):
        structured_tags.append({
            "tag": tag,
            "segments": role_tag_segments[tag],
            "source": "role",
            "confidence": round(role_tag_confidence[tag], 3),
        })

    # Add keyword tags
    for tag in sorted(keyword_tags.keys()):
        seg_indices, source = keyword_tags[tag]
        structured_tags.append({
            "tag": tag,
            "segments": seg_indices,
            "source": source,
        })

    # Build flat tags for backward compatibility
    flat_tags = [t["tag"] for t in structured_tags]

    return structured_tags, flat_tags


def _add_keyword_tag(
    tags_dict: Dict[str, tuple[List[int], str]],
    tag: str,
    segment_idx: int,
    source: str,
) -> None:
    """Helper to add segment to a keyword tag."""
    if tag not in tags_dict:
        tags_dict[tag] = ([], source)
    tags_dict[tag][0].append(segment_idx)


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
          "segments": [
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
            {"tag": "has:character", "segments": [0], "source": "role", "confidence": 0.85},
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
    result = await parse_prompt_to_segments(
        text,
        role_registry=role_registry,
        parser_hints=parser_hints,
    )
    segments: List[Dict[str, Any]] = result.get("segments", [])

    # Derive structured tags with segment linking
    tags, tags_flat = _derive_tags_from_segments(segments)

    return {
        "prompt": text,
        "segments": segments,
        "tags": tags,
        "tags_flat": tags_flat,
    }
