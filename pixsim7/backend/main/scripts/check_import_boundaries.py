#!/usr/bin/env python3
"""
Phase 0 - Import boundary checker for game/main separation.

Enforces import boundaries across domain, service, and API layers.

Run: python pixsim7/backend/main/scripts/check_import_boundaries.py
Exit code 0 = clean, 1 = violations found.
"""
from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent  # pixsim7/backend/main/


@dataclass(frozen=True)
class ImportRecord:
    lineno: int
    module: str
    symbol: str | None = None


@dataclass(frozen=True)
class ModuleRule:
    source_glob: str
    forbidden_prefixes: tuple[str, ...]
    description: str


@dataclass(frozen=True)
class SymbolRule:
    source_glob: str
    module: str
    forbidden_symbols: tuple[str, ...]
    description: str


GAME_API_GLOBS: list[str] = [
    "api/v1/game*.py",
    "api/v1/characters.py",
    "api/v1/character_graph.py",
    "api/v1/npc_state.py",
    "api/v1/stat_preview.py",
    "api/v1/analytics.py",
    "api/v1/interactions.py",
]

MODULE_RULES: list[ModuleRule] = [
    # Domain boundaries
    ModuleRule(
        source_glob="domain/game/**/*.py",
        forbidden_prefixes=(
            "pixsim7.backend.main.domain.assets",
            "pixsim7.backend.main.domain.generation",
        ),
        description="game domain must not import from assets/generation domain",
    ),
    ModuleRule(
        source_glob="domain/game/**/*.py",
        forbidden_prefixes=(
            "pixsim7.backend.main.services.asset",
            "pixsim7.backend.main.services.generation",
            "pixsim7.backend.main.services.provider",
            "pixsim7.backend.main.services.tag_service",
            "pixsim7.backend.main.services.links",
        ),
        description="game domain must not import non-game services",
    ),
    ModuleRule(
        source_glob="domain/assets/**/*.py",
        forbidden_prefixes=("pixsim7.backend.main.domain.game",),
        description="assets domain must not import from game domain",
    ),
    # Service boundaries
    ModuleRule(
        source_glob="services/game/**/*.py",
        forbidden_prefixes=(
            "pixsim7.backend.main.domain.assets",
            "pixsim7.backend.main.domain.generation",
            "pixsim7.backend.main.services.asset",
            "pixsim7.backend.main.services.generation",
            "pixsim7.backend.main.services.provider",
            "pixsim7.backend.main.services.tag_service",
            "pixsim7.backend.main.services.links",
        ),
        description="game services must not import cross-domain main services/models",
    ),
]

for game_api_glob in GAME_API_GLOBS:
    MODULE_RULES.append(
        ModuleRule(
            source_glob=game_api_glob,
            forbidden_prefixes=(
                "pixsim7.backend.main.domain.assets",
                "pixsim7.backend.main.domain.generation",
                "pixsim7.backend.main.services.asset",
                "pixsim7.backend.main.services.generation",
                "pixsim7.backend.main.services.provider",
            ),
            description="game API routes must avoid direct imports from main asset/generation/provider layers",
        )
    )

SYMBOL_RULES: list[SymbolRule] = [
    SymbolRule(
        source_glob=game_api_glob,
        module="pixsim7.backend.main.api.dependencies",
        forbidden_symbols=("get_current_user", "CurrentUser"),
        description="game API routes must use claims-based auth (CurrentGamePrincipal)",
    )
    for game_api_glob in GAME_API_GLOBS
]

# Known violations to fix in Phase 2 (suppressed with tracking)
# Key formats:
#   module:<rel_path>:<forbidden_prefix>
#   symbol:<rel_path>:<module>:<symbol>
KNOWN_VIOLATIONS: dict[str, str] = {
    # character_linkage.py imports Asset and Generation for metadata mutation
    "module:domain/game/entities/character_linkage.py:pixsim7.backend.main.domain.assets": "Phase 2: replace with AssetLike Protocol",
    "module:domain/game/entities/character_linkage.py:pixsim7.backend.main.domain.generation": "Phase 2: replace with GenerationLike Protocol",
    # character_graph.py imports Asset for ORM queries and node builders
    "module:domain/game/entities/character_graph.py:pixsim7.backend.main.domain.assets": "Phase 2: move ORM queries to adapter",
    "module:domain/game/entities/character_graph.py:pixsim7.backend.main.domain.generation": "Phase 2: move ORM queries to adapter",
    # character_linkage.py imports TagService
    "module:domain/game/entities/character_linkage.py:pixsim7.backend.main.services.tag_service": "Phase 2: replace with port",
    # target_adapters.py imports links template_resolver
    "module:domain/game/interactions/target_adapters.py:pixsim7.backend.main.services.links": "Phase 2: replace with port",
}


def _iter_source_files(source_glob: str) -> list[Path]:
    return [path for path in sorted(BACKEND_ROOT.glob(source_glob)) if path.is_file()]


def get_imports(filepath: Path) -> list[ImportRecord]:
    """Extract import records from a Python file."""
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return []

    imports: list[ImportRecord] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(ImportRecord(lineno=node.lineno, module=alias.name, symbol=None))
        elif isinstance(node, ast.ImportFrom):
            if not node.module:
                continue
            for alias in node.names:
                imports.append(
                    ImportRecord(lineno=node.lineno, module=node.module, symbol=alias.name)
                )
    return imports


def _known_module_violation(rel_path: str, prefix: str) -> str | None:
    return KNOWN_VIOLATIONS.get(f"module:{rel_path}:{prefix}")


def _known_symbol_violation(rel_path: str, module: str, symbol: str) -> str | None:
    return KNOWN_VIOLATIONS.get(f"symbol:{rel_path}:{module}:{symbol}")


def check_rules() -> tuple[list[str], list[str]]:
    """Return (new_violations, known_hits)."""
    new_violations: list[str] = []
    known_hits: list[str] = []

    for rule in MODULE_RULES:
        for filepath in _iter_source_files(rule.source_glob):
            rel_path = filepath.relative_to(BACKEND_ROOT).as_posix()
            for imp in get_imports(filepath):
                for prefix in rule.forbidden_prefixes:
                    if not imp.module.startswith(prefix):
                        continue
                    known_reason = _known_module_violation(rel_path, prefix)
                    if known_reason:
                        known_hits.append(
                            f"  [known] {rel_path}:{imp.lineno} -> {imp.module} ({known_reason})"
                        )
                    else:
                        new_violations.append(
                            f"  {rel_path}:{imp.lineno} -> {imp.module} ({rule.description})"
                        )

    for rule in SYMBOL_RULES:
        for filepath in _iter_source_files(rule.source_glob):
            rel_path = filepath.relative_to(BACKEND_ROOT).as_posix()
            for imp in get_imports(filepath):
                if imp.module != rule.module or imp.symbol is None:
                    continue
                if imp.symbol not in rule.forbidden_symbols:
                    continue
                known_reason = _known_symbol_violation(rel_path, rule.module, imp.symbol)
                if known_reason:
                    known_hits.append(
                        f"  [known] {rel_path}:{imp.lineno} -> from {imp.module} import {imp.symbol} ({known_reason})"
                    )
                else:
                    new_violations.append(
                        f"  {rel_path}:{imp.lineno} -> from {imp.module} import {imp.symbol} ({rule.description})"
                    )

    return new_violations, known_hits


def main() -> int:
    new_violations, known_hits = check_rules()

    if known_hits:
        print(f"Known violations (tracked for Phase 2): {len(known_hits)}")
        for hit in known_hits:
            print(hit)
        print()

    if new_violations:
        print(f"NEW import boundary violations: {len(new_violations)}")
        for violation in new_violations:
            print(violation)
        print()
        print("Fix these violations or add them to KNOWN_VIOLATIONS with a phase target.")
        return 1

    print("Import boundaries clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
