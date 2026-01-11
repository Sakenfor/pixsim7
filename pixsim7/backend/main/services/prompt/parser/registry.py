"""
Analysis Registry

Unified registry for all analyzers (prompt and asset).
Supports dynamic discovery and extensibility.

Analyzer ID convention:
- prompt:simple, prompt:claude, prompt:openai  → text analysis
- asset:faces, asset:scene, asset:motion       → media analysis (future)
"""

import logging
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from enum import Enum

logger = logging.getLogger(__name__)


class AnalyzerKind(str, Enum):
    """Execution model of analyzer."""
    PARSER = "parser"    # Deterministic, rule-based, fast
    LLM = "llm"          # LLM-powered, slower
    VISION = "vision"    # Vision model, async job


class AnalyzerTarget(str, Enum):
    """What the analyzer operates on."""
    PROMPT = "prompt"    # Text/prompt analysis
    ASSET = "asset"      # Media/asset analysis


class AnalyzerInfo(BaseModel):
    """Information about a registered analyzer."""
    id: str
    name: str
    description: str
    kind: AnalyzerKind
    target: AnalyzerTarget = AnalyzerTarget.PROMPT
    provider_id: Optional[str] = None  # For LLM/vision analyzers
    model_id: Optional[str] = None     # Default model
    source_plugin_id: Optional[str] = None  # Plugin that registered this analyzer
    config: dict = Field(default_factory=dict)
    enabled: bool = True
    is_default: bool = False
    is_legacy: bool = False  # Legacy aliases


class AnalyzerRegistry:
    """
    Unified registry for all analyzers (prompt and asset).

    Analyzers can be:
    - Built-in parsers (prompt:simple)
    - LLM-based (prompt:claude, prompt:openai)
    - Vision-based (asset:faces, asset:scene) - future
    - Custom/plugin-provided
    """

    def __init__(self):
        self._analyzers: Dict[str, AnalyzerInfo] = {}
        self._by_plugin: Dict[str, set[str]] = {}
        self._register_builtins()

    def _register_builtins(self) -> None:
        """Register built-in analyzers."""
        # Simple parser (default for prompts)
        self.register(AnalyzerInfo(
            id="prompt:simple",
            name="Simple Parser",
            description="Fast, keyword-based parser with ontology matching",
            kind=AnalyzerKind.PARSER,
            target=AnalyzerTarget.PROMPT,
            source_plugin_id="core",
            enabled=True,
            is_default=True,
        ))

        # Claude LLM analyzer
        self.register(AnalyzerInfo(
            id="prompt:claude",
            name="Claude (LLM)",
            description="Deep semantic analysis using Claude AI",
            kind=AnalyzerKind.LLM,
            target=AnalyzerTarget.PROMPT,
            provider_id="anthropic-llm",
            model_id="claude-sonnet-4-20250514",
            source_plugin_id="core",
            enabled=True,
        ))

        # OpenAI LLM analyzer
        self.register(AnalyzerInfo(
            id="prompt:openai",
            name="OpenAI (LLM)",
            description="Semantic analysis using GPT models",
            kind=AnalyzerKind.LLM,
            target=AnalyzerTarget.PROMPT,
            provider_id="openai-llm",
            model_id="gpt-4",
            source_plugin_id="core",
            enabled=True,
        ))

        # Legacy aliases
        self.register(AnalyzerInfo(
            id="parser:simple",
            name="Simple Parser (legacy)",
            description="Alias for prompt:simple",
            kind=AnalyzerKind.PARSER,
            target=AnalyzerTarget.PROMPT,
            source_plugin_id="core",
            is_legacy=True,
        ))
        self.register(AnalyzerInfo(
            id="llm:claude",
            name="Claude (legacy)",
            description="Alias for prompt:claude",
            kind=AnalyzerKind.LLM,
            target=AnalyzerTarget.PROMPT,
            provider_id="anthropic-llm",
            source_plugin_id="core",
            is_legacy=True,
        ))
        self.register(AnalyzerInfo(
            id="llm:openai",
            name="OpenAI (legacy)",
            description="Alias for prompt:openai",
            kind=AnalyzerKind.LLM,
            target=AnalyzerTarget.PROMPT,
            provider_id="openai-llm",
            source_plugin_id="core",
            is_legacy=True,
        ))

    def register(self, analyzer: AnalyzerInfo) -> None:
        """Register an analyzer."""
        existing = self._analyzers.get(analyzer.id)
        if existing and existing.source_plugin_id != analyzer.source_plugin_id:
            logger.warning(
                "analyzer_registry_overwrite",
                analyzer_id=analyzer.id,
                previous_plugin=existing.source_plugin_id,
                new_plugin=analyzer.source_plugin_id,
            )
            if existing.source_plugin_id:
                self._by_plugin.get(existing.source_plugin_id, set()).discard(analyzer.id)

        self._analyzers[analyzer.id] = analyzer

        if analyzer.source_plugin_id:
            self._by_plugin.setdefault(analyzer.source_plugin_id, set()).add(analyzer.id)

    def unregister(self, analyzer_id: str) -> bool:
        """Unregister an analyzer. Returns True if found."""
        if analyzer_id in self._analyzers:
            existing = self._analyzers[analyzer_id]
            if existing.source_plugin_id:
                self._by_plugin.get(existing.source_plugin_id, set()).discard(analyzer_id)
            del self._analyzers[analyzer_id]
            return True
        return False

    def get(self, analyzer_id: str) -> Optional[AnalyzerInfo]:
        """Get analyzer by ID."""
        return self._analyzers.get(analyzer_id)

    def list_all(self) -> List[AnalyzerInfo]:
        """List all registered analyzers."""
        return list(self._analyzers.values())

    def list_enabled(self, include_legacy: bool = False) -> List[AnalyzerInfo]:
        """List only enabled analyzers, optionally excluding legacy."""
        return [
            a for a in self._analyzers.values()
            if a.enabled and (include_legacy or not a.is_legacy)
        ]

    def list_by_target(
        self,
        target: AnalyzerTarget,
        include_legacy: bool = False,
    ) -> List[AnalyzerInfo]:
        """List analyzers for a specific target (prompt or asset)."""
        return [
            a for a in self._analyzers.values()
            if a.target == target and a.enabled and (include_legacy or not a.is_legacy)
        ]

    def list_prompt_analyzers(self, include_legacy: bool = False) -> List[AnalyzerInfo]:
        """List prompt analyzers (convenience method)."""
        return self.list_by_target(AnalyzerTarget.PROMPT, include_legacy)

    def list_asset_analyzers(self, include_legacy: bool = False) -> List[AnalyzerInfo]:
        """List asset analyzers (convenience method)."""
        return self.list_by_target(AnalyzerTarget.ASSET, include_legacy)

    def list_ids(self) -> List[str]:
        """List all analyzer IDs."""
        return list(self._analyzers.keys())

    def get_default(self, target: Optional[AnalyzerTarget] = None) -> Optional[AnalyzerInfo]:
        """Get the default analyzer, optionally for a specific target."""
        for analyzer in self._analyzers.values():
            if analyzer.is_default:
                if target is None or analyzer.target == target:
                    return analyzer
        # Fallback to first enabled non-legacy
        enabled = self.list_enabled(include_legacy=False)
        if target:
            enabled = [a for a in enabled if a.target == target]
        return enabled[0] if enabled else None

    def set_default(self, analyzer_id: str) -> bool:
        """
        Set the default analyzer for the analyzer's target.

        Returns True if the analyzer was found and set as default.
        """
        analyzer_id = self.resolve_legacy(analyzer_id)
        analyzer = self._analyzers.get(analyzer_id)
        if not analyzer:
            return False

        for entry in self._analyzers.values():
            if entry.target == analyzer.target:
                entry.is_default = False

        analyzer.is_default = True
        return True

    def is_valid_id(self, analyzer_id: str) -> bool:
        """Check if analyzer ID is valid (registered)."""
        return analyzer_id in self._analyzers

    def resolve_legacy(self, analyzer_id: str) -> str:
        """Resolve legacy analyzer ID to canonical ID."""
        legacy_map = {
            "parser:simple": "prompt:simple",
            "llm:claude": "prompt:claude",
            "llm:openai": "prompt:openai",
        }
        return legacy_map.get(analyzer_id, analyzer_id)

    def register_plugin_analyzer(self, plugin_id: str, analyzer: AnalyzerInfo) -> None:
        """Register a single analyzer on behalf of a plugin."""
        if analyzer.source_plugin_id and analyzer.source_plugin_id != plugin_id:
            logger.warning(
                "analyzer_registry_plugin_mismatch",
                analyzer_id=analyzer.id,
                provided_plugin=analyzer.source_plugin_id,
                expected_plugin=plugin_id,
            )
        analyzer_with_source = analyzer.model_copy(
            update={"source_plugin_id": plugin_id}
        )
        self.register(analyzer_with_source)

    def register_plugin_analyzers(
        self,
        plugin_id: str,
        analyzers: List[AnalyzerInfo],
    ) -> None:
        """Register a list of analyzers for a plugin."""
        for analyzer in analyzers:
            self.register_plugin_analyzer(plugin_id, analyzer)

    def list_by_plugin(self, plugin_id: str) -> List[AnalyzerInfo]:
        """List analyzers registered by a specific plugin."""
        ids = self._by_plugin.get(plugin_id, set())
        return [self._analyzers[analyzer_id] for analyzer_id in ids]

    def unregister_by_plugin(self, plugin_id: str) -> int:
        """Unregister all analyzers registered by a plugin."""
        analyzer_ids = list(self._by_plugin.get(plugin_id, set()))
        for analyzer_id in analyzer_ids:
            self.unregister(analyzer_id)
        return len(analyzer_ids)


# Global singleton
analyzer_registry = AnalyzerRegistry()
