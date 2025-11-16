"""
Narrative Engine for PixSim7

This module provides the runtime engine for executing narrative prompt programs
that generate contextual dialogue and visual prompts for NPCs based on
relationship state, world context, and story progression.
"""

from .engine import NarrativeEngine
from .context import NarrativeContext
from .programs import PromptProgram

__all__ = [
    "NarrativeEngine",
    "NarrativeContext",
    "PromptProgram",
]