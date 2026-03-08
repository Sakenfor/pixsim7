"""Add canonical owner_user_id to block_templates.

Revision ID: 20260308_0001
Revises: 20260303_0003
Create Date: 2026-03-08
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from alembic import op
import sqlalchemy as sa


revision = "20260308_0001"
down_revision = "20260303_0003"
branch_labels = None
depends_on = None


_USER_REF_RE = re.compile(r"^\s*user:(\d+)\s*$", re.IGNORECASE)


def _coerce_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def _extract_user_id(value: Any) -> Optional[int]:
    direct = _coerce_int(value)
    if direct is not None:
        return direct

    if isinstance(value, str):
        match = _USER_REF_RE.match(value)
        if match:
            return int(match.group(1))

    if isinstance(value, dict):
        ref_type = str(value.get("type") or "").strip().lower()
        if ref_type == "user":
            return _coerce_int(value.get("id"))

    return None


def _parse_metadata(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def _owner_id_from_metadata(value: Any) -> Optional[int]:
    metadata = _parse_metadata(value)
    owner = metadata.get("owner") if isinstance(metadata.get("owner"), dict) else {}
    if not isinstance(owner, dict):
        owner = {}

    for candidate in (
        owner.get("user_id"),
        owner.get("entity_ref"),
        owner.get("ref"),
        metadata.get("owner_user_id"),
    ):
        owner_id = _extract_user_id(candidate)
        if owner_id is not None:
            return owner_id

    return None


def _backfill_owner_user_id() -> None:
    bind = op.get_bind()

    user_rows = bind.execute(sa.text("SELECT id, username FROM users")).mappings().all()
    username_to_id: Dict[str, int] = {}
    for row in user_rows:
        raw_username = row.get("username")
        raw_user_id = row.get("id")
        if not isinstance(raw_username, str):
            continue
        user_id = _coerce_int(raw_user_id)
        username = raw_username.strip()
        if user_id is None or not username:
            continue
        username_to_id[username] = user_id

    template_rows = bind.execute(
        sa.text(
            "SELECT id, owner_user_id, created_by, template_metadata "
            "FROM block_templates "
            "WHERE owner_user_id IS NULL"
        )
    ).mappings().all()

    for row in template_rows:
        owner_id = _owner_id_from_metadata(row.get("template_metadata"))
        if owner_id is None:
            created_by = row.get("created_by")
            if isinstance(created_by, str):
                owner_id = username_to_id.get(created_by.strip())

        if owner_id is None:
            continue

        bind.execute(
            sa.text(
                "UPDATE block_templates "
                "SET owner_user_id = :owner_user_id "
                "WHERE id = :template_id"
            ),
            {
                "owner_user_id": owner_id,
                "template_id": row.get("id"),
            },
        )


def upgrade() -> None:
    op.add_column(
        "block_templates",
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_block_templates_owner_user_id_users",
        "block_templates",
        "users",
        ["owner_user_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_block_templates_owner_user_id"),
        "block_templates",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        "idx_block_template_owner_public",
        "block_templates",
        ["owner_user_id", "is_public"],
        unique=False,
    )
    _backfill_owner_user_id()


def downgrade() -> None:
    op.drop_index("idx_block_template_owner_public", table_name="block_templates")
    op.drop_index(op.f("ix_block_templates_owner_user_id"), table_name="block_templates")
    op.drop_constraint("fk_block_templates_owner_user_id_users", "block_templates", type_="foreignkey")
    op.drop_column("block_templates", "owner_user_id")
