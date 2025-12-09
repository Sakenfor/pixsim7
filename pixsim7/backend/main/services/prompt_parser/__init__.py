"""
PixSim7 Native Prompt Parser

A minimal, native parser module to replace prompt-dsl dependency.
Provides lightweight, deterministic prompt parsing without external dependencies.

Main components:
- SimplePromptParser: Basic sentence-level parser with role classification
- PromptParseResult, PromptSegment: Type-safe parsed output
- Ontology: Centralized keyword lists for role classification
"""

from .simple import (
    SimplePromptParser,
    # New names
    PromptParseResult,
    PromptSegment,
    PromptSegmentRole,
    # Legacy aliases (for backwards compatibility)
    ParsedPrompt,
    ParsedBlock,
    ParsedRole,
)
from .llm_analyzer import analyze_prompt_with_llm
from .registry import analyzer_registry, AnalyzerInfo, AnalyzerKind, AnalyzerTarget

__all__ = [
    "SimplePromptParser",
    # New names
    "PromptParseResult",
    "PromptSegment",
    "PromptSegmentRole",
    # Legacy aliases
    "ParsedPrompt",
    "ParsedBlock",
    "ParsedRole",
    # Other exports
    "analyze_prompt_with_llm",
    "analyzer_registry",
    "AnalyzerInfo",
    "AnalyzerKind",
    "AnalyzerTarget",
]
