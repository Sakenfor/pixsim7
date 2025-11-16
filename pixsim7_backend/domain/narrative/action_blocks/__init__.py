"""
Action Blocks for Visual Generation

This module provides the action prompt engine for generating short 5-8 second
video clips from reference images. It works alongside the narrative engine
to create visual content that matches the emotional and relational context.
"""

from .types import (
    ActionBlock,
    SingleStateBlock,
    TransitionBlock,
    ActionBlockTags,
    ReferenceImage,
    TransitionEndpoint,
    BranchIntent,
    ActionSelectionContext,
)
from .engine import ActionEngine
from .pose_taxonomy import PoseTaxonomy, POSE_TAXONOMY

__all__ = [
    "ActionBlock",
    "SingleStateBlock",
    "TransitionBlock",
    "ActionBlockTags",
    "ReferenceImage",
    "TransitionEndpoint",
    "BranchIntent",
    "ActionSelectionContext",
    "ActionEngine",
    "PoseTaxonomy",
    "POSE_TAXONOMY",
]