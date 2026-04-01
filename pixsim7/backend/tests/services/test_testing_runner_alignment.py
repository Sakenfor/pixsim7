"""
Tests for runner-alignment validation in the testing catalog.

Validates that the catalog cross-check correctly detects when a discovered
test suite's file would not be picked up by its test runner (pytest / vitest).
"""

import textwrap
import tempfile
from pathlib import Path

import pytest

from pixsim7.backend.main.services.testing.catalog import (
    _expand_braces,
    _glob_matches_filename,
    _parse_pytest_file_patterns,
    _parse_vitest_include,
    validate_runner_alignment,
)

TEST_SUITE = {
    "id": "testing-runner-alignment",
    "label": "Testing Runner Alignment",
    "kind": "unit",
    "category": "backend/testing",
    "subcategory": "catalog",
    "covers": [
        "pixsim7/backend/main/services/testing/catalog.py",
        "pixsim7/backend/main/services/testing/discovery.py",
    ],
    "order": 26,
}


# ---------------------------------------------------------------------------
# _expand_braces
# ---------------------------------------------------------------------------

class TestExpandBraces:
    def test_single_brace_group(self):
        assert sorted(_expand_braces("*.test.{ts,tsx}")) == sorted(
            ["*.test.ts", "*.test.tsx"]
        )

    def test_no_braces(self):
        assert _expand_braces("*.test.ts") == ["*.test.ts"]

    def test_three_alternatives(self):
        result = _expand_braces("*.{ts,tsx,mts}")
        assert len(result) == 3
        assert "*.ts" in result
        assert "*.tsx" in result
        assert "*.mts" in result


# ---------------------------------------------------------------------------
# _glob_matches_filename
# ---------------------------------------------------------------------------

class TestGlobMatchesFilename:
    def test_vitest_pattern_matches_ts(self):
        assert _glob_matches_filename("src/**/*.test.ts", "foo.test.ts")

    def test_vitest_pattern_matches_tsx(self):
        assert _glob_matches_filename("src/**/*.test.tsx", "bar.test.tsx")

    def test_vitest_pattern_rejects_wrong_ext(self):
        assert not _glob_matches_filename("src/**/*.test.ts", "foo.test.tsx")

    def test_simple_pattern(self):
        assert _glob_matches_filename("*.test.ts", "quickGenerate.test.ts")

    def test_pytest_pattern(self):
        assert _glob_matches_filename("test_*.py", "test_assets.py")

    def test_pytest_rejects_non_test(self):
        assert not _glob_matches_filename("test_*.py", "conftest.py")


# ---------------------------------------------------------------------------
# _parse_vitest_include
# ---------------------------------------------------------------------------

class TestParseVitestInclude:
    def test_parses_real_config_shape(self, tmp_path: Path):
        config = tmp_path / "vite.config.ts"
        config.write_text(textwrap.dedent("""\
            import { defineConfig } from 'vite';
            export default defineConfig({
              test: {
                globals: true,
                environment: 'jsdom',
                include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
              },
            });
        """))
        patterns = _parse_vitest_include(config)
        assert "src/**/__tests__/**/*.test.ts" in patterns
        assert "src/**/__tests__/**/*.test.tsx" in patterns
        assert "src/**/*.test.ts" in patterns
        assert "src/**/*.test.tsx" in patterns

    def test_returns_empty_for_missing_file(self, tmp_path: Path):
        assert _parse_vitest_include(tmp_path / "nonexistent.ts") == []

    def test_returns_empty_for_no_include(self, tmp_path: Path):
        config = tmp_path / "vite.config.ts"
        config.write_text("export default defineConfig({});")
        assert _parse_vitest_include(config) == []


# ---------------------------------------------------------------------------
# _parse_pytest_file_patterns
# ---------------------------------------------------------------------------

class TestParsePytestPatterns:
    def test_parses_real_ini(self, tmp_path: Path):
        ini = tmp_path / "pytest.ini"
        ini.write_text(textwrap.dedent("""\
            [pytest]
            python_files = test_*.py
        """))
        patterns = _parse_pytest_file_patterns(ini)
        assert "test_*.py" in patterns

    def test_defaults_when_missing(self, tmp_path: Path):
        patterns = _parse_pytest_file_patterns(tmp_path / "missing.ini")
        assert "test_*.py" in patterns

    def test_multiple_patterns(self, tmp_path: Path):
        ini = tmp_path / "pytest.ini"
        ini.write_text(textwrap.dedent("""\
            [pytest]
            python_files = test_*.py check_*.py
        """))
        patterns = _parse_pytest_file_patterns(ini)
        assert "test_*.py" in patterns
        assert "check_*.py" in patterns


# ---------------------------------------------------------------------------
# validate_runner_alignment — integration
# ---------------------------------------------------------------------------

class TestValidateRunnerAlignment:
    @pytest.fixture()
    def fake_root(self, tmp_path: Path) -> Path:
        """Create a minimal project root with runner configs."""
        # pytest.ini
        (tmp_path / "pytest.ini").write_text(textwrap.dedent("""\
            [pytest]
            python_files = test_*.py
        """))
        # vite.config.ts
        apps = tmp_path / "apps" / "main"
        apps.mkdir(parents=True)
        (apps / "vite.config.ts").write_text(textwrap.dedent("""\
            export default defineConfig({
              test: {
                include: ['src/**/*.test.{ts,tsx}'],
              },
            });
        """))
        return tmp_path

    def test_no_warnings_for_aligned_suites(self, fake_root: Path):
        suites = [
            {"id": "be-1", "layer": "backend", "path": "tests/test_foo.py"},
            {"id": "fe-1", "layer": "frontend", "path": "apps/main/src/foo.test.ts"},
            {"id": "fe-2", "layer": "frontend", "path": "apps/main/src/bar.test.tsx"},
        ]
        warnings = validate_runner_alignment(suites, root=fake_root)
        assert warnings == []

    def test_warns_for_misaligned_frontend_extension(self, fake_root: Path):
        suites = [
            {"id": "fe-bad", "layer": "frontend", "path": "apps/main/src/foo.test.mts"},
        ]
        warnings = validate_runner_alignment(suites, root=fake_root)
        assert len(warnings) == 1
        assert "fe-bad" in warnings[0]
        assert "runner-alignment" in warnings[0]

    def test_warns_for_misaligned_backend_name(self, fake_root: Path):
        suites = [
            {"id": "be-bad", "layer": "backend", "path": "tests/check_foo.py"},
        ]
        warnings = validate_runner_alignment(suites, root=fake_root)
        assert len(warnings) == 1
        assert "be-bad" in warnings[0]

    def test_conftest_accepted_for_backend(self, fake_root: Path):
        suites = [
            {"id": "be-conf", "layer": "backend", "path": "tests/conftest.py"},
        ]
        warnings = validate_runner_alignment(suites, root=fake_root)
        assert warnings == []

    @pytest.mark.slow
    def test_real_project_root_produces_no_warnings(self):
        """Smoke test: validate against the actual project runner configs.

        If this fails, a real drift has been introduced.
        """
        from pixsim7.backend.main.services.testing.catalog import build_catalog, _get_root

        root = _get_root()
        if not (root / "pytest.ini").exists():
            pytest.skip("not running from project root")

        suites = build_catalog(root)
        warnings = validate_runner_alignment(suites, root=root)
        assert warnings == [], (
            f"Runner-alignment drift detected:\n" + "\n".join(warnings)
        )
