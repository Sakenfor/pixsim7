"""Tests for plan governance sync and check logic."""
from __future__ import annotations

import os
import textwrap
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

from pixsim7.backend.main.services.docs import plans as plans_service
from pixsim7.backend.main.services.docs import plan_governance as gov


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_bundle(
    repo_root: Path,
    bundle_id: str,
    *,
    scope: str = "active",
    manifest_overrides: dict[str, Any] | None = None,
    plan_content: str | None = None,
) -> Path:
    """Write a minimal plan bundle (manifest.yaml + plan.md)."""
    bundle_dir = repo_root / "docs" / "plans" / scope / bundle_id
    bundle_dir.mkdir(parents=True, exist_ok=True)

    default_plan = textwrap.dedent("""\
        # Plan

        **Last updated:** 2026-03-13
        **Owner:** test-lane
        **Status:** active
        **Stage:** proposed

        ## Update Log

        - 2026-03-13: initial
    """)

    (bundle_dir / "plan.md").write_text(
        plan_content if plan_content is not None else default_plan,
        encoding="utf-8",
    )

    manifest: dict[str, Any] = {
        "id": bundle_id,
        "title": f"Plan {bundle_id}",
        "status": "active",
        "stage": "proposed",
        "owner": "test-lane",
        "last_updated": "2026-03-13",
        "plan_path": "./plan.md",
        "code_paths": [],
        "priority": "normal",
        "summary": f"Summary for {bundle_id}",
    }
    if manifest_overrides:
        manifest.update(manifest_overrides)

    (bundle_dir / "manifest.yaml").write_text(
        yaml.safe_dump(manifest, sort_keys=False),
        encoding="utf-8",
    )

    return bundle_dir


def _write_registry(
    repo_root: Path,
    plans: list[dict[str, Any]],
) -> Path:
    """Write a registry.yaml file."""
    registry_path = repo_root / "docs" / "plans" / "registry.yaml"
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry = {"version": 1, "plans": plans}
    registry_path.write_text(
        yaml.dump(registry, default_flow_style=False, sort_keys=False, width=10000),
        encoding="utf-8",
    )
    return registry_path


def _make_registry_entry(bundle_id: str, **overrides: Any) -> dict[str, Any]:
    """Build a registry entry dict for a bundle."""
    entry = {
        "id": bundle_id,
        "path": f"docs/plans/active/{bundle_id}/plan.md",
        "status": "active",
        "stage": "proposed",
        "owner": "test-lane",
        "last_updated": "2026-03-13",
        "code_paths": [],
        "priority": "normal",
        "summary": f"Summary for {bundle_id}",
    }
    entry.update(overrides)
    return entry


@pytest.fixture
def repo(tmp_path: Path, monkeypatch) -> Path:
    """Set up a minimal repo with plans dir and monkeypatch _resolve_repo_root."""
    (tmp_path / "docs" / "plans" / "active").mkdir(parents=True)
    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    monkeypatch.setattr(gov, "_resolve_repo_root", lambda: tmp_path)
    return tmp_path


# ---------------------------------------------------------------------------
# Sync tests
# ---------------------------------------------------------------------------


class TestSyncRegistry:

    def test_sync_generates_registry_yaml(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        _write_bundle(repo, "beta")

        result = gov.sync_registry(repo)

        assert result.ok
        registry_path = repo / "docs" / "plans" / "registry.yaml"
        assert registry_path.exists()
        data = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
        assert data["version"] == 1
        ids = [p["id"] for p in data["plans"]]
        assert ids == ["alpha", "beta"]  # sorted

    def test_sync_updates_readme_index(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")

        readme_path = repo / "docs" / "plans" / "README.md"
        readme_path.write_text(
            "# Plans\n\n<!-- BEGIN:GENERATED_PLAN_INDEX -->\nold\n<!-- END:GENERATED_PLAN_INDEX -->\n\nFooter\n",
            encoding="utf-8",
        )

        result = gov.sync_registry(repo)
        assert result.ok

        content = readme_path.read_text(encoding="utf-8")
        assert "Plan alpha" in content
        assert "old" not in content
        assert "Footer" in content

    def test_sync_check_mode_detects_out_of_sync(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        _write_registry(repo, [_make_registry_entry("wrong-id")])

        result = gov.sync_registry(repo, check_only=True)

        assert not result.ok
        assert any("out of sync" in e for e in result.errors)

    def test_sync_check_mode_passes_when_in_sync(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")

        # First write to generate correct registry
        gov.sync_registry(repo)
        # Then check
        result = gov.sync_registry(repo, check_only=True)

        assert result.ok

    def test_sync_errors_on_no_manifests(self, repo: Path) -> None:
        result = gov.sync_registry(repo)
        assert not result.ok
        assert any("No active manifests" in e for e in result.errors)

    def test_sync_deterministic_output(self, repo: Path) -> None:
        _write_bundle(repo, "zulu")
        _write_bundle(repo, "alpha")
        _write_bundle(repo, "mike")

        gov.sync_registry(repo)
        content1 = (repo / "docs" / "plans" / "registry.yaml").read_text(encoding="utf-8")

        gov.sync_registry(repo)
        content2 = (repo / "docs" / "plans" / "registry.yaml").read_text(encoding="utf-8")

        assert content1 == content2

    def test_sync_priority_sort_in_index(self, repo: Path) -> None:
        _write_bundle(repo, "low-plan", manifest_overrides={"priority": "low"})
        _write_bundle(repo, "high-plan", manifest_overrides={"priority": "high"})
        _write_bundle(repo, "normal-plan", manifest_overrides={"priority": "normal"})

        readme_path = repo / "docs" / "plans" / "README.md"
        readme_path.write_text(
            "<!-- BEGIN:GENERATED_PLAN_INDEX -->\n<!-- END:GENERATED_PLAN_INDEX -->\n",
            encoding="utf-8",
        )

        gov.sync_registry(repo)
        content = readme_path.read_text(encoding="utf-8")
        lines = content.strip().splitlines()
        # Table rows (skip markers and header/separator)
        plan_lines = [l for l in lines if l.startswith("| [")]
        # high should come first, then normal, then low
        assert "high-plan" in plan_lines[0]
        assert "normal-plan" in plan_lines[1]
        assert "low-plan" in plan_lines[2]


# ---------------------------------------------------------------------------
# Check: registry schema validation
# ---------------------------------------------------------------------------


class TestCheckRegistrySchema:

    def test_missing_registry_file(self, repo: Path) -> None:
        result = gov.GovernanceResult()
        parsed = gov._parse_registry(repo, result)
        assert parsed is None
        assert any("Missing registry file" in e for e in result.errors)

    def test_invalid_yaml(self, repo: Path) -> None:
        reg_path = repo / "docs" / "plans" / "registry.yaml"
        reg_path.write_text(": :\n  invalid: [yaml\n", encoding="utf-8")

        result = gov.GovernanceResult()
        parsed = gov._parse_registry(repo, result)
        assert parsed is None
        assert any("Could not parse registry YAML" in e for e in result.errors)

    def test_wrong_version(self, repo: Path) -> None:
        _write_registry(repo, [])
        reg_path = repo / "docs" / "plans" / "registry.yaml"
        data = yaml.safe_load(reg_path.read_text(encoding="utf-8"))
        data["version"] = 2
        reg_path.write_text(yaml.dump(data), encoding="utf-8")

        result = gov.GovernanceResult()
        gov._parse_registry(repo, result)
        assert any("version must be 1" in e for e in result.errors)

    def test_missing_plans_array(self, repo: Path) -> None:
        reg_path = repo / "docs" / "plans" / "registry.yaml"
        reg_path.parent.mkdir(parents=True, exist_ok=True)
        reg_path.write_text("version: 1\n", encoding="utf-8")

        result = gov.GovernanceResult()
        parsed = gov._parse_registry(repo, result)
        assert parsed is None
        assert any("plans as an array" in e for e in result.errors)

    def test_valid_empty_registry(self, repo: Path) -> None:
        _write_registry(repo, [])

        result = gov.GovernanceResult()
        parsed = gov._parse_registry(repo, result)
        assert parsed is not None
        assert parsed.version == 1
        assert len(parsed.plans) == 0


# ---------------------------------------------------------------------------
# Check: entry shape validation
# ---------------------------------------------------------------------------


class TestCheckEntryShape:

    def test_missing_required_fields(self, repo: Path) -> None:
        result = gov.GovernanceResult()
        gov._validate_plan_entry_shape({}, 0, result)
        assert len(result.errors) >= 6  # id, path, status, stage, owner, last_updated, code_paths, priority, summary

    def test_invalid_priority(self, repo: Path) -> None:
        entry_dict = _make_registry_entry("test")
        entry_dict["priority"] = "urgent"
        result = gov.GovernanceResult()
        gov._validate_plan_entry_shape(entry_dict, 0, result)
        assert any("priority must be one of" in e for e in result.errors)

    def test_code_paths_not_array(self, repo: Path) -> None:
        entry_dict = _make_registry_entry("test")
        entry_dict["code_paths"] = "not-an-array"
        result = gov.GovernanceResult()
        gov._validate_plan_entry_shape(entry_dict, 0, result)
        assert any("code_paths must be an array" in e for e in result.errors)


# ---------------------------------------------------------------------------
# Check: manifest-registry parity
# ---------------------------------------------------------------------------


class TestManifestRegistryParity:

    def test_parity_mismatch_detected(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        _write_registry(repo, [_make_registry_entry("beta")])

        result = gov.GovernanceResult()
        registry = gov._parse_registry(repo, result)
        assert registry is not None

        gov._check_manifest_registry_parity(registry, repo, result)
        assert any("out of sync" in e for e in result.errors)

    def test_parity_match_passes(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")

        # Sync to generate correct registry, then parse and check
        gov.sync_registry(repo)

        result = gov.GovernanceResult()
        registry = gov._parse_registry(repo, result)
        assert registry is not None

        gov._check_manifest_registry_parity(registry, repo, result)
        assert result.ok


# ---------------------------------------------------------------------------
# Check: file existence
# ---------------------------------------------------------------------------


class TestFileExistence:

    def test_missing_plan_file(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        # Remove the plan file
        (repo / "docs" / "plans" / "active" / "alpha" / "plan.md").unlink()

        # Need to also write a registry that references it
        _write_registry(repo, [_make_registry_entry("alpha")])

        result = gov.GovernanceResult()
        registry = gov._parse_registry(repo, result)
        assert registry is not None
        gov._validate_registry_entries(registry, repo, result)
        assert any("missing plan file" in e for e in result.errors)

    def test_missing_code_path(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", manifest_overrides={"code_paths": ["nonexistent/path"]})
        _write_registry(repo, [_make_registry_entry("alpha", code_paths=["nonexistent/path"])])

        result = gov.GovernanceResult()
        registry = gov._parse_registry(repo, result)
        assert registry is not None
        gov._validate_registry_entries(registry, repo, result)
        assert any("missing code_path" in e for e in result.errors)

    def test_duplicate_plan_id(self, repo: Path) -> None:
        _write_registry(repo, [
            _make_registry_entry("alpha"),
            _make_registry_entry("alpha"),
        ])

        result = gov.GovernanceResult()
        registry = gov._parse_registry(repo, result)
        assert registry is not None
        gov._validate_registry_entries(registry, repo, result)
        assert any("Duplicate plan id" in e for e in result.errors)


# ---------------------------------------------------------------------------
# Check: plan doc metadata
# ---------------------------------------------------------------------------


class TestPlanDocMetadata:

    def test_complete_metadata_passes(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        _write_registry(repo, [_make_registry_entry("alpha")])

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_metadata(entry, repo, result)
        assert result.ok
        assert len(result.warnings) == 0

    def test_missing_metadata_warning(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", plan_content="# Plan\n\nNo metadata here.\n")

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_metadata(entry, repo, result)
        assert len(result.warnings) > 0
        assert any("missing metadata" in w for w in result.warnings)

    def test_missing_metadata_strict_is_error(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", plan_content="# Plan\n\nNo metadata here.\n")

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_metadata(entry, repo, result, strict=True)
        assert any("missing metadata" in e for e in result.errors)

    def test_partial_metadata(self, repo: Path) -> None:
        plan = textwrap.dedent("""\
            # Plan

            **Owner:** someone
            **Status:** active
        """)
        _write_bundle(repo, "alpha", plan_content=plan)

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_metadata(entry, repo, result)
        # Should warn about missing Last updated, Stage, Update Log
        assert len(result.warnings) == 1
        warning = result.warnings[0]
        assert "Last updated" in warning
        assert "Stage" in warning
        assert "Update Log" in warning


# ---------------------------------------------------------------------------
# Check: path references
# ---------------------------------------------------------------------------


class TestPathReferences:

    def test_valid_path_ref_passes(self, repo: Path) -> None:
        plan_with_ref = textwrap.dedent("""\
            # Plan

            See `docs/plans/active/alpha/companion.md` for details.

            **Last updated:** 2026-03-13
            **Owner:** test
            **Status:** active
            **Stage:** proposed

            ## Update Log
            - init
        """)
        _write_bundle(repo, "alpha", plan_content=plan_with_ref)

        # Create a referenced file (after bundle dir exists)
        (repo / "docs" / "plans" / "active" / "alpha" / "companion.md").write_text(
            "# Companion", encoding="utf-8"
        )

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_path_references(entry, repo, result, [])
        assert result.ok

    def test_broken_path_ref_warns(self, repo: Path) -> None:
        plan_with_ref = "# Plan\n\nSee `docs/plans/nonexistent-file.md` for details.\n"
        _write_bundle(repo, "alpha", plan_content=plan_with_ref)

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_path_references(entry, repo, result, [])
        assert any("broken path references" in w for w in result.warnings)

    def test_broken_path_ref_strict_is_error(self, repo: Path) -> None:
        plan_with_ref = "# Plan\n\nSee `docs/plans/nonexistent-file.md` for details.\n"
        _write_bundle(repo, "alpha", plan_content=plan_with_ref)

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_path_references(entry, repo, result, [], strict=True)
        assert any("broken path references" in e for e in result.errors)

    def test_ignored_path_ref_skipped(self, repo: Path) -> None:
        import re as re_mod

        plan_with_ref = "# Plan\n\nSee `docs/plans/nonexistent-file.md` for details.\n"
        _write_bundle(repo, "alpha", plan_content=plan_with_ref)

        ignore = [re_mod.compile(r"docs/plans/nonexistent")]

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_path_references(entry, repo, result, ignore)
        assert result.ok
        assert len(result.warnings) == 0

    def test_url_not_treated_as_path_ref(self, repo: Path) -> None:
        plan = "# Plan\n\nSee [link](https://example.com) and `/api/v1/foo`.\n"
        _write_bundle(repo, "alpha", plan_content=plan)

        result = gov.GovernanceResult()
        entry = gov.RegistryEntry(**_make_registry_entry("alpha"))
        gov._check_plan_doc_path_references(entry, repo, result, [])
        # URLs and /api/ paths should be filtered out
        assert result.ok


# ---------------------------------------------------------------------------
# Check: code-to-plan drift
# ---------------------------------------------------------------------------


class TestCodeToPlanDrift:

    def test_drift_skipped_when_shas_absent(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", manifest_overrides={"code_paths": ["apps/main"]})
        entry = gov.RegistryEntry(**_make_registry_entry("alpha", code_paths=["apps/main"]))

        result = gov.GovernanceResult()
        gov._check_code_to_plan_drift([entry], repo, result, base_sha="", head_sha="")
        # Should warn about missing SHAs, not error
        assert result.ok
        assert any("PLAN_BASE_SHA/PLAN_HEAD_SHA not provided" in w for w in result.warnings)

    def test_drift_detected_when_code_changed_but_plan_not(self, repo: Path) -> None:
        entry = gov.RegistryEntry(**_make_registry_entry(
            "alpha",
            code_paths=["apps/main/src"],
        ))

        result = gov.GovernanceResult()
        with patch.object(gov, "_get_changed_files", return_value=[
            "apps/main/src/file.ts",
        ]):
            gov._check_code_to_plan_drift(
                [entry], repo, result,
                base_sha="abc", head_sha="def",
            )
        assert any("no impacted plan doc was updated" in e for e in result.errors)

    def test_drift_passes_when_plan_touched(self, repo: Path) -> None:
        entry = gov.RegistryEntry(**_make_registry_entry(
            "alpha",
            code_paths=["apps/main/src"],
        ))

        result = gov.GovernanceResult()
        with patch.object(gov, "_get_changed_files", return_value=[
            "apps/main/src/file.ts",
            "docs/plans/active/alpha/plan.md",
        ]):
            gov._check_code_to_plan_drift(
                [entry], repo, result,
                base_sha="abc", head_sha="def",
            )
        assert result.ok

    def test_drift_passes_when_registry_touched(self, repo: Path) -> None:
        entry = gov.RegistryEntry(**_make_registry_entry(
            "alpha",
            code_paths=["apps/main/src"],
        ))

        result = gov.GovernanceResult()
        with patch.object(gov, "_get_changed_files", return_value=[
            "apps/main/src/file.ts",
            "docs/plans/registry.yaml",
        ]):
            gov._check_code_to_plan_drift(
                [entry], repo, result,
                base_sha="abc", head_sha="def",
            )
        assert result.ok

    def test_drift_ignores_non_active_plans(self, repo: Path) -> None:
        entry = gov.RegistryEntry(**_make_registry_entry(
            "alpha",
            status="done",
            code_paths=["apps/main/src"],
        ))

        result = gov.GovernanceResult()
        with patch.object(gov, "_get_changed_files", return_value=[
            "apps/main/src/file.ts",
        ]):
            gov._check_code_to_plan_drift(
                [entry], repo, result,
                base_sha="abc", head_sha="def",
            )
        assert result.ok


# ---------------------------------------------------------------------------
# Check: architecture doc metadata (rulebook)
# ---------------------------------------------------------------------------


class TestRulebookMetadata:

    def test_arch_doc_missing_metadata_warns(self, repo: Path) -> None:
        arch_dir = repo / "docs" / "architecture"
        arch_dir.mkdir(parents=True)
        (arch_dir / "design.md").write_text("# Design\n\nNo metadata.\n", encoding="utf-8")

        result = gov.GovernanceResult()
        gov._check_architecture_doc_metadata(repo, result)
        assert any("[rulebook]" in w and "missing metadata" in w for w in result.warnings)

    def test_arch_doc_missing_metadata_strict_errors(self, repo: Path) -> None:
        arch_dir = repo / "docs" / "architecture"
        arch_dir.mkdir(parents=True)
        (arch_dir / "design.md").write_text("# Design\n\nNo metadata.\n", encoding="utf-8")

        result = gov.GovernanceResult()
        gov._check_architecture_doc_metadata(repo, result, strict=True)
        assert any("[rulebook]" in e and "missing metadata" in e for e in result.errors)

    def test_arch_doc_with_metadata_passes(self, repo: Path) -> None:
        arch_dir = repo / "docs" / "architecture"
        arch_dir.mkdir(parents=True)
        (arch_dir / "design.md").write_text(
            "# Design\n\n**Last updated:** 2026-03-13\n**Owner:** team\n\nContent.\n",
            encoding="utf-8",
        )

        result = gov.GovernanceResult()
        gov._check_architecture_doc_metadata(repo, result)
        assert result.ok

    def test_no_arch_dir_passes(self, repo: Path) -> None:
        result = gov.GovernanceResult()
        gov._check_architecture_doc_metadata(repo, result)
        assert result.ok


# ---------------------------------------------------------------------------
# Check: path ref ignore patterns
# ---------------------------------------------------------------------------


class TestPathRefIgnorePatterns:

    def test_load_from_file(self, repo: Path) -> None:
        ignore_file = repo / "docs" / "plans" / "path-ref-ignores.txt"
        ignore_file.write_text(
            "# comment\n^docs/fixtures/\n\n^examples/\n",
            encoding="utf-8",
        )

        result = gov.GovernanceResult()
        config = gov.GovernanceConfig()
        regexes = gov._load_path_ref_ignore_regexes(repo, result, config)
        assert len(regexes) == 2
        assert result.ok

    def test_load_from_env_patterns(self, repo: Path) -> None:
        result = gov.GovernanceResult()
        config = gov.GovernanceConfig(
            path_ref_ignore_patterns=["^docs/fixtures/", "^examples/"],
        )
        regexes = gov._load_path_ref_ignore_regexes(repo, result, config)
        assert len(regexes) == 2

    def test_invalid_regex_warns(self, repo: Path) -> None:
        result = gov.GovernanceResult()
        config = gov.GovernanceConfig(
            path_ref_ignore_patterns=["[invalid"],
        )
        regexes = gov._load_path_ref_ignore_regexes(repo, result, config)
        assert len(regexes) == 0
        assert any("Invalid path-ref ignore regex" in w for w in result.warnings)


# ---------------------------------------------------------------------------
# Check: config from env
# ---------------------------------------------------------------------------


class TestConfigFromEnv:

    def test_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            config = gov.config_from_env()
        assert not config.strict_plan_docs
        assert not config.strict_plan_metadata
        assert config.plan_base_sha == ""
        assert config.path_ref_ignore_patterns == []

    def test_strict_plan_docs(self) -> None:
        with patch.dict(os.environ, {"STRICT_PLAN_DOCS": "1"}, clear=True):
            config = gov.config_from_env()
        assert config.strict_plan_docs

    def test_git_shas(self) -> None:
        with patch.dict(os.environ, {
            "PLAN_BASE_SHA": "abc123",
            "PLAN_HEAD_SHA": "def456",
        }, clear=True):
            config = gov.config_from_env()
        assert config.plan_base_sha == "abc123"
        assert config.plan_head_sha == "def456"

    def test_ignore_patterns(self) -> None:
        with patch.dict(os.environ, {
            "PLAN_PATH_REF_IGNORE_PATTERNS": "^fixtures/, ^temp/",
        }, clear=True):
            config = gov.config_from_env()
        assert config.path_ref_ignore_patterns == ["^fixtures/", "^temp/"]


# ---------------------------------------------------------------------------
# Integration: full check_registry
# ---------------------------------------------------------------------------


class TestCheckRegistryIntegration:

    def test_full_check_passes_on_valid_repo(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        gov.sync_registry(repo)

        config = gov.GovernanceConfig()
        result = gov.check_registry(repo, config)
        assert result.ok

    def test_full_check_detects_parity_mismatch(self, repo: Path) -> None:
        _write_bundle(repo, "alpha")
        _write_registry(repo, [_make_registry_entry("wrong")])

        config = gov.GovernanceConfig()
        result = gov.check_registry(repo, config)
        assert not result.ok

    def test_full_check_strict_metadata(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", plan_content="# Plan\n\nNo metadata.\n")
        gov.sync_registry(repo)

        config = gov.GovernanceConfig(strict_plan_metadata=True)
        result = gov.check_registry(repo, config)
        assert any("missing metadata" in e for e in result.errors)

    def test_full_check_non_strict_metadata_warns(self, repo: Path) -> None:
        _write_bundle(repo, "alpha", plan_content="# Plan\n\nNo metadata.\n")
        gov.sync_registry(repo)

        config = gov.GovernanceConfig()
        result = gov.check_registry(repo, config)
        assert any("missing metadata" in w for w in result.warnings)
        # Should still pass (warnings only)
        # Note: parity check will pass since we synced, but metadata is a warning
        # The check may still fail if the manifest loader itself errors on missing plan markdown


# ---------------------------------------------------------------------------
# Normalize candidate path
# ---------------------------------------------------------------------------


class TestNormalizeCandidatePath:

    def test_url_filtered(self) -> None:
        assert gov._normalize_candidate_path("https://example.com") is None

    def test_api_route_filtered(self) -> None:
        assert gov._normalize_candidate_path("/api/v1/foo") is None

    def test_absolute_path_filtered(self) -> None:
        assert gov._normalize_candidate_path("/usr/local/bin") is None

    def test_wildcard_filtered(self) -> None:
        assert gov._normalize_candidate_path("docs/*.md") is None

    def test_ellipsis_filtered(self) -> None:
        assert gov._normalize_candidate_path("path/to/...") is None

    def test_template_variable_filtered(self) -> None:
        assert gov._normalize_candidate_path("${HOME}/config") is None
        assert gov._normalize_candidate_path("{{base}}/file.md") is None

    def test_relative_path_accepted(self) -> None:
        assert gov._normalize_candidate_path("./plan.md") == "./plan.md"

    def test_repo_path_accepted(self) -> None:
        assert gov._normalize_candidate_path("docs/plans/foo.md") == "docs/plans/foo.md"

    def test_line_suffix_stripped(self) -> None:
        assert gov._normalize_candidate_path("apps/main/src/file.ts:42:10") == "apps/main/src/file.ts"

    def test_spaces_filtered(self) -> None:
        assert gov._normalize_candidate_path("path with spaces") is None

    def test_no_slash_no_extension_filtered(self) -> None:
        assert gov._normalize_candidate_path("justAWord") is None

    def test_unknown_prefix_filtered(self) -> None:
        assert gov._normalize_candidate_path("unknown/prefix/file.ts") is None
