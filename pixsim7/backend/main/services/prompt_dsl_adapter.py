"""
Prompt DSL Adapter - PixSim7 Backend

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
from pixsim7.backend.main.services.prompt_parser import SimplePromptParser, ParsedRole


# ===== ADAPTER API =====

async def parse_prompt_to_blocks(text: str, model_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse prompt text into PixSim7 block format.

    Pure function: text → {"blocks": [...]}
    Blocks are PIXSIM7-SHAPED JSON, not parser objects.

    Args:
        text: Prompt text to parse
        model_id: Optional parser model ID (currently only supports "native:simple" or None)

    Returns:
        Dict with "blocks" key containing list of:
        {
            "role": "character" | "action" | "setting" | "mood" | "romance" | "other",
            "text": "...",
        }

    Example:
        >>> result = await parse_prompt_to_blocks("A werewolf enters the forest")
        >>> result
        {
            "blocks": [
                {"role": "character", "text": "A werewolf enters the forest"}
            ]
        }
    """
    # Initialize native parser
    parser = SimplePromptParser()

    # Parse the prompt using native simple parser
    parsed = await parser.parse(text)

    # Convert ParsedBlocks to PixSim7 blocks
    blocks: List[Dict[str, Any]] = []

    for parsed_block in parsed.blocks:
        # Build block (plain dict, no parser objects)
        block = {
            "role": parsed_block.role.value,
            "text": parsed_block.text,
        }

        blocks.append(block)

    # Return PixSim7-shaped response
    return {
        "blocks": blocks
    }


def _derive_tags_from_blocks(blocks: List[Dict[str, Any]]) -> List[str]:
    """
    Very small, generic tag derivation based only on PixSim7-shaped blocks.

    - Role tags: "has:character", "has:action", etc.
    - Simple intensity/mood hints based on keywords (safe to evolve later).
    """
    role_tags: Set[str] = set()
    keyword_tags: Set[str] = set()

    for block in blocks:
        role = block.get("role")
        text = (block.get("text") or "").lower()

        if role:
            role_tags.add(f"has:{role}")

        # Extremely conservative starter keywords; extend later as needed
        if any(word in text for word in ("gentle", "soft", "tender")):
            keyword_tags.add("tone:soft")
        if any(word in text for word in ("intense", "harsh", "rough", "violent")):
            keyword_tags.add("tone:intense")
        if any(word in text for word in ("pov", "first-person", "viewpoint")):
            keyword_tags.add("camera:pov")
        if any(word in text for word in ("close-up", "close up", "tight framing")):
            keyword_tags.add("camera:closeup")

    # Order is not semantically important, but stable ordering is nice
    return sorted(role_tags) + sorted(keyword_tags)


async def analyze_prompt(text: str) -> Dict[str, Any]:
    """
    Generic, source-agnostic prompt analysis.

    Pure function, no DB access, no source assumptions.
    Returns PixSim7-shaped JSON only.

    Args:
        text: Raw prompt text from any source (UI, files, external systems).

    Returns:
        {
          "prompt": "<original text>",
          "blocks": [...],  # from parse_prompt_to_blocks(...)
          "tags": ["has:character", "tone:soft", ...]
        }
    """
    blocks_result = await parse_prompt_to_blocks(text)
    blocks: List[Dict[str, Any]] = blocks_result.get("blocks", [])
    tags = _derive_tags_from_blocks(blocks)

    return {
        "prompt": text,
        "blocks": blocks,
        "tags": tags,
    }
