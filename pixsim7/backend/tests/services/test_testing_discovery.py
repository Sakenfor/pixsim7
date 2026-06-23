"""Tests for path-based inference in :mod:`testing.discovery`.

Pins the behavior introduced when ``TEST_SUITE`` became optional:

* Files with no ``TEST_SUITE`` block still appear in the catalog, with
  every metadata field inferred from filesystem position.
* Files with a partial ``TEST_SUITE`` block get explicit fields layered
  over the inferred defaults — missing keys are not errors.
* Files with a full ``TEST_SUITE`` block keep their explicit values
  byte-for-byte (no inference contamination).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "testing-discovery-inference",
    "label": "Testing discovery path inference",
    "kind": "unit",
    "category": "backend/testing",
    "subcategory": "discovery",
    "covers": [
        "testing/discovery.py",
    ],
    "order": 26.5,
}

import textwrap
from pathlib import Path

import pytest

from testing.discovery import (
    _infer_backend_category,
    _infer_backend_subcategory,
    _infer_backend_suite_id,
    discover_suites,
)


# ── Helper-level: pure path → string mappings ─────────────────────


class TestInferSuiteId:
    @pytest.mark.parametrize(
        "rel_path, expected_id",
        [
            ("pixsim7/backend/tests/client/test_agent_errors.py", "client-agent-errors"),
            ("pixsim7/backend/tests/api/test_chat_session_api.py", "api-chat-session-api"),
            ("pixsim7/backend/tests/services/llm/test_remote_bridge.py", "services-llm-remote-bridge"),
            ("pixsim7/backend/tests/workers/conftest.py", "workers-conftest"),
            ("pixsim7/backend/tests/test_foo.py", "foo"),
            ("scripts/tests/test_validate_catalog_shape.py", "tests-validate-catalog-shape"),
        ],
    )
    def test_infers_kebab_id_from_path(self, rel_path, expected_id):
        assert _infer_backend_suite_id(rel_path) == expected_id


class TestInferCategory:
    @pytest.mark.parametrize(
        "rel_path, expected_category",
        [
            ("pixsim7/backend/tests/client/test_x.py", "client"),
            ("pixsim7/backend/tests/api/test_x.py", "api"),
            ("pixsim7/backend/tests/services/llm/test_x.py", "services"),
            # Top-level under tests/ has no folder → None (caller falls back to layer).
            ("pixsim7/backend/tests/test_x.py", None),
        ],
    )
    def test_first_folder_after_tests_or_none(self, rel_path, expected_category):
        assert _infer_backend_category(rel_path) == expected_category


class TestInferSubcategory:
    @pytest.mark.parametrize(
        "rel_path, expected_sub",
        [
            # One folder deep: stem becomes the subcategory.
            ("pixsim7/backend/tests/client/test_agent_errors.py", "agent-errors"),
            ("pixsim7/backend/tests/api/test_chat_session.py", "chat-session"),
            # Two+ folders deep: the immediate parent folder.
            ("pixsim7/backend/tests/services/llm/test_remote_bridge.py", "llm"),
            ("pixsim7/backend/tests/services/prompt/nested/test_x.py", "nested"),
            # Top-level: stem.
            ("pixsim7/backend/tests/test_capability_registry.py", "capability-registry"),
        ],
    )
    def test_subcategory_inference(self, rel_path, expected_sub):
        assert _infer_backend_subcategory(rel_path) == expected_sub


# ── End-to-end: discover_suites against a synthetic file tree ──────


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


@pytest.fixture
def fake_repo(tmp_path):
    """Build a minimal repo tree with three flavors of TEST_SUITE coverage."""
    tests_root = tmp_path / "tests"

    # 1. No TEST_SUITE — every field must be inferred from path.
    _write(
        tests_root / "client" / "test_no_metadata.py",
        '''
        """Module docstring used as the fallback description."""
        def test_a(): pass
        ''',
    )

    # 2. Partial TEST_SUITE — only explicit fields override; missing keys
    #    still get inferred.
    _write(
        tests_root / "client" / "test_partial.py",
        '''
        TEST_SUITE = {
            "id": "my-explicit-id",
            "kind": "contract",
        }
        def test_b(): pass
        ''',
    )

    # 3. Full TEST_SUITE — explicit values must round-trip unchanged.
    _write(
        tests_root / "client" / "test_full.py",
        '''
        TEST_SUITE = {
            "id": "fully-spelled-out",
            "label": "Fully Spelled Out",
            "kind": "integration",
            "category": "custom-cat",
            "subcategory": "custom-sub",
            "covers": ["pkg/foo.py"],
            "order": 99,
        }
        def test_c(): pass
        ''',
    )

    # 4. Top-level file (directly under tests/) — exercises the
    #    layer-fallback path when there's no folder-derived category.
    _write(
        tests_root / "test_top_level.py",
        '''
        def test_d(): pass
        ''',
    )

    return tmp_path


def _by_id(suites, suite_id):
    matches = [s for s in suites if s.id == suite_id]
    assert len(matches) == 1, f"expected one suite with id={suite_id!r}, got {len(matches)}"
    return matches[0]


class TestDiscoverInfersDefaults:
    """File with no TEST_SUITE → every field inferred."""

    def test_inferred_id_label_category(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        s = _by_id(suites, "client-no-metadata")
        assert s.label == "Client No Metadata Tests"
        assert s.category == "client"
        assert s.subcategory == "no-metadata"
        assert s.kind == "unit"
        assert s.covers == ()

    def test_docstring_becomes_description(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        s = _by_id(suites, "client-no-metadata")
        assert s.description and "fallback description" in s.description


class TestDiscoverMergesPartial:
    """Explicit fields override; missing keys still get inferred."""

    def test_partial_id_overrides_but_label_inferred(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        s = _by_id(suites, "my-explicit-id")
        # Explicit id wins; label is derived from the explicit id.
        assert s.label == "My Explicit Id Tests"
        # Explicit kind wins.
        assert s.kind == "contract"
        # category/subcategory still inferred from path.
        assert s.category == "client"
        assert s.subcategory == "partial"


class TestDiscoverPreservesFull:
    """Full TEST_SUITE round-trips unchanged."""

    def test_all_fields_preserved(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        s = _by_id(suites, "fully-spelled-out")
        assert s.label == "Fully Spelled Out"
        assert s.kind == "integration"
        assert s.category == "custom-cat"
        assert s.subcategory == "custom-sub"
        assert s.covers == ("pkg/foo.py",)
        assert s.order == 99.0


class TestDiscoverLayerFallback:
    """Top-level files (no folder under tests/) fall back to layer for category."""

    def test_top_level_uses_layer_as_category(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        s = _by_id(suites, "top-level")
        # _infer_layer treats anything not starting with pixsim7/backend or
        # scripts as "backend" — the fake_repo path qualifies for that
        # default, so layer fallback gives category=backend.
        assert s.category == "backend"
        # subcategory comes from the stem.
        assert s.subcategory == "top-level"


class TestDiscoverIncludesAllFiles:
    """Crucial regression: every test_*.py is in the catalog, not just
    the ones with a TEST_SUITE block."""

    def test_all_four_files_discovered(self, fake_repo):
        suites = discover_suites(fake_repo, scan_roots=[fake_repo / "tests"])
        ids = {s.id for s in suites}
        assert "client-no-metadata" in ids
        assert "my-explicit-id" in ids
        assert "fully-spelled-out" in ids
        assert "top-level" in ids
        assert len(suites) == 4
