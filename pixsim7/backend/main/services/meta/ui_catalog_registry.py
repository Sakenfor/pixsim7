"""
UI Catalog Registry

Backend-owned source of truth for UI component metadata, composition patterns,
and agent guidance. Replaces the static generated JSON catalog for agent
consumption — agents query ``/api/v1/meta/ui/*`` endpoints backed by this
registry instead of parsing a bulk file.

The generated ``docs/ui-component-catalog.generated.json`` remains as an
optional documentation artifact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class UIComponentExport:
    """A named export from a component's source file."""

    name: str
    kind: str = "component"  # "component" | "hook" | "utility" | "type" | "constant"
    signature: Optional[str] = None  # minimal, e.g. "(props: BadgeProps) => JSX.Element"


@dataclass
class UIComponent:
    """A registered UI component or utility with agent-facing guidance."""

    id: str  # kebab-case, e.g. "badge", "create-badge-widget"
    name: str  # PascalCase export name, e.g. "Badge"
    category: str  # "layout" | "feedback" | "input" | "display" | "navigation" | "overlay"
    source_file: str  # relative from repo root
    when_to_use: str
    use_instead_of: Optional[str] = None
    anti_patterns: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    exports: List[UIComponentExport] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)


@dataclass
class UIPatternStep:
    """A single step in a composition-pattern recipe."""

    step: int
    description: str
    code: str = ""


@dataclass
class UIPattern:
    """A composition pattern — a curated recipe for common UI tasks."""

    id: str
    name: str
    description: str
    components: List[str]  # component IDs used in this pattern
    guidance: str
    recipe: List[UIPatternStep] = field(default_factory=list)
    example_code: str = ""
    source_files: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)


@dataclass
class UIGuidance:
    """Top-level agent rules and pre-coding checklist."""

    rules: List[str] = field(default_factory=list)
    checklist_before_coding: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class UICatalogRegistry(SimpleRegistry[str, UIComponent]):
    """Registry for UI components, patterns, and agent guidance.

    Extends ``SimpleRegistry`` with pattern and guidance storage plus
    search helpers used by the ``/api/v1/meta/ui/*`` endpoints.
    """

    def __init__(self) -> None:
        # Initialize pattern/guidance storage before super().__init__
        # because seed_on_init=True calls _seed_defaults() during __init__.
        self._patterns: Dict[str, UIPattern] = {}
        self._guidance = UIGuidance()
        super().__init__(
            name="UICatalogRegistry",
            allow_overwrite=True,
            seed_on_init=True,
            log_operations=False,
        )

    # -- Seed hook (called by SimpleRegistry.__init__) ----------------------

    def _seed_defaults(self) -> None:
        from pixsim7.backend.main.services.meta.ui_catalog_seed import seed_ui_catalog

        seed_ui_catalog(self)

    # -- Pattern operations -------------------------------------------------

    def register_pattern(self, pattern: UIPattern) -> None:
        self._patterns[pattern.id] = pattern

    def get_pattern(self, pattern_id: str) -> Optional[UIPattern]:
        return self._patterns.get(pattern_id)

    def list_patterns(self, *, topic: Optional[str] = None) -> List[UIPattern]:
        patterns = list(self._patterns.values())
        if topic:
            q = topic.lower()
            patterns = [
                p
                for p in patterns
                if q in p.name.lower()
                or q in p.description.lower()
                or any(q in t for t in p.tags)
            ]
        return patterns

    # -- Guidance -----------------------------------------------------------

    def set_guidance(self, guidance: UIGuidance) -> None:
        self._guidance = guidance

    def get_guidance(self) -> UIGuidance:
        return self._guidance

    # -- Search / query helpers ---------------------------------------------

    def search(
        self,
        *,
        q: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[UIComponent]:
        results = list(self.values())
        if category:
            results = [c for c in results if c.category == category]
        if q:
            ql = q.lower()
            results = [
                c
                for c in results
                if ql in c.name.lower()
                or ql in c.id.lower()
                or (c.when_to_use and ql in c.when_to_use.lower())
                or (c.use_instead_of and ql in c.use_instead_of.lower())
                or any(ql in t for t in c.tags)
            ]
        return results

    def categories(self) -> Set[str]:
        return {c.category for c in self.values()}

    def summary(self) -> dict:
        return {
            "component_count": len(self),
            "pattern_count": len(self._patterns),
            "categories": sorted(self.categories()),
            "guidance_rule_count": len(self._guidance.rules),
        }


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

ui_catalog_registry = UICatalogRegistry()
