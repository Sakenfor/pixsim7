"""Unit tests for the ShellScriptDiagnostic discovery enrichment.

These cover the pure metadata layer added on top of the raw ``tools/`` +
``scripts/`` glob: docstring-summary extraction, ``--apply`` detection, the
self-documenting select label, and recovering the path back out of a label.
"""
from __future__ import annotations

import types

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
    disc = ss.get_discovery()
    assert set(disc.allowed) == {m.path for m in disc.scripts}
    assert set(disc.by_path) == set(disc.allowed)
    assert len(disc.options) == len(disc.scripts)
    # Each option's leading token resolves to an allowlisted path.
    for opt in disc.options:
        assert ss._parse_script_path(opt) in disc.allowed


def test_backfill_scripts_detected_as_apply_capable() -> None:
    # Real repo scripts: the backfill_* family declares --apply (dry-run default).
    disc = ss.get_discovery()
    apply_capable = {m.path for m in disc.scripts if m.has_apply}
    backfills = {m.path for m in disc.scripts if m.path.startswith("tools/backfill_")}
    assert backfills, "expected some tools/backfill_*.py to be discovered"
    # Not asserting every single one, but the bulk should support --apply.
    assert backfills & apply_capable == backfills


# ── Dynamic discovery: new scripts appear without a backend restart ──────────


def _use_fake_repo(monkeypatch, tmp_path) -> None:
    """Point discovery at an empty tmp repo_root and clear the scan cache."""
    (tmp_path / "tools").mkdir()
    (tmp_path / "scripts").mkdir()
    monkeypatch.setattr(
        ss, "get_path_registry", lambda: types.SimpleNamespace(repo_root=tmp_path)
    )
    monkeypatch.setattr(ss, "_discovery_cache", None)
    monkeypatch.setattr(ss, "_discovery_sig", None)


def test_discovery_finds_new_script_and_reads_metadata(monkeypatch, tmp_path) -> None:
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "tools" / "backfill_thing.py").write_text(
        '"""Do a thing.\n\nlonger body ignored\n"""\n'
        'import argparse\n'
        'argparse.ArgumentParser().add_argument("--apply")\n'
    )
    disc = ss.get_discovery()
    assert "tools/backfill_thing.py" in disc.allowed
    meta = disc.by_path["tools/backfill_thing.py"]
    assert meta.summary == "Do a thing."
    assert meta.has_apply is True


def test_discovery_skips_underscore_files(monkeypatch, tmp_path) -> None:
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "tools" / "_helper.py").write_text("x = 1\n")
    (tmp_path / "tools" / "real.py").write_text('"""Real."""\n')
    disc = ss.get_discovery()
    assert "tools/real.py" in disc.allowed
    assert "tools/_helper.py" not in disc.allowed


def test_discovery_reflects_add_and_remove_without_reimport(monkeypatch, tmp_path) -> None:
    _use_fake_repo(monkeypatch, tmp_path)
    f = tmp_path / "scripts" / "probe.py"
    f.write_text('"""Probe."""\n')
    assert "scripts/probe.py" in ss.get_discovery().allowed
    f.unlink()
    assert "scripts/probe.py" not in ss.get_discovery().allowed


def test_discovery_caches_until_signature_changes(monkeypatch, tmp_path) -> None:
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "tools" / "a.py").write_text('"""A."""\n')
    d1 = ss.get_discovery()
    d2 = ss.get_discovery()
    assert d1 is d2  # unchanged dir fingerprint -> same cached snapshot
    (tmp_path / "tools" / "b.py").write_text('"""B."""\n')
    d3 = ss.get_discovery()
    assert d3 is not d1  # fingerprint changed -> fresh scan
    assert "tools/b.py" in d3.allowed


def test_get_spec_options_track_discovery(monkeypatch, tmp_path) -> None:
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "tools" / "backfill_z.py").write_text(
        '"""Zeta."""\nimport argparse\nargparse.ArgumentParser().add_argument("--apply")\n'
    )
    spec = ss.ShellScriptDiagnostic().get_spec()
    script_param = next(p for p in spec.params if p.name == "script")
    assert any("tools/backfill_z.py" in opt for opt in script_param.options)
    # The default is the first listed option so the run-form pre-selects validly.
    assert script_param.default == script_param.options[0]
