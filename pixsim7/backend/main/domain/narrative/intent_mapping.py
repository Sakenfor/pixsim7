"""
Intent mapping between narrative and action engines.

This module ensures alignment between the narrative engine's suggested intents
and the action engine's branch intents, preventing drift between the systems.
"""

from enum import Enum
from typing import List, Optional
from ..action_blocks.types import BranchIntent


class NarrativeIntent(str, Enum):
    """
    Narrative intents that can be suggested by the narrative engine.
    These represent emotional/relational directions.
    """
    # Intimacy progression
    INCREASE_INTIMACY = "increase_intimacy"
    ROMANTIC_CONFESSION = "romantic_confession"
    PASSIONATE_KISS = "passionate_kiss"
    INTIMATE_TOUCH = "intimate_touch"
    EMOTIONAL_CONFESSION = "emotional_confession"

    # Intimacy reduction
    REDUCE_TENSION = "reduce_tension"
    CHANGE_TOPIC = "change_topic"
    CREATE_DISTANCE = "create_distance"

    # Relationship building
    BUILD_TRUST = "build_trust"
    SHARE_VULNERABILITY = "share_vulnerability"
    SEEK_REASSURANCE = "seek_reassurance"

    # Playful/flirty
    FLIRT = "flirt"
    TEASE = "tease"
    TEST_WATERS = "test_waters"
    CREATE_MOMENT = "create_moment"

    # Conflict
    RESOLVE_CONFLICT = "resolve_tension"
    EXPRESS_FRUSTRATION = "express_frustration"

    # Neutral
    MAINTAIN_STATUS = "maintain_status"
    OBSERVE = "observe"


# Explicit mapping from narrative intents to action branch intents
INTENT_TO_BRANCH_MAP = {
    # Escalation intents
    NarrativeIntent.INCREASE_INTIMACY: BranchIntent.ESCALATE,
    NarrativeIntent.ROMANTIC_CONFESSION: BranchIntent.ESCALATE,
    NarrativeIntent.PASSIONATE_KISS: BranchIntent.ESCALATE,
    NarrativeIntent.INTIMATE_TOUCH: BranchIntent.ESCALATE,
    NarrativeIntent.EMOTIONAL_CONFESSION: BranchIntent.ESCALATE,
    NarrativeIntent.FLIRT: BranchIntent.ESCALATE,
    NarrativeIntent.CREATE_MOMENT: BranchIntent.ESCALATE,

    # Cool down intents
    NarrativeIntent.REDUCE_TENSION: BranchIntent.COOL_DOWN,
    NarrativeIntent.CHANGE_TOPIC: BranchIntent.COOL_DOWN,
    NarrativeIntent.CREATE_DISTANCE: BranchIntent.COOL_DOWN,

    # Side branch intents
    NarrativeIntent.TEASE: BranchIntent.SIDE_BRANCH,
    NarrativeIntent.TEST_WATERS: BranchIntent.SIDE_BRANCH,
    NarrativeIntent.EXPRESS_FRUSTRATION: BranchIntent.SIDE_BRANCH,

    # Resolution intents
    NarrativeIntent.RESOLVE_CONFLICT: BranchIntent.RESOLVE,
    NarrativeIntent.BUILD_TRUST: BranchIntent.RESOLVE,
    NarrativeIntent.SHARE_VULNERABILITY: BranchIntent.RESOLVE,
    NarrativeIntent.SEEK_REASSURANCE: BranchIntent.RESOLVE,

    # Maintain intents
    NarrativeIntent.MAINTAIN_STATUS: BranchIntent.MAINTAIN,
    NarrativeIntent.OBSERVE: BranchIntent.MAINTAIN,
}


def map_narrative_to_branch_intent(
    narrative_intents: List[str]
) -> Optional[BranchIntent]:
    """
    Map narrative intents to a single action branch intent.

    Args:
        narrative_intents: List of narrative intent strings

    Returns:
        The most appropriate branch intent, or None if no mapping

    Priority:
    1. ESCALATE (if any escalation intent present)
    2. RESOLVE (if resolution needed)
    3. COOL_DOWN (if de-escalation needed)
    4. SIDE_BRANCH (for diversions)
    5. MAINTAIN (default)
    """
    if not narrative_intents:
        return None

    # Convert strings to enums (safely)
    intents = []
    for intent_str in narrative_intents:
        try:
            intents.append(NarrativeIntent(intent_str))
        except ValueError:
            # Unknown intent string, skip
            continue

    # Priority-based selection
    for intent in intents:
        branch = INTENT_TO_BRANCH_MAP.get(intent)
        if branch == BranchIntent.ESCALATE:
            return BranchIntent.ESCALATE  # Highest priority

    for intent in intents:
        branch = INTENT_TO_BRANCH_MAP.get(intent)
        if branch == BranchIntent.RESOLVE:
            return BranchIntent.RESOLVE

    for intent in intents:
        branch = INTENT_TO_BRANCH_MAP.get(intent)
        if branch == BranchIntent.COOL_DOWN:
            return BranchIntent.COOL_DOWN

    for intent in intents:
        branch = INTENT_TO_BRANCH_MAP.get(intent)
        if branch == BranchIntent.SIDE_BRANCH:
            return BranchIntent.SIDE_BRANCH

    # Default to maintain if we have any mapped intent
    if any(INTENT_TO_BRANCH_MAP.get(intent) for intent in intents):
        return BranchIntent.MAINTAIN

    return None


def get_compatible_narrative_intents(
    branch_intent: BranchIntent
) -> List[NarrativeIntent]:
    """
    Get narrative intents that map to a given branch intent.

    Useful for understanding what narrative situations lead to
    specific visual actions.
    """
    compatible = []
    for narrative_intent, branch in INTENT_TO_BRANCH_MAP.items():
        if branch == branch_intent:
            compatible.append(narrative_intent)
    return compatible