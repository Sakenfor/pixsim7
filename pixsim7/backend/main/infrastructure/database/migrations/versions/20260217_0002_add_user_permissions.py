"""Add users.permissions for scoped auth grants.

Revision ID: 20260217_0002
Revises: 20260217_0001
Create Date: 2026-02-17
"""

from __future__ import annotations

from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "20260217_0002"
down_revision = "20260217_0001"
branch_labels = None
depends_on = None

CODEGEN_PERMISSION = "devtools.codegen"


def _normalize_permissions(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, str):
            continue
        permission = raw.strip().lower()
        if not permission or permission in seen:
            continue
        seen.add(permission)
        normalized.append(permission)
    return normalized


def upgrade() -> None:
    op.add_column("users", sa.Column("permissions", sa.JSON(), nullable=True))

    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("role", sa.String),
        sa.column("permissions", sa.JSON()),
    )

    rows = bind.execute(sa.select(users.c.id, users.c.role, users.c.permissions)).mappings().all()
    updates: list[dict[str, Any]] = []

    for row in rows:
        permissions = _normalize_permissions(row["permissions"])
        if str(row["role"]).lower() == "admin" and CODEGEN_PERMISSION not in permissions:
            permissions.append(CODEGEN_PERMISSION)

        if permissions != row["permissions"]:
            updates.append({"user_id": row["id"], "permissions": permissions})

    if updates:
        stmt = (
            sa.update(users)
            .where(users.c.id == sa.bindparam("user_id"))
            .values(permissions=sa.bindparam("permissions"))
        )
        bind.execute(stmt, updates)


def downgrade() -> None:
    op.drop_column("users", "permissions")
