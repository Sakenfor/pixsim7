"""Discover eval-corpus metadata from the backend evals tree.

Thin CLI wrapper around :mod:`testing.corpus_discovery`, mirroring
:mod:`scripts.tests.discover_backend_suites` (which does the same for
``TEST_SUITE`` markers). Eval corpora are static JSON, so discovery reads
each corpus's ``_meta`` block rather than parsing Python.

Usage:
    python scripts/tests/discover_eval_corpora.py            # JSON array to stdout
    python scripts/tests/discover_eval_corpora.py --check    # summary to stdout
    python scripts/tests/discover_eval_corpora.py --write    # write corpus-registry.json

The ``--write`` artifact (``scripts/tests/corpus-registry.json``) intentionally
mirrors the ``{version, sources, ...}`` envelope of ``test-registry.json`` so
the same loaders/UI can consume it later, but it is standalone — no coupling to
the (currently Vite-bound) ``generate_catalog.ts`` generator.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Ensure project root is importable.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from testing.corpus_discovery import discover_eval_corpora

REGISTRY_PATH = ROOT / "scripts" / "tests" / "corpus-registry.json"


def _build_payload(records: list[dict]) -> dict:
    return {
        "version": 1,
        "sources": [
            "testing/corpus_discovery.py (eval_corpus*.json _meta blocks)",
        ],
        "corpora": records,
    }


def main() -> int:
    corpora = discover_eval_corpora(ROOT)
    records = [c.to_dict() for c in corpora]

    if "--check" in sys.argv:
        print(f"[discover] Found {len(records)} eval corpora")
        for c in records:
            count = c.get("total_entries")
            count_str = str(count) if count is not None else "?"
            print(f"  {c['id']}: {count_str} entries -> {c['path']}")
        return 0

    if "--write" in sys.argv:
        payload = _build_payload(records)
        REGISTRY_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"[discover] Wrote {len(records)} corpora to {REGISTRY_PATH.relative_to(ROOT).as_posix()}")
        return 0

    print(json.dumps(records, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
