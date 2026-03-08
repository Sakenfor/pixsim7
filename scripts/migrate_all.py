#!/usr/bin/env python3
"""Run all PixSim7 Alembic migration chains in a fixed order.

Usage:
  python scripts/migrate_all.py
  python scripts/migrate_all.py --scope main
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List


ROOT = Path(__file__).resolve().parents[1]

MIGRATION_CHAINS = {
    "main": "alembic.ini",
    "game": "alembic_game.ini",
    "blocks": "alembic_blocks.ini",
    "logs": "alembic_logs.ini",
}

ORDERED_SCOPE = ["main", "game", "blocks", "logs"]


def _build_scopes(scope: str) -> List[str]:
    if scope == "all":
        return ORDERED_SCOPE.copy()
    return [scope]


def _run_alembic(config_file: str, env: dict[str, str]) -> None:
    cmd = [
        sys.executable,
        "-m",
        "alembic",
        "-c",
        str(ROOT / config_file),
        "upgrade",
        "head",
    ]
    print(f"==> {config_file}: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT, env=env, check=True)


def run(scopes: Iterable[str]) -> None:
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH", "")
    if existing_pythonpath:
        env["PYTHONPATH"] = f"{ROOT}{os.pathsep}{existing_pythonpath}"
    else:
        env["PYTHONPATH"] = str(ROOT)

    for scope in scopes:
        config_file = MIGRATION_CHAINS[scope]
        _run_alembic(config_file, env)

    print("All requested migration chains are up to date.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run PixSim7 Alembic migrations.")
    parser.add_argument(
        "--scope",
        choices=["all", *ORDERED_SCOPE],
        default="all",
        help="Which migration chain to run (default: all).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scopes = _build_scopes(args.scope)
    try:
        run(scopes)
        return 0
    except subprocess.CalledProcessError as exc:
        print(f"Migration failed with exit code {exc.returncode}.", file=sys.stderr)
        return exc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
