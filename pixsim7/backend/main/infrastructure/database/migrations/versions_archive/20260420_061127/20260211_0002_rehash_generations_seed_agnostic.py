"""Rehash generations reproducible_hash to ignore seed for sibling grouping.

Revision ID: 20260211_0002
Revises: 20260211_0001
Create Date: 2026-02-11 00:20:00.000000

This migration updates existing generations.reproducible_hash values to the
seed-agnostic hash format used for sibling grouping. Deduplication remains
seed-aware via cache keys computed at request time.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "20260211_0002"
down_revision = "20260211_0001"
branch_labels = None
depends_on = None


def _strip_seed(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, entry in value.items():
            if isinstance(key, str) and key.lower() == "seed":
                continue
            normalized[key] = _strip_seed(entry)
        return normalized
    if isinstance(value, list):
        return [_strip_seed(entry) for entry in value]
    return value


def _seed_agnostic_hash(canonical_params: Any, inputs: Any) -> str:
    canonical = canonical_params if isinstance(canonical_params, dict) else {}
    ordered_inputs = inputs if isinstance(inputs, list) else []
    payload = {
        "canonical_params": _strip_seed(canonical),
        "inputs": _strip_seed(ordered_inputs),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id, canonical_params, inputs
            FROM generations
            WHERE reproducible_hash IS NOT NULL
            """
        )
    ).mappings().all()

    updates: list[dict[str, Any]] = []
    for row in rows:
        updates.append(
            {
                "id": row["id"],
                "reproducible_hash": _seed_agnostic_hash(
                    row.get("canonical_params"),
                    row.get("inputs"),
                ),
            }
        )

    if updates:
        bind.execute(
            sa.text(
                """
                UPDATE generations
                SET reproducible_hash = :reproducible_hash
                WHERE id = :id
                """
            ),
            updates,
        )


def downgrade() -> None:
    # Irreversible: previous seed-sensitive hashes are not retained.
    pass

