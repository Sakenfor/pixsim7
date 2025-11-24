"""
Prompt DSL Adapter - PixSim7 Backend

Thin adapter layer between pixsim-prompt-dsl and PixSim7.
Converts DSL-parsed prompts into PixSim7-shaped JSON (parser-agnostic).

Purpose:
- Keep DSL usage isolated and swappable
- Prevent DSL types from leaking into database or API responses
- Provide stable PixSim7 schema for parsed prompts

Design:
- Pure function: text → dict (no side effects)
- No database access
- No LLM calls
- Returns plain dicts/strings only
"""
from typing import Dict, Any, List
from prompt_dsl import PromptParser, LogicalComponent, ComponentType


# ===== TYPE MAPPING =====
# Maps DSL ComponentType → PixSim7 role

def _map_component_type_to_role(component_type: ComponentType) -> str:
    """
    Map DSL component types to PixSim7 roles.

    PixSim7 roles:
    - character: Character-related components
    - action: Actions and beats
    - setting: Location and time
    - mood: Emotions and atmosphere
    - romance: Romance/intimacy (if available)
    - other: Technical details (camera, lighting, etc.)
    """
    # ComponentType values are strings like "character.identity", "action.movement"
    component_type_str = str(component_type.value)

    # Split on dot to get category
    category = component_type_str.split('.')[0]

    # Map categories to PixSim7 roles
    if category == 'character':
        return 'character'
    elif category == 'action' or category == 'beat':
        return 'action'
    elif category == 'setting':
        # Special case: atmosphere → mood
        if 'atmosphere' in component_type_str:
            return 'mood'
        return 'setting'
    elif category == 'emotion':
        return 'mood'
    elif category == 'romance' or category == 'intimacy':
        return 'romance'
    else:
        # Camera, technical, etc.
        return 'other'


# ===== ADAPTER API =====

async def parse_prompt_to_blocks(text: str) -> Dict[str, Any]:
    """
    Parse prompt text into PixSim7 block format.

    Pure function: text → {"blocks": [...]}
    Blocks are PIXSIM7-SHAPED JSON, not DSL objects.

    Args:
        text: Prompt text to parse

    Returns:
        Dict with "blocks" key containing list of:
        {
            "role": "character" | "action" | "setting" | "mood" | "romance" | "other",
            "text": "...",
            "component_type": "character.identity" (optional, for debugging)
        }

    Example:
        >>> result = await parse_prompt_to_blocks("A werewolf enters the forest")
        >>> result
        {
            "blocks": [
                {"role": "character", "text": "A werewolf", "component_type": "character.identity"},
                {"role": "action", "text": "enters", "component_type": "action.movement"},
                {"role": "setting", "text": "the forest", "component_type": "setting.location"}
            ]
        }
    """
    # Initialize parser
    parser = PromptParser()

    # Parse the prompt (use simple engine, no validation errors)
    parsed = await parser.parse(
        text=text,
        engine='simple',
        validate=True,
        strict_validation=False  # Don't raise on validation errors
    )

    # Convert components to PixSim7 blocks
    blocks: List[Dict[str, Any]] = []

    for component in parsed.components:
        # Map component type to PixSim7 role
        role = _map_component_type_to_role(component.type)

        # Build block (plain dict, no DSL objects)
        block = {
            "role": role,
            "text": component.content,
        }

        # Include component type for debugging (optional)
        if component.type:
            block["component_type"] = component.type.value

        blocks.append(block)

    # Return PixSim7-shaped response
    return {
        "blocks": blocks
    }
