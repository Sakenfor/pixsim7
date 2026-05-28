"""Parity guard for the backfill applied-ledger convention.

Every one-shot data backfill that supports ``--apply`` must stamp the
``backfill_applied`` ledger via ``record_backfill_applied`` (see
``services/diagnostics/applied_ledger``). Without it, "has this backfill been
applied?" is unanswerable for CLI / agent-Bash invocations — the diagnostics
runner only sees runs launched through it. This test fails when a new
``tools/backfill_*.py`` adds ``--apply`` but forgets to record, mirroring the
sibling-package filesystem↔registry parity guard.

The "applyable" set is defined the same way diagnostics discovery defines it
(``--apply`` present in the source), so the convention matches exactly what the
diagnostics surface advertises as an applyable backfill.
"""
from __future__ import annotations

from pathlib import Path

from pixsim7.backend.main.shared.path_registry import get_path_registry

_HELPER = "record_backfill_applied"


def _applyable_backfills() -> list[Path]:
    tools = get_path_registry().repo_root / "tools"
    return [
        p
        for p in sorted(tools.glob("backfill_*.py"))
        if "--apply" in p.read_text(encoding="utf-8", errors="replace")
    ]


def test_every_apply_backfill_records_to_ledger() -> None:
    missing = [
        p.name
        for p in _applyable_backfills()
        if _HELPER not in p.read_text(encoding="utf-8", errors="replace")
    ]
    assert not missing, (
        f"backfill script(s) {sorted(missing)} declare --apply but never call "
        f"{_HELPER}(). Stamp the applied-ledger after a successful --apply "
        f"(see tools/backfill_source_hash_match.py for the reference pattern)."
    )


def test_applyable_backfills_are_discoverable() -> None:
    # Guard against the glob silently matching nothing (e.g. a path-registry
    # regression), which would make the parity assertion vacuously pass.
    assert _applyable_backfills(), "no tools/backfill_*.py with --apply found"
