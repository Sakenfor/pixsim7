#!/bin/bash
# Quick script to run database migrations

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALEMBIC_CONFIG="$ROOT_DIR/alembic.ini"

if [ ! -f "$ALEMBIC_CONFIG" ]; then
  echo "alembic.ini not found at: $ALEMBIC_CONFIG" >&2
  exit 1
fi

PYTHONPATH="$ROOT_DIR" alembic -c "$ALEMBIC_CONFIG" upgrade head
