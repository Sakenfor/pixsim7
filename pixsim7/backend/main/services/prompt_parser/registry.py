"""
Prompt Analyzer Registry

Central registry for available prompt analyzers.
Supports dynamic discovery and extensibility.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel
from enum import Enum


class AnalyzerKind(str, Enum):
    """Kind of analyzer."""
    PARSER = "parser"  # Deterministic, rule-based
    LLM = "llm"        # LLM-powered


class AnalyzerInfo(BaseModel):
    """Information about a registered analyzer."""
    id: str
    name: str
    description: str
    kind: AnalyzerKind
    provider_id: Optional[str] = None  # For LLM analyzers
    model_id: Optional[str] = None     # Default model for LLM analyzers
    enabled: bool = True
    is_default: bool = False


class AnalyzerRegistry:
    """
    Registry of available prompt analyzers.

    Analyzers can be:
    - Built-in parsers (parser:simple)
    - LLM-based (llm:claude, llm:openai)
    - Custom/plugin-provided
    """

    def __init__(self):
        self._analyzers: Dict[str, AnalyzerInfo] = {}
        self._register_builtins()

    def _register_builtins(self) -> None:
        """Register built-in analyzers."""
        # Simple parser (default)
        self.register(AnalyzerInfo(
            id="parser:simple",
            name="Simple Parser",
            description="Fast, keyword-based parser with ontology matching",
            kind=AnalyzerKind.PARSER,
            enabled=True,
            is_default=True,
        ))

        # Claude LLM analyzer
        self.register(AnalyzerInfo(
            id="llm:claude",
            name="Claude (LLM)",
            description="Deep semantic analysis using Claude AI",
            kind=AnalyzerKind.LLM,
            provider_id="anthropic-llm",
            model_id="claude-sonnet-4-20250514",
            enabled=True,
        ))

        # OpenAI LLM analyzer
        self.register(AnalyzerInfo(
            id="llm:openai",
            name="OpenAI (LLM)",
            description="Semantic analysis using GPT models",
            kind=AnalyzerKind.LLM,
            provider_id="openai-llm",
            model_id="gpt-4",
            enabled=True,
        ))

    def register(self, analyzer: AnalyzerInfo) -> None:
        """Register an analyzer."""
        self._analyzers[analyzer.id] = analyzer

    def unregister(self, analyzer_id: str) -> bool:
        """Unregister an analyzer. Returns True if found."""
        if analyzer_id in self._analyzers:
            del self._analyzers[analyzer_id]
            return True
        return False

    def get(self, analyzer_id: str) -> Optional[AnalyzerInfo]:
        """Get analyzer by ID."""
        return self._analyzers.get(analyzer_id)

    def list_all(self) -> List[AnalyzerInfo]:
        """List all registered analyzers."""
        return list(self._analyzers.values())

    def list_enabled(self) -> List[AnalyzerInfo]:
        """List only enabled analyzers."""
        return [a for a in self._analyzers.values() if a.enabled]

    def list_ids(self) -> List[str]:
        """List all analyzer IDs."""
        return list(self._analyzers.keys())

    def get_default(self) -> Optional[AnalyzerInfo]:
        """Get the default analyzer."""
        for analyzer in self._analyzers.values():
            if analyzer.is_default:
                return analyzer
        # Fallback to first enabled
        enabled = self.list_enabled()
        return enabled[0] if enabled else None

    def is_valid_id(self, analyzer_id: str) -> bool:
        """Check if analyzer ID is valid (registered)."""
        return analyzer_id in self._analyzers


# Global singleton
analyzer_registry = AnalyzerRegistry()
