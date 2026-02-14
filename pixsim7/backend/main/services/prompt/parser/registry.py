"""
Analysis Registry

Unified registry for all analyzers (prompt and asset).
Supports dynamic discovery and extensibility.

Analyzer ID convention:
- prompt:simple, prompt:claude, prompt:openai  → text analysis
- asset:faces, asset:scene, asset:motion       → media analysis (future)
"""

from typing import Dict, List, Optional, Set
from pydantic import BaseModel, Field
from enum import Enum

from pixsim7.backend.main.lib.registry import SimpleRegistry


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


class AnalyzerRegistry(SimpleRegistry[str, AnalyzerInfo]):
    """
    Unified registry for all analyzers (prompt and asset).

    Analyzers can be:
    - Built-in parsers (prompt:simple)
    - LLM-based (prompt:claude, prompt:openai)
    - Vision-based (asset:faces, asset:scene) - future
    - Custom/plugin-provided
    """

    def __init__(self):
        self._by_plugin: Dict[str, Set[str]] = {}
        super().__init__(name="analyzers", allow_overwrite=True, seed_on_init=True, plugin_aware=True)

    def _get_item_key(self, analyzer: AnalyzerInfo) -> str:
        return analyzer.id

    def _seed_defaults(self) -> None:
        """Register built-in analyzers."""
        # Simple parser (default for prompts)
        self.register(AnalyzerInfo(
            id="prompt:simple",
            name="Simple Parser",
            description="Fast, keyword-based parser with ontology matching",
            kind=AnalyzerKind.PARSER,
            target=AnalyzerTarget.PROMPT,
            source_plugin_id="core",
            config={
                "enable_section_parsing": True,
                "section_label_confidence": 0.9,
                "enable_stemming": True,
                "enable_negation": True,
                "enable_action_inference": True,
                "enable_ontology_resolution": True,
                "min_confidence": 0.0,
                "default_role": "other",
                "disabled_roles": [],
                "role_keywords": {},
            },
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

    def _on_reset(self) -> None:
        """Clear plugin index on reset."""
        self._by_plugin.clear()

    def register(self, analyzer: AnalyzerInfo) -> None:
        """Register an analyzer."""
        super().register(analyzer.id, analyzer)

    def unregister(self, analyzer_id: str) -> bool:
        """Unregister an analyzer. Returns True if found."""
        removed = super().unregister(analyzer_id)
        return removed is not None

    def _on_register(
        self,
        key: str,
        item: AnalyzerInfo,
        previous: Optional[AnalyzerInfo],
    ) -> None:
        if previous and previous.source_plugin_id != item.source_plugin_id:
            self._log_debug(
                "Overwriting analyzer from different plugin",
                analyzer_id=key,
                previous_plugin=previous.source_plugin_id,
                new_plugin=item.source_plugin_id,
            )
            if previous.source_plugin_id:
                self._by_plugin.get(previous.source_plugin_id, set()).discard(key)

        if item.source_plugin_id:
            self._by_plugin.setdefault(item.source_plugin_id, set()).add(key)

    def _on_unregister(self, key: str, item: AnalyzerInfo) -> None:
        if item.source_plugin_id:
            self._by_plugin.get(item.source_plugin_id, set()).discard(key)

    def _on_clear(self, items: Dict[str, AnalyzerInfo]) -> None:
        self._by_plugin.clear()

    def get(self, analyzer_id: str) -> Optional[AnalyzerInfo]:
        """Get analyzer by ID."""
        return self.get_or_none(analyzer_id)

    def list_all(self) -> List[AnalyzerInfo]:
        """List all registered analyzers."""
        return self.values()

    def list_enabled(self, include_legacy: bool = False) -> List[AnalyzerInfo]:
        """List only enabled analyzers, optionally excluding legacy."""
        return [
            a for a in self.values()
            if a.enabled and (include_legacy or not a.is_legacy)
        ]

    def list_by_target(
        self,
        target: AnalyzerTarget,
        include_legacy: bool = False,
    ) -> List[AnalyzerInfo]:
        """List analyzers for a specific target (prompt or asset)."""
        return [
            a for a in self.values()
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
        return self.keys()

    def get_default(self, target: Optional[AnalyzerTarget] = None) -> Optional[AnalyzerInfo]:
        """Get the default analyzer, optionally for a specific target."""
        for analyzer in self.values():
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
        analyzer = self.get_or_none(analyzer_id)
        if not analyzer:
            return False

        for entry in self.values():
            if entry.target == analyzer.target:
                entry.is_default = False

        analyzer.is_default = True
        return True

    def is_valid_id(self, analyzer_id: str) -> bool:
        """Check if analyzer ID is valid (registered)."""
        return self.has(analyzer_id)

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
            self._log_debug(
                "Plugin ID mismatch",
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
        return [a for a in self.values() if a.id in ids]

    def unregister_by_plugin(self, plugin_id: str) -> int:
        """Unregister all analyzers registered by a plugin."""
        analyzer_ids = list(self._by_plugin.get(plugin_id, set()))
        for analyzer_id in analyzer_ids:
            self.unregister(analyzer_id)
        return len(analyzer_ids)


# Global singleton
analyzer_registry = AnalyzerRegistry()
