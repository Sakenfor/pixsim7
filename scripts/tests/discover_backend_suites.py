"""Discover TEST_SUITE metadata from backend and scripts test files.

Thin CLI wrapper around ``pixsim7.backend.main.services.testing.discovery``.

Usage:
    python scripts/tests/discover_backend_suites.py           # JSON to stdout
    python scripts/tests/discover_backend_suites.py --check   # summary to stderr
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Ensure project root is importable.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pixsim7.backend.main.services.testing.discovery import discover_suites


def main() -> int:
    suites = discover_suites(ROOT)
    records = [s.to_dict() for s in suites]

    if "--check" in sys.argv:
        print(f"[discover] Found {len(records)} backend/scripts suites with TEST_SUITE")
        for s in records:
            print(f"  {s['id']}: {s['path']}")
        return 0

    print(json.dumps(records, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
