"""Eval-corpus discovery.

Sibling to :mod:`testing.discovery` (test-suite discovery). Where that module
scans ``test_*.py`` / ``conftest.py`` for ``TEST_SUITE`` dicts, this one globs
for ``eval_corpus*.json`` files and reads their ``_meta`` block — the corpus
files already carry ``{description, version, total_entries, categories}`` under
``_meta``, which plays the same role ``TEST_SUITE`` does for tests.

Reuses the shared path/identifier helpers in :mod:`pixsim7.common.naming` so
the id/label/category inference stays consistent with every other path-keyed
registry in the repo (test suites, frontend tests, …) rather than reimplementing
kebab/humanize/anchor logic.

No AST here — corpora are already structured JSON, so the ``_meta`` block is
read directly with :func:`json.load` instead of static parsing.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from pixsim7.common.naming import humanize_label, kebab, path_after_anchor

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DiscoveredCorpus:
    """A discovered eval corpus, with metadata inferred from path + ``_meta``."""

    id: str
    label: str
    path: str  # repo-relative, posix
    category: str | None = None
    subcategory: str | None = None
    version: str | None = None
    total_entries: int | None = None
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "path": self.path,
            "category": self.category,
            "subcategory": self.subcategory,
            "version": self.version,
            "total_entries": self.total_entries,
        }
        if self.description:
            d["description"] = self.description
        return d


def _read_corpus_meta(file_path: Path) -> tuple[dict[str, Any], int | None]:
    """Return ``(_meta_dict, corpus_len)`` for a corpus JSON file.

    Tolerant: a malformed / unreadable file yields ``({}, None)`` and is
    logged at debug level rather than raising — discovery should never
    fail the whole catalog because one corpus is broken.
    """
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        logger.debug("Failed to read corpus meta in %s", file_path)
        return {}, None
    if not isinstance(data, dict):
        return {}, None
    meta = data.get("_meta")
    meta = meta if isinstance(meta, dict) else {}
    corpus = data.get("corpus")
    corpus_len = len(corpus) if isinstance(corpus, list) else None
    return meta, corpus_len


def _path_after_evals_root(rel_path: str) -> list[str]:
    """Segments after the ``evals`` anchor (``tests`` as a fallback anchor).

    ``pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus.json``
    → ``["primitive_projection", "eval_corpus.json"]``.
    """
    return path_after_anchor(rel_path, "evals", "tests")


def _infer_corpus_id(rel_path: str) -> str:
    """Kebab-case id from the corpus's position under ``evals/``.

    ``…/primitive_projection/eval_corpus.json``       → ``primitive-projection``
    ``…/primitive_projection/eval_corpus_medium.json``→ ``primitive-projection-medium``
    """
    tail = _path_after_evals_root(rel_path)
    if not tail:
        return kebab(Path(rel_path).stem)
    *folders, filename = tail
    stem = Path(filename).stem
    # Strip the conventional ``eval_corpus`` prefix; keep any ``_<variant>`` tail
    # (e.g. ``eval_corpus_medium`` → ``medium``) so variants stay distinct.
    if stem.startswith("eval_corpus"):
        stem = stem[len("eval_corpus") :].lstrip("_")
    segments = [*folders, stem] if stem else folders
    return kebab("-".join(s for s in segments if s))


def _infer_corpus_subcategory(rel_path: str) -> str | None:
    """Subcategory = the immediate folder holding the corpus (its harness)."""
    tail = _path_after_evals_root(rel_path)
    if len(tail) <= 1:
        return None
    return kebab(tail[-2])


def discover_eval_corpora(
    root: Path,
    scan_roots: Sequence[Path] | None = None,
) -> list[DiscoveredCorpus]:
    """Walk scan roots and collect every ``eval_corpus*.json``.

    Metadata precedence mirrors :func:`testing.discovery.discover_suites`:
    explicit ``_meta`` fields win, missing fields are inferred from the
    corpus's path. Every corpus always gets an id/label/category so it can
    be grouped and resolved without hand-maintained wiring.

    Args:
        root: Project root for computing relative paths.
        scan_roots: Directories to scan. Defaults to the backend blocks evals tree.
    """
    if scan_roots is None:
        scan_roots = [root / "pixsim7" / "backend" / "tests" / "blocks" / "evals"]

    corpora: list[DiscoveredCorpus] = []

    for scan_root in scan_roots:
        if not scan_root.is_dir():
            continue
        for json_file in sorted(scan_root.rglob("eval_corpus*.json")):
            rel_path = json_file.relative_to(root).as_posix()
            meta, corpus_len = _read_corpus_meta(json_file)

            inferred_id = _infer_corpus_id(rel_path)
            inferred_subcategory = _infer_corpus_subcategory(rel_path)

            explicit_id = meta.get("id") if isinstance(meta.get("id"), str) and meta["id"].strip() else None
            explicit_label = meta.get("label") if isinstance(meta.get("label"), str) and meta["label"].strip() else None
            explicit_category = meta.get("category") if isinstance(meta.get("category"), str) and meta["category"].strip() else None
            explicit_subcategory = meta.get("subcategory") if isinstance(meta.get("subcategory"), str) and meta["subcategory"].strip() else None

            corpus_id = explicit_id or inferred_id
            label = explicit_label or humanize_label(corpus_id)
            category = explicit_category or "evals"
            subcategory = explicit_subcategory or inferred_subcategory

            version = meta.get("version") if isinstance(meta.get("version"), str) else None
            # ``total_entries`` from _meta is authoritative if present; else the
            # actual corpus length is the honest count.
            total_raw = meta.get("total_entries")
            total_entries = total_raw if isinstance(total_raw, int) else corpus_len

            description = meta.get("description") if isinstance(meta.get("description"), str) else None

            corpora.append(DiscoveredCorpus(
                id=corpus_id,
                label=label,
                path=rel_path,
                category=category,
                subcategory=subcategory,
                version=version,
                total_entries=total_entries,
                description=description,
            ))

    return corpora


def resolve_corpus_path(root: Path, corpus_id: str, scan_roots: Sequence[Path] | None = None) -> Path:
    """Resolve a corpus id to an absolute path, or raise with the known ids."""
    corpora = discover_eval_corpora(root, scan_roots)
    for corpus in corpora:
        if corpus.id == corpus_id:
            return root / corpus.path
    known = ", ".join(sorted(c.id for c in corpora)) or "(none found)"
    raise KeyError(f"Unknown eval corpus id {corpus_id!r}. Discovered ids: {known}")
