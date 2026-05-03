"""Drop cross-DB FK constraints from automation tables in main DB.

Plan: automation-package-extraction Phase 2c.

Automation tables now live (logically) in the automation DB and reference
users.id / provider_accounts.id as plain int columns — same pattern as
BlockPrimitive.owner_id. The model annotations were dropped first; this
migration brings the live main DB in line so SQLAlchemy autogen and the
runtime no longer disagree about FK presence.

Note: this only DROPs the FK constraints. The automation tables themselves
stay in main DB until the cutover script (tools/migrate_automation_tables.py)
moves them — that's a separate, opt-in step.

Constraints dropped (9):
    android_devices.assigned_account_id        -> provider_accounts.id
    app_action_presets.owner_id                -> users.id
    automation_executions.account_id           -> provider_accounts.id
    automation_executions.user_id              -> users.id
    device_agents.user_id                      -> users.id
    execution_loop_history.account_id          -> provider_accounts.id
    execution_loop_history.user_id             -> users.id
    execution_loops.user_id                    -> users.id
    pairing_requests.paired_user_id            -> users.id

Revision ID: 20260427_0003
Revises: 20260427_0001
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op


revision = "20260427_0003"
down_revision = "20260427_0001"
branch_labels = None
depends_on = None


# (table, constraint_name, column, referenced_table)
_DROPS = [
    ("android_devices", "fk_android_devices_assigned_account_id_provider_accounts",
     "assigned_account_id", "provider_accounts"),
    ("app_action_presets", "fk_app_action_presets_owner_id_users",
     "owner_id", "users"),
    ("automation_executions", "fk_automation_executions_account_id_provider_accounts",
     "account_id", "provider_accounts"),
    ("automation_executions", "fk_automation_executions_user_id_users",
     "user_id", "users"),
    ("device_agents", "fk_device_agents_user_id_users",
     "user_id", "users"),
    ("execution_loop_history", "fk_execution_loop_history_account_id_provider_accounts",
     "account_id", "provider_accounts"),
    ("execution_loop_history", "fk_execution_loop_history_user_id_users",
     "user_id", "users"),
    ("execution_loops", "fk_execution_loops_user_id_users",
     "user_id", "users"),
    # Note non-canonical name: pairing_requests was created by an early migration
    # that didn't follow the fk_<table>_<col>_<ref> convention.
    ("pairing_requests", "pairing_requests_paired_user_id_fkey",
     "paired_user_id", "users"),
]


def upgrade() -> None:
    for table, constraint, _col, _ref in _DROPS:
        op.drop_constraint(constraint, table, type_="foreignkey")


def downgrade() -> None:
    for table, constraint, col, ref in _DROPS:
        op.create_foreign_key(
            constraint,
            source_table=table,
            referent_table=ref,
            local_cols=[col],
            remote_cols=["id"],
        )
