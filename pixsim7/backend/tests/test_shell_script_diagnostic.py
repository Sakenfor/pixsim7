"""Unit tests for the ShellScriptDiagnostic discovery enrichment.

These cover the pure metadata layer added on top of the raw ``tools/`` +
``scripts/`` glob: docstring-summary extraction, ``--apply`` detection, the
self-documenting select label, and recovering the path back out of a label.
"""
from __future__ import annotations

from pixsim7.backend.main.services.diagnostics import shell_script as ss


def test_extract_summary_first_docstring_line() -> None:
    text = '"""First line summary.\n\nLonger body that should be ignored.\n"""\nx = 1\n'
    assert ss._extract_summary(text) == "First line summary."


def test_extract_summary_truncates_long_lines() -> None:
    long = "x" * 200
    text = f'"""{long}"""\n'
    out = ss._extract_summary(text)
    assert len(out) <= ss._SUMMARY_MAX
    assert out.endswith("…")


def test_extract_summary_empty_on_no_docstring_or_syntax_error() -> None:
    assert ss._extract_summary("x = 1\n") == ""
    assert ss._extract_summary("def (:\n") == ""  # syntax error → no crash


def test_option_label_round_trips_to_path() -> None:
    meta = ss._ScriptMeta(
        path="tools/backfill_thing.py",
        summary="Does the thing.",
        has_apply=True,
    )
    label = ss._option_label(meta)
    assert label.startswith("tools/backfill_thing.py")
    assert "[--apply]" in label
    assert "Does the thing." in label
    # The leading token must be recoverable as the exact path (the select value).
    assert ss._parse_script_path(label) == meta.path


def test_parse_script_path_tolerates_bare_path_and_junk() -> None:
    assert ss._parse_script_path("tools/x.py") == "tools/x.py"
    assert ss._parse_script_path("") == ""
    assert ss._parse_script_path(None) == ""


def test_discovery_indexes_are_consistent() -> None:
    # Every discovered script is keyed by its path and produces one option.
    assert set(ss._ALLOWED) == {m.path for m in ss._SCRIPTS}
    assert set(ss._META_BY_PATH) == set(ss._ALLOWED)
    assert len(ss._OPTIONS) == len(ss._SCRIPTS)
    # Each option's leading token resolves to an allowlisted path.
    for opt in ss._OPTIONS:
        assert ss._parse_script_path(opt) in ss._ALLOWED


def test_backfill_scripts_detected_as_apply_capable() -> None:
    # Real repo scripts: the backfill_* family declares --apply (dry-run default).
    apply_capable = {m.path for m in ss._SCRIPTS if m.has_apply}
    backfills = {m.path for m in ss._SCRIPTS if m.path.startswith("tools/backfill_")}
    assert backfills, "expected some tools/backfill_*.py to be discovered"
    # Not asserting every single one, but the bulk should support --apply.
    assert backfills & apply_capable == backfills
