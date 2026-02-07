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
from pixsim7.backend.main.services.prompt.candidates import candidates_from_segments
from .simple import SimplePromptParser


# Sub-tag derivation rules: tag name -> trigger keywords.
# Keywords here MUST also exist in role keyword lists (ontology.py) so they go
# through the parser pipeline (stemming, negation, hints) before reaching here.
_TAG_KEYWORD_RULES: Dict[str, Set[str]] = {
    "tone:soft": {"gentle", "soft", "tender"},
    "tone:intense": {"intense", "harsh", "rough", "violent"},
    "camera:pov": {"pov", "first-person", "point of view", "viewpoint"},
    "camera:closeup": {"close-up", "closeup", "close up", "tight framing"},
}


class PromptTag(TypedDict, total=False):
    """Structured tag with segment linking."""
    tag: str
    candidates: List[int]  # Indices into candidates array
    source: str  # 'role' | 'keyword' | 'ontology'
    confidence: float


async def parse_prompt_to_candidates(
    text: str,
    model_id: Optional[str] = None,
    *,
    role_registry: Optional[PromptRoleRegistry] = None,
    parser_hints: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """
    Parse prompt text into normalized candidates.

    Pure function: text → {"candidates": [...]}
    Candidates are transient parsed pieces (not stored PromptBlock entities).

    Args:
        text: Prompt text to parse
        model_id: Optional parser model ID (currently unused - simple parser only).
        role_registry: Optional PromptRoleRegistry for dynamic roles.
        parser_hints: Optional parser hints to augment role keywords.

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
    # Currently only SimplePromptParser is implemented
    # model_id parameter is accepted for future extensibility but ignored
    parser = SimplePromptParser(hints=parser_hints, role_registry=role_registry)

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
    # Track which candidates contribute to each tag
    role_tag_segments: Dict[str, List[int]] = {}
    role_tag_confidence: Dict[str, float] = {}
    keyword_tags: Dict[str, tuple[List[int], str]] = {}  # tag -> (candidates, source)

    for idx, candidate in enumerate(candidates):
        role = candidate.get("role")
        confidence = candidate.get("confidence", 0.0)

        # Role-based tags
        if role and role != "other":
            tag = f"has:{role}"
            if tag not in role_tag_segments:
                role_tag_segments[tag] = []
                role_tag_confidence[tag] = 0.0
            role_tag_segments[tag].append(idx)
            # Keep max confidence for the tag
            role_tag_confidence[tag] = max(role_tag_confidence[tag], confidence)

        # Derive sub-tags from parser-matched keywords (benefits from
        # stemming, negation detection, and semantic-pack hints)
        matched_kws = {kw.lower() for kw in (candidate.get("matched_keywords") or [])}
        for tag, trigger_keywords in _TAG_KEYWORD_RULES.items():
            if matched_kws & trigger_keywords:
                _add_keyword_tag(keyword_tags, tag, idx, "keyword")

        # Ontology-based tags (matched vocabulary IDs)
        metadata = candidate.get("metadata") if isinstance(candidate, dict) else None
        ontology_ids = []
        if isinstance(metadata, dict):
            ontology_ids = metadata.get("ontology_ids") or []
        if not ontology_ids:
            ontology_ids = candidate.get("ontology_ids") or []
        if isinstance(ontology_ids, list):
            for oid in ontology_ids:
                if not isinstance(oid, str) or not oid:
                    continue
                tag = oid.strip()
                if not tag:
                    continue
                if tag in keyword_tags and keyword_tags[tag][1] != "ontology":
                    keyword_tags[tag] = (keyword_tags[tag][0], "ontology")
                _add_keyword_tag(keyword_tags, tag, idx, "ontology")

    # Build structured tags
    structured_tags: List[PromptTag] = []

    # Add role tags (sorted for consistency)
    for tag in sorted(role_tag_segments.keys()):
        structured_tags.append({
            "tag": tag,
            "candidates": role_tag_segments[tag],
            "source": "role",
            "confidence": round(role_tag_confidence[tag], 3),
        })

    # Add keyword tags
    for tag in sorted(keyword_tags.keys()):
        seg_indices, source = keyword_tags[tag]
        structured_tags.append({
            "tag": tag,
            "candidates": seg_indices,
            "source": source,
        })

    # Build flat tags for backward compatibility
    flat_tags = [t["tag"] for t in structured_tags]

    return structured_tags, flat_tags


def _add_keyword_tag(
    tags_dict: Dict[str, tuple[List[int], str]],
    tag: str,
    candidate_idx: int,
    source: str,
) -> None:
    """Helper to add candidate to a keyword tag."""
    if tag not in tags_dict:
        tags_dict[tag] = ([], source)
    tags_dict[tag][0].append(candidate_idx)


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
    )
    candidates: List[Dict[str, Any]] = result.get("candidates", [])

    # Derive structured tags with segment linking
    tags, tags_flat = _derive_tags_from_candidates(candidates)

    return {
        "prompt": text,
        "candidates": candidates,
        "tags": tags,
        "tags_flat": tags_flat,
    }
