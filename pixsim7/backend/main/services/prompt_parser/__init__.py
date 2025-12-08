"""
PixSim7 Native Prompt Parser

A minimal, native parser module to replace prompt-dsl dependency.
Provides lightweight, deterministic prompt parsing without external dependencies.

Main components:
- SimplePromptParser: Basic sentence-level parser with role classification
- ParsedPrompt, ParsedBlock: Type-safe parsed output
- Ontology: Centralized keyword lists for role classification
"""

from .simple import SimplePromptParser, ParsedPrompt, ParsedBlock, ParsedRole
from .llm_analyzer import analyze_prompt_with_llm

__all__ = [
    "SimplePromptParser",
    "ParsedPrompt",
    "ParsedBlock",
    "ParsedRole",
    "analyze_prompt_with_llm",
]
