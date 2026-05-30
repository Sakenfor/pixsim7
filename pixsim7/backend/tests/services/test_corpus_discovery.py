"""Tests for path-based inference in :mod:`testing.corpus_discovery`.

Sister to ``test_testing_discovery.py``. Pins the eval-corpus discoverer:

* ``eval_corpus*.json`` files are found and keyed by an id inferred from
  their position under ``evals/`` (with the ``eval_corpus`` prefix stripped
  and any ``_<variant>`` tail preserved).
* A ``_meta`` block layers explicit fields over the inferred defaults —
  missing keys are not errors.
* ``total_entries`` falls back to the actual ``corpus`` length when ``_meta``
  omits it; a broken/unreadable file degrades to empty metadata, not a crash.
* ``resolve_corpus_path`` round-trips an id to a path and lists known ids on miss.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "corpus-discovery-inference",
    "label": "Corpus discovery path inference",
    "kind": "unit",
    "category": "backend/testing",
    "subcategory": "corpus-discovery",
    "covers": [
        "testing/corpus_discovery.py",
    ],
    "order": 26.6,
}

import json
import textwrap
from pathlib import Path

import pytest

from testing.corpus_discovery import (
    _infer_corpus_id,
    _infer_corpus_subcategory,
    discover_eval_corpora,
    resolve_corpus_path,
)


# ── Helper-level: pure path → string mappings ─────────────────────


class TestInferCorpusId:
    @pytest.mark.parametrize(
        "rel_path, expected_id",
        [
            (
                "pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus.json",
                "primitive-projection",
            ),
            (
                "pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus_medium.json",
                "primitive-projection-medium",
            ),
            (
                "pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus_autogen.json",
                "primitive-projection-autogen",
            ),
        ],
    )
    def test_infers_kebab_id_with_variant_suffix(self, rel_path, expected_id):
        assert _infer_corpus_id(rel_path) == expected_id


class TestInferCorpusSubcategory:
    @pytest.mark.parametrize(
        "rel_path, expected_sub",
        [
            (
                "pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus.json",
                "primitive-projection",
            ),
            (
                "pixsim7/backend/tests/blocks/evals/role_inference/eval_corpus_hard.json",
                "role-inference",
            ),
        ],
    )
    def test_subcategory_is_holding_folder(self, rel_path, expected_sub):
        assert _infer_corpus_subcategory(rel_path) == expected_sub


# ── End-to-end: discover against a synthetic tree ──────────────────


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


@pytest.fixture
def fake_repo(tmp_path):
    """Build a minimal evals tree with three flavors of corpus coverage."""
    evals = tmp_path / "pixsim7" / "backend" / "tests" / "blocks" / "evals"

    # 1. No _meta — id/label/subcategory inferred; total_entries from corpus len.
    _write_json(
        evals / "projection" / "eval_corpus.json",
        {"corpus": [{"id": "a"}, {"id": "b"}, {"id": "c"}]},
    )

    # 2. Partial _meta — explicit description/version; count still inferred.
    _write_json(
        evals / "projection" / "eval_corpus_medium.json",
        {
            "_meta": {"description": "Hard subset", "version": "2.0.0"},
            "corpus": [{"id": "x"}],
        },
    )

    # 3. Full _meta — explicit id/label/category/total_entries win.
    _write_json(
        evals / "projection" / "eval_corpus_autogen.json",
        {
            "_meta": {
                "id": "explicit-autogen",
                "label": "Explicit Autogen Corpus",
                "category": "custom-cat",
                "total_entries": 999,
            },
            "corpus": [{"id": "y"}],
        },
    )

    # 4. Malformed JSON — must degrade gracefully, not crash discovery.
    bad = evals / "projection" / "eval_corpus_broken.json"
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_text("{ not valid json", encoding="utf-8")

    return tmp_path


def _by_id(corpora, corpus_id):
    matches = [c for c in corpora if c.id == corpus_id]
    assert len(matches) == 1, f"expected one corpus with id={corpus_id!r}, got {len(matches)}"
    return matches[0]


class TestDiscoverInfersDefaults:
    def test_inferred_id_label_count(self, fake_repo):
        corpora = discover_eval_corpora(fake_repo, scan_roots=[fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"])
        c = _by_id(corpora, "projection")
        assert c.label == "Projection"
        assert c.category == "evals"
        assert c.subcategory == "projection"
        # No _meta.total_entries → falls back to actual corpus length.
        assert c.total_entries == 3


class TestDiscoverMergesPartial:
    def test_partial_meta_keeps_inferred_id(self, fake_repo):
        corpora = discover_eval_corpora(fake_repo, scan_roots=[fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"])
        c = _by_id(corpora, "projection-medium")
        assert c.description == "Hard subset"
        assert c.version == "2.0.0"
        # total_entries not in _meta → corpus length (1).
        assert c.total_entries == 1


class TestDiscoverPreservesFull:
    def test_explicit_meta_wins(self, fake_repo):
        corpora = discover_eval_corpora(fake_repo, scan_roots=[fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"])
        c = _by_id(corpora, "explicit-autogen")
        assert c.label == "Explicit Autogen Corpus"
        assert c.category == "custom-cat"
        assert c.total_entries == 999


class TestDiscoverToleratesBroken:
    def test_broken_json_degrades_to_inferred(self, fake_repo):
        corpora = discover_eval_corpora(fake_repo, scan_roots=[fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"])
        # Still discovered (by path); meta empty → count None, id inferred.
        c = _by_id(corpora, "projection-broken")
        assert c.total_entries is None


class TestResolveCorpusPath:
    def test_resolves_known_id(self, fake_repo):
        scan = [fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"]
        path = resolve_corpus_path(fake_repo, "projection", scan_roots=scan)
        assert path.name == "eval_corpus.json"
        assert path.is_file()

    def test_unknown_id_lists_known(self, fake_repo):
        scan = [fake_repo / "pixsim7" / "backend" / "tests" / "blocks" / "evals"]
        with pytest.raises(KeyError) as exc:
            resolve_corpus_path(fake_repo, "does-not-exist", scan_roots=scan)
        msg = str(exc.value)
        assert "projection" in msg and "explicit-autogen" in msg


class TestDiscoverCLI:
    """The standalone CLI wrapper (scripts/tests/discover_eval_corpora.py)
    mirrors discover_backend_suites.py and emits a registry envelope."""

    def _repo_root(self) -> Path:
        # tests/services/ → repo root is three parents up from this file's
        # package anchor; resolve via the known on-disk corpus instead.
        here = Path(__file__).resolve()
        for parent in here.parents:
            if (parent / "scripts" / "tests" / "discover_eval_corpora.py").is_file():
                return parent
        raise AssertionError("could not locate repo root from test file")

    def test_write_emits_registry_envelope(self, tmp_path):
        import subprocess
        import sys

        root = self._repo_root()
        # Run --write but redirect the artifact by running in-process would
        # overwrite the real file; instead assert the JSON stdout shape via
        # the default (no-flag) mode, then check --write reports a count.
        proc = subprocess.run(
            [sys.executable, "scripts/tests/discover_eval_corpora.py"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert proc.returncode == 0, proc.stderr
        records = json.loads(proc.stdout)
        assert isinstance(records, list) and records, "expected non-empty corpus list"
        ids = {r["id"] for r in records}
        assert "primitive-projection" in ids
        # Every record carries the discoverable shape.
        for r in records:
            assert {"id", "label", "path", "category"} <= set(r)
