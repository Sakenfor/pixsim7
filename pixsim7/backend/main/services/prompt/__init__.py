"""
Prompt Services

Consolidated prompt domain services including:
- Analysis: Prompt parsing and analysis orchestration
- Block: Reusable block management, extraction, composition
- Parser: Parsing implementations (simple, LLM)
- Context: Prompt context resolution and mapping
- Git: Git-like versioning operations (branch, merge)
- Versioning: Family and version management

Usage:
    from pixsim7.backend.main.services.prompt import (
        PromptAnalysisService,
        PromptBlockService,
        PromptFamilyService,
        PromptVersionService,
    )
"""

# Core services
from .analysis import PromptAnalysisService
from .version import PromptVersionService
from .family import PromptFamilyService
from .variant import PromptVariantService
from .analytics import PromptAnalyticsService
from .operations import PromptOperationsService
from .intent import PromptIntentService
from .role_registry import PromptRoleRegistry, PromptRoleDefinition
from .semantic_context import (
    PromptSemanticContext,
    build_prompt_semantic_context,
    build_prompt_semantic_context_from_packs,
)
from .import_ import (
    PromptSource,
    PromptImportSpec,
    prepare_import_payloads,
)

# Block services
from .block import (
    PromptBlockService,
    BlockCompositionEngine,
    AIBlockExtractor,
    ConceptRegistry,
    ExtractionConfigService,
    ExtractionConfig,
)

# Parser
from .parser import (
    SimplePromptParser,
    PromptParseResult,
    PromptSegment,
    PromptSegmentRole,
    analyze_prompt_with_llm,
    analyzer_registry,
    analyze_prompt,
    parse_prompt_to_blocks,
)

# Context
from .context import (
    FieldMapping,
    merge_field_mappings,
)

# Git operations
from .git import (
    GitOperationsService,
    GitBranchService,
    GitMergeService,
)

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
    "parse_prompt_to_blocks",
    # Context
    "FieldMapping",
    "merge_field_mappings",
    # Git operations
    "GitOperationsService",
    "GitBranchService",
    "GitMergeService",
]
