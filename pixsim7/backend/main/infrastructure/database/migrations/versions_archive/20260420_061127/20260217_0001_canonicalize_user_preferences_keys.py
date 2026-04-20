"""Canonicalize users.preferences keys to structured schema.

Revision ID: 20260217_0001
Revises: 20260216_0003
Create Date: 2026-02-17

Rewrites legacy preference keys (snake_case variants) to canonical keys used
by the strict UserPreferences API contract.
"""

from __future__ import annotations

from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "20260217_0001"
down_revision = "20260216_0003"
branch_labels = None
depends_on = None


_TOP_LEVEL_KEY_MAP = {
    "local_folders": "localFolders",
    "max_content_rating": "maxContentRating",
    "reduce_romantic_intensity": "reduceRomanticIntensity",
    "require_mature_content_confirmation": "requireMatureContentConfirmation",
}


def _canonicalize_local_folders(value: Any) -> Any:
    if not isinstance(value, list):
        return value

    out: list[Any] = []
    for item in value:
        if not isinstance(item, dict):
            out.append(item)
            continue

        mapped = dict(item)
        if "added_at" in mapped:
            if "addedAt" not in mapped or mapped["addedAt"] is None:
                mapped["addedAt"] = mapped["added_at"]
            mapped.pop("added_at", None)
        out.append(mapped)
    return out


def _canonicalize_preferences(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    out = dict(value)

    for legacy_key, canonical_key in _TOP_LEVEL_KEY_MAP.items():
        if legacy_key not in out:
            continue
        if canonical_key not in out or out[canonical_key] is None:
            out[canonical_key] = out[legacy_key]
        out.pop(legacy_key, None)

    debug = out.get("debug")
    if isinstance(debug, dict) and "validate_composition_vocabs" in debug:
        mapped_debug = dict(debug)
        if "validateCompositionVocabs" not in mapped_debug or mapped_debug["validateCompositionVocabs"] is None:
            mapped_debug["validateCompositionVocabs"] = mapped_debug["validate_composition_vocabs"]
        mapped_debug.pop("validate_composition_vocabs", None)
        out["debug"] = mapped_debug

    if "localFolders" in out:
        out["localFolders"] = _canonicalize_local_folders(out["localFolders"])

    return out


def upgrade() -> None:
    bind = op.get_bind()

    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("preferences", sa.JSON()),
    )

    rows = bind.execute(sa.select(users.c.id, users.c.preferences)).mappings().all()
    updates: list[dict[str, Any]] = []

    for row in rows:
        current = row["preferences"]
        canonical = _canonicalize_preferences(current)
        if canonical != current:
            updates.append({"user_id": row["id"], "preferences": canonical})

    if updates:
        stmt = (
            sa.update(users)
            .where(users.c.id == sa.bindparam("user_id"))
            .values(preferences=sa.bindparam("preferences"))
        )
        bind.execute(stmt, updates)


def downgrade() -> None:
    # Data migration is intentionally not reversible.
    pass
