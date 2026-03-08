#!/bin/bash
# Shell wrapper for scripts/migrate_all.py.
# Default scope is all chains: main, game, blocks, logs.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/migrate_all.py"
SCOPE="${1:-all}"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "scripts/migrate_all.py not found at: $SCRIPT_PATH" >&2
  exit 1
fi

python "$SCRIPT_PATH" --scope "$SCOPE"
