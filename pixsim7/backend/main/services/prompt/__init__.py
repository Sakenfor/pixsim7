"""
Prompt Services

Exports prompt services via lazy attribute loading to avoid heavy import-time
side effects and circular dependencies across unrelated subsystems.
"""
from __future__ import annotations

from importlib import import_module
from typing import Any

_EXPORT_MAP = {
    # Core services
    "PromptAnalysisService": ("analysis", "PromptAnalysisService"),
    "PromptVersionService": ("version", "PromptVersionService"),
    "PromptFamilyService": ("family", "PromptFamilyService"),
    "PromptVariantService": ("variant", "PromptVariantService"),
    "PromptAnalyticsService": ("analytics", "PromptAnalyticsService"),
    "PromptOperationsService": ("operations", "PromptOperationsService"),
    "PromptIntentService": ("intent", "PromptIntentService"),
    "PromptRoleRegistry": ("role_registry", "PromptRoleRegistry"),
    "PromptRoleDefinition": ("role_registry", "PromptRoleDefinition"),
    "PromptSemanticContext": ("semantic_context", "PromptSemanticContext"),
    "build_prompt_semantic_context": ("semantic_context", "build_prompt_semantic_context"),
    "build_prompt_semantic_context_from_packs": ("semantic_context", "build_prompt_semantic_context_from_packs"),
    "PromptSource": ("import_", "PromptSource"),
    "PromptImportSpec": ("import_", "PromptImportSpec"),
    "prepare_import_payloads": ("import_", "prepare_import_payloads"),
    # Candidates
    "PromptBlockCandidate": ("pixsim7.backend.main.shared.schemas.discovery_schemas", "PromptBlockCandidate"),
    "candidate_from_segment": ("candidates", "candidate_from_segment"),
    "candidate_from_suggested_action_block": ("candidates", "candidate_from_suggested_action_block"),
    "candidates_from_segments": ("candidates", "candidates_from_segments"),
    # Block services
    "PromptBlockService": ("block", "PromptBlockService"),
    "BlockCompositionEngine": ("block", "BlockCompositionEngine"),
    "AIBlockExtractor": ("block", "AIBlockExtractor"),
    "ConceptRegistry": ("block", "ConceptRegistry"),
    "ExtractionConfigService": ("block", "ExtractionConfigService"),
    "ExtractionConfig": ("block", "ExtractionConfig"),
    # Parser
    "SimplePromptParser": ("parser", "SimplePromptParser"),
    "PromptParseResult": ("parser", "PromptParseResult"),
    "PromptSegment": ("parser", "PromptSegment"),
    "PromptSegmentRole": ("parser", "PromptSegmentRole"),
    "analyze_prompt_with_llm": ("parser", "analyze_prompt_with_llm"),
    "analyzer_registry": ("parser", "analyzer_registry"),
    "analyze_prompt": ("parser", "analyze_prompt"),
    "parse_prompt_to_candidates": ("parser", "parse_prompt_to_candidates"),
    # Context
    "FieldMapping": ("context", "FieldMapping"),
    "merge_field_mappings": ("context", "merge_field_mappings"),
    # Git operations
    "GitOperationsService": ("git", "GitOperationsService"),
    "GitBranchService": ("git", "GitBranchService"),
    "GitMergeService": ("git", "GitMergeService"),
}


def __getattr__(name: str) -> Any:
    target = _EXPORT_MAP.get(name)
    if not target:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module_name, attr_name = target
    if "." in module_name:
        module = import_module(module_name)
    else:
        module = import_module(f"{__name__}.{module_name}")
    value = getattr(module, attr_name)
    globals()[name] = value
    return value

__all__ = [
    # Core services
    "PromptAnalysisService",
    "PromptVersionService",
    "PromptFamilyService",
    "PromptVariantService",
    "PromptAnalyticsService",
    "PromptOperationsService",
    "PromptIntentService",
    "PromptRoleRegistry",
    "PromptRoleDefinition",
    "PromptSemanticContext",
    "build_prompt_semantic_context",
    "build_prompt_semantic_context_from_packs",
    "PromptSource",
    "PromptImportSpec",
    "prepare_import_payloads",
    # Candidates
    "PromptBlockCandidate",
    "candidate_from_segment",
    "candidate_from_suggested_action_block",
    "candidates_from_segments",
    # Block services
    "PromptBlockService",
    "BlockCompositionEngine",
    "AIBlockExtractor",
    "ConceptRegistry",
    "ExtractionConfigService",
    "ExtractionConfig",
    # Parser
    "SimplePromptParser",
    "PromptParseResult",
    "PromptSegment",
    "PromptSegmentRole",
    "analyze_prompt_with_llm",
    "analyzer_registry",
    "analyze_prompt",
    "parse_prompt_to_candidates",
    # Context
    "FieldMapping",
    "merge_field_mappings",
    # Git operations
    "GitOperationsService",
    "GitBranchService",
    "GitMergeService",
]
