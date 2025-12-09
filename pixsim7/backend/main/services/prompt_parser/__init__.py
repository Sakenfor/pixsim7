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
    PromptParseResult,
    PromptSegment,
    PromptSegmentRole,
)
from .llm_analyzer import analyze_prompt_with_llm
from .registry import analyzer_registry, AnalyzerInfo, AnalyzerKind, AnalyzerTarget

__all__ = [
    "SimplePromptParser",
    "PromptParseResult",
    "PromptSegment",
    "PromptSegmentRole",
    "analyze_prompt_with_llm",
    "analyzer_registry",
    "AnalyzerInfo",
    "AnalyzerKind",
    "AnalyzerTarget",
]
