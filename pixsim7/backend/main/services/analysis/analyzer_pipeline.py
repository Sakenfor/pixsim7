"""
Shared analyzer resolve/validate pipeline stages.

Stage 1 scope:
- Resolve canonical analyzer ID
- Validate analyzer existence / target / enabled state
- Resolve provider/model for execution (including LLM provider/model precedence)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pixsim7.backend.main.services.analysis.execution_policy import (
    ProviderModelPrecedenceRequest,
    resolve_provider_model_precedence,
)
from pixsim7.backend.main.services.prompt.parser import (
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
    analyzer_registry,
)


class AnalyzerPipelineError(Exception):
    """Error raised while resolving analyzer pipeline stages."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class AnalyzerDefinitionRequest:
    """Request for analyzer definition resolution and validation."""

    analyzer_id: str
    target: AnalyzerTarget
    require_enabled: bool = True


@dataclass(frozen=True)
class ResolvedAnalyzerDefinition:
    """Canonical analyzer definition after target/enabled validation."""

    analyzer_id: str
    analyzer: AnalyzerInfo


@dataclass(frozen=True)
class AnalyzerExecutionRequest:
    """Request for execution provider/model resolution."""

    analyzer_id: str
    target: AnalyzerTarget
    require_enabled: bool = True
    explicit_provider_id: Optional[str] = None
    explicit_model_id: Optional[str] = None
    fallback_provider_id: Optional[str] = None
    user_llm_provider_id: Optional[str] = None
    user_llm_model_id: Optional[str] = None
    require_provider: bool = True


@dataclass(frozen=True)
class ResolvedAnalyzerExecution:
    """Resolved execution configuration for an analyzer invocation."""

    analyzer_id: str
    analyzer: AnalyzerInfo
    provider_id: Optional[str]
    model_id: Optional[str]


def resolve_analyzer_definition(request: AnalyzerDefinitionRequest) -> ResolvedAnalyzerDefinition:
    """Resolve and validate analyzer definition for a target."""
    analyzer_id = analyzer_registry.resolve_legacy(request.analyzer_id)
    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise AnalyzerPipelineError(f"Analyzer '{request.analyzer_id}' is not registered")

    if analyzer.target != request.target:
        raise AnalyzerPipelineError(
            f"Analyzer '{analyzer_id}' is not a {request.target.value} analyzer"
        )

    if request.require_enabled and not analyzer.enabled:
        raise AnalyzerPipelineError(f"Analyzer '{analyzer_id}' is disabled")

    return ResolvedAnalyzerDefinition(analyzer_id=analyzer_id, analyzer=analyzer)


def resolve_analyzer_execution(request: AnalyzerExecutionRequest) -> ResolvedAnalyzerExecution:
    """Resolve canonical analyzer + provider/model for execution."""
    resolved_def = resolve_analyzer_definition(
        AnalyzerDefinitionRequest(
            analyzer_id=request.analyzer_id,
            target=request.target,
            require_enabled=request.require_enabled,
        )
    )
    analyzer = resolved_def.analyzer

    if analyzer.kind == AnalyzerKind.LLM:
        precedence = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id=request.explicit_provider_id,
                explicit_model_id=request.explicit_model_id,
                analyzer_provider_id=analyzer.provider_id,
                analyzer_model_id=analyzer.model_id,
                user_provider_id=request.user_llm_provider_id,
                user_model_id=request.user_llm_model_id,
                fallback_provider_id=request.fallback_provider_id,
            )
        )
        provider_id = precedence.provider_id
        model_id = precedence.model_id
    else:
        provider_id = (
            request.explicit_provider_id
            or analyzer.provider_id
            or request.fallback_provider_id
        )
        model_id = request.explicit_model_id or analyzer.model_id

    if request.require_provider and analyzer.kind != AnalyzerKind.PARSER and not provider_id:
        raise AnalyzerPipelineError(
            f"Analyzer '{resolved_def.analyzer_id}' has no resolved provider"
        )

    return ResolvedAnalyzerExecution(
        analyzer_id=resolved_def.analyzer_id,
        analyzer=analyzer,
        provider_id=provider_id,
        model_id=model_id,
    )
