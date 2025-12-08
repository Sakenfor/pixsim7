"""
Prompt Analysis Service

Standalone service for analyzing prompt text.
Separates "how to analyze" (adapters) from "when/where to store" (service).

Two layers:
- Adapters: Pure functions, stateless, no DB (prompt_dsl_adapter, llm_analyzer)
- Service: Orchestrates adapters, handles persistence to PromptVersion

Usage:
- Preview/dev tools: service.analyze(text) → dict (no storage)
- Generation/import: service.analyze_and_attach_version(text) → PromptVersion
- Re-analysis: service.reanalyze_version(version_id) → PromptVersion
"""

from .service import PromptAnalysisService

__all__ = ["PromptAnalysisService"]
