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

from .simple import SimplePromptParser


async def parse_prompt_to_blocks(text: str, model_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse prompt text into PixSim7 block format.

    Pure function: text → {"blocks": [...]}
    Blocks are PIXSIM7-SHAPED JSON, not parser objects.

    Args:
        text: Prompt text to parse
        model_id: Optional parser model ID. Supported values:
            - "parser:native-simple" (default): Simple native parser
            - "parser:native-strict": Strict native parser (future)
            - None: Uses default (simple)

    Returns:
        Dict with "blocks" key containing list of:
        {
            "role": "character" | "action" | "setting" | "mood" | "romance" | "other",
            "text": "...",
        }
    """
    if model_id is None:
        model_id = "parser:native-simple"

    # Select parser based on model_id
    if model_id in ("parser:native-simple", "native:simple", "prompt-dsl:simple"):
        parser = SimplePromptParser()
    elif model_id in ("parser:native-strict", "prompt-dsl:strict"):
        parser = SimplePromptParser()  # Future: strict parser
    else:
        parser = SimplePromptParser()

    parsed = await parser.parse(text)

    blocks: List[Dict[str, Any]] = []
    for segment in parsed.segments:
        block = {
            "role": segment.role.value,
            "text": segment.text,
        }
        blocks.append(block)

    return {"blocks": blocks}


def _derive_tags_from_blocks(blocks: List[Dict[str, Any]]) -> List[str]:
    """
    Derive tags from PixSim7-shaped blocks.

    - Role tags: "has:character", "has:action", etc.
    - Simple intensity/mood hints based on keywords.
    """
    role_tags: Set[str] = set()
    keyword_tags: Set[str] = set()

    for block in blocks:
        role = block.get("role")
        text = (block.get("text") or "").lower()

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

    Returns:
        {
          "prompt": "<original text>",
          "blocks": [...],
          "tags": ["has:character", "tone:soft", ...]
        }
    """
    if not analyzer_id:
        analyzer_id = "parser:simple"

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
        )

    # Default: use simple parser
    blocks_result = await parse_prompt_to_blocks(text)
    blocks: List[Dict[str, Any]] = blocks_result.get("blocks", [])
    tags = _derive_tags_from_blocks(blocks)

    return {
        "prompt": text,
        "blocks": blocks,
        "tags": tags,
    }
