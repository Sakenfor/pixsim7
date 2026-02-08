"""
PixSim7 Native Prompt Parser

A minimal, native parser module for prompt analysis.
Provides lightweight, deterministic prompt parsing without external dependencies.

Main components:
- SimplePromptParser: Basic sentence-level parser with role classification
- PromptParseResult, PromptSegment: Type-safe parsed output
- LLM Analyzer: Deep semantic analysis using LLMs
"""

from .simple import (
    SimplePromptParser,
    PromptParseResult,
    PromptSegment,
    parse_prompt,
)
from .llm_analyzer import analyze_prompt_with_llm
from .registry import (
    analyzer_registry,
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
)
from .analyzer_plugins import setup_analyzer_plugin_hooks
from .dsl_adapter import (
    analyze_prompt,
    parse_prompt_to_candidates,
    PromptTag,
)
from .stemmer import stem, stems_match, find_stem_matches
from .negation import (
    find_negated_spans,
    get_negated_words,
    filter_negated_keywords,
    NegatedSpan,
)

# Re-export PromptSegmentRole from domain for convenience
from pixsim7.backend.main.domain.prompt.enums import PromptSegmentRole
from pixsim7.backend.main.services.prompt.role_registry import (
    PromptRoleRegistry,
    PromptRoleDefinition,
)

__all__ = [
    # Parser
    "SimplePromptParser",
    "PromptParseResult",
    "PromptSegment",
    "PromptSegmentRole",
    "PromptRoleRegistry",
    "PromptRoleDefinition",
    "parse_prompt",
    # LLM
    "analyze_prompt_with_llm",
    # Registry
    "analyzer_registry",
    "AnalyzerInfo",
    "AnalyzerKind",
    "AnalyzerTarget",
    "setup_analyzer_plugin_hooks",
    # DSL Adapter
    "analyze_prompt",
    "parse_prompt_to_candidates",
    "PromptTag",
    # Stemmer
    "stem",
    "stems_match",
    "find_stem_matches",
    # Negation
    "find_negated_spans",
    "get_negated_words",
    "filter_negated_keywords",
    "NegatedSpan",
]
