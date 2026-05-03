"""Automation DB baseline — create the 7 automation tables.

Revision ID: 20260427_0001
Revises: None
Create Date: 2026-04-27

Plan: automation-package-extraction Phase 2c.

Schema mirrors the live state in main DB at the time of writing. Differences:
  - No FK to provider_accounts.id or users.id (cross-DB refs stay as plain
    int columns, same pattern as BlockPrimitive.owner_id).
  - Intra-automation FKs preserved (presets, loops, devices, executions,
    agents, history all reference each other).

Enum types use uppercase member names (matches the live DB). Created with
checkfirst=True so the migration is safe to apply against a DB that already
has these types from the main chain (dev fallback when AUTOMATION_DATABASE_URL
is unset).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260427_0001"
down_revision = None
branch_labels = None
depends_on = None


_ENUMS = [
    ("devicetype", ("BLUESTACKS", "MUMU", "NOX", "LDPLAYER", "GENYMOTION", "ADB")),
    ("devicestatus", ("ONLINE", "OFFLINE", "BUSY", "ERROR")),
    ("automationstatus", ("PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED")),
    ("presetexecutionmode", ("SINGLE", "SHARED_LIST", "PER_ACCOUNT")),
    ("loopselectionmode", ("MOST_CREDITS", "LEAST_CREDITS", "ROUND_ROBIN", "SPECIFIC_ACCOUNTS")),
    ("loopstatus", ("ACTIVE", "PAUSED", "STOPPED", "ERROR")),
]


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in _ENUMS:
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    # ── device_agents (no FKs — referenced by android_devices) ──
    op.create_table(
        "device_agents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("host", sa.String(100), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("api_port", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("last_heartbeat", sa.DateTime(), nullable=True),
        sa.Column("version", sa.String(20), nullable=True),
        sa.Column("os_info", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_device_agents_id", "device_agents", ["id"])
    op.create_index("ix_device_agents_user_id", "device_agents", ["user_id"])
    op.create_index("ix_device_agents_status", "device_agents", ["status"])
    op.create_index("ix_device_agents_agent_id", "device_agents", ["agent_id"], unique=True)

    # ── android_devices (FK -> device_agents, self-FK) ──
    op.create_table(
        "android_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "device_type",
            sa.Enum(*_ENUMS[0][1], name="devicetype", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "connection_method",
            sa.String(20),
            nullable=False,
            server_default="adb",
        ),
        sa.Column("adb_id", sa.String(100), nullable=False),
        sa.Column("device_serial", sa.String(100), nullable=True),
        sa.Column("primary_device_id", sa.Integer(), nullable=True),
        sa.Column("agent_id", sa.Integer(), nullable=True),
        sa.Column("instance_name", sa.String(100), nullable=True),
        sa.Column("instance_port", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*_ENUMS[1][1], name="devicestatus", create_type=False),
            nullable=False,
        ),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        # Cross-DB ref (provider_accounts.id) — plain int, no FK constraint.
        sa.Column("assigned_account_id", sa.Integer(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("current_activity", sa.String(255), nullable=True),
        sa.Column(
            "is_watching_ad",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("ad_session_started_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["primary_device_id"], ["android_devices.id"]),
        sa.ForeignKeyConstraint(["agent_id"], ["device_agents.id"]),
    )
    op.create_index("ix_android_devices_id", "android_devices", ["id"])
    op.create_index("ix_android_devices_status", "android_devices", ["status"])
    op.create_index("ix_android_devices_agent_id", "android_devices", ["agent_id"])
    op.create_index("ix_android_devices_primary_device_id", "android_devices", ["primary_device_id"])
    op.create_index("ix_android_devices_adb_id", "android_devices", ["adb_id"])
    op.create_index("ix_android_devices_device_serial", "android_devices", ["device_serial"])
    op.create_index("ix_android_devices_assigned_account_id", "android_devices", ["assigned_account_id"])

    # ── app_action_presets (self-FK on cloned_from_id) ──
    op.create_table(
        "app_action_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # Cross-DB ref (users.id) — plain int.
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("cloned_from_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("actions", sa.JSON(), nullable=True),
        sa.Column("app_package", sa.String(200), nullable=False),
        sa.Column("requires_password", sa.Boolean(), nullable=False),
        sa.Column("requires_google_account", sa.Boolean(), nullable=False),
        sa.Column("max_retries", sa.Integer(), nullable=False),
        sa.Column("retry_delay_seconds", sa.Integer(), nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False),
        sa.Column("continue_on_error", sa.Boolean(), nullable=False),
        sa.Column("usage_count", sa.Integer(), nullable=False),
        sa.Column("last_used", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["cloned_from_id"], ["app_action_presets.id"]),
    )
    op.create_index("ix_app_action_presets_id", "app_action_presets", ["id"])
    op.create_index("ix_app_action_presets_category", "app_action_presets", ["category"])
    op.create_index("ix_app_action_presets_is_system", "app_action_presets", ["is_system"])
    op.create_index("ix_app_action_presets_owner_id", "app_action_presets", ["owner_id"])
    op.create_index("ix_app_action_presets_is_shared", "app_action_presets", ["is_shared"])

    # ── execution_loops (FKs -> presets, devices) ──
    op.create_table(
        "execution_loops",
        sa.Column("id", sa.Integer(), primary_key=True),
        # Cross-DB ref (users.id) — plain int.
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("preset_id", sa.Integer(), nullable=True),
        sa.Column(
            "preset_execution_mode",
            sa.Enum(*_ENUMS[3][1], name="presetexecutionmode", create_type=False),
            nullable=False,
        ),
        sa.Column("shared_preset_ids", sa.JSON(), nullable=True),
        sa.Column("current_preset_index", sa.Integer(), nullable=False),
        # Cross-DB ref (provider_accounts.id) — plain int.
        sa.Column("current_account_id", sa.Integer(), nullable=True),
        sa.Column("account_preset_config", sa.JSON(), nullable=True),
        sa.Column("default_preset_ids", sa.JSON(), nullable=True),
        sa.Column("account_execution_state", sa.JSON(), nullable=True),
        sa.Column(
            "selection_mode",
            sa.Enum(*_ENUMS[4][1], name="loopselectionmode", create_type=False),
            nullable=False,
        ),
        sa.Column("account_ids", sa.JSON(), nullable=True),
        sa.Column("min_credits", sa.Integer(), nullable=False),
        sa.Column("max_credits", sa.Integer(), nullable=True),
        sa.Column("require_online_device", sa.Boolean(), nullable=False),
        sa.Column("skip_accounts_already_ran_today", sa.Boolean(), nullable=False),
        sa.Column("skip_google_jwt_accounts", sa.Boolean(), nullable=False),
        sa.Column("delay_between_executions", sa.Integer(), nullable=False),
        sa.Column("max_executions_per_day", sa.Integer(), nullable=True),
        sa.Column("preferred_device_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*_ENUMS[5][1], name="loopstatus", create_type=False),
            nullable=False,
        ),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("total_executions", sa.Integer(), nullable=False),
        sa.Column("successful_executions", sa.Integer(), nullable=False),
        sa.Column("failed_executions", sa.Integer(), nullable=False),
        sa.Column("last_execution_at", sa.DateTime(), nullable=True),
        # Cross-DB ref (provider_accounts.id) — plain int.
        sa.Column("last_account_id", sa.Integer(), nullable=True),
        sa.Column("executions_today", sa.Integer(), nullable=False),
        sa.Column("last_reset_date", sa.DateTime(), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False),
        sa.Column("max_consecutive_failures", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("stopped_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["preset_id"], ["app_action_presets.id"]),
        sa.ForeignKeyConstraint(["preferred_device_id"], ["android_devices.id"]),
    )
    op.create_index("ix_execution_loops_user_id", "execution_loops", ["user_id"])

    # ── automation_executions (FKs -> presets, devices, loops) ──
    op.create_table(
        "automation_executions",
        sa.Column("id", sa.Integer(), primary_key=True),
        # Cross-DB ref (users.id) — plain int.
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("preset_id", sa.Integer(), nullable=True),
        # Cross-DB ref (provider_accounts.id) — plain int.
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*_ENUMS[2][1], name="automationstatus", create_type=False),
            nullable=False,
        ),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("current_action_index", sa.Integer(), nullable=False),
        sa.Column("total_actions", sa.Integer(), nullable=False),
        sa.Column("screenshot_path", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_action_index", sa.Integer(), nullable=True),
        sa.Column("error_details", sa.JSON(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("max_retries", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.Column("execution_context", sa.JSON(), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("loop_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["preset_id"], ["app_action_presets.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["android_devices.id"]),
        sa.ForeignKeyConstraint(["loop_id"], ["execution_loops.id"]),
    )
    op.create_index("ix_automation_executions_id", "automation_executions", ["id"])
    op.create_index("ix_automation_executions_user_id", "automation_executions", ["user_id"])
    op.create_index("ix_automation_executions_account_id", "automation_executions", ["account_id"])
    op.create_index("ix_automation_executions_preset_id", "automation_executions", ["preset_id"])
    op.create_index("ix_automation_executions_device_id", "automation_executions", ["device_id"])
    op.create_index("ix_automation_executions_status", "automation_executions", ["status"])
    op.create_index("ix_automation_executions_task_id", "automation_executions", ["task_id"])

    # ── execution_loop_history (FKs -> loops, devices, executions, presets) ──
    op.create_table(
        "execution_loop_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("loop_id", sa.Integer(), nullable=False),
        # Cross-DB ref (users.id) — plain int.
        sa.Column("user_id", sa.Integer(), nullable=False),
        # Cross-DB ref (provider_accounts.id) — plain int.
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("execution_id", sa.Integer(), nullable=True),
        sa.Column("preset_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("account_email", sa.String(255), nullable=True),
        sa.Column("account_credits_before", sa.Integer(), nullable=True),
        sa.Column("account_credits_after", sa.Integer(), nullable=True),
        sa.Column("preset_name", sa.String(255), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("selection_mode", sa.String(50), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("context_data", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["loop_id"], ["execution_loops.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["android_devices.id"]),
        sa.ForeignKeyConstraint(["execution_id"], ["automation_executions.id"]),
        sa.ForeignKeyConstraint(["preset_id"], ["app_action_presets.id"]),
    )
    op.create_index("ix_execution_loop_history_user_id", "execution_loop_history", ["user_id"])
    op.create_index("ix_execution_loop_history_loop_id", "execution_loop_history", ["loop_id"])
    op.create_index("ix_execution_loop_history_account_id", "execution_loop_history", ["account_id"])

    # ── pairing_requests (no FKs to other automation tables) ──
    op.create_table(
        "pairing_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_id", sa.String(100), nullable=False),
        sa.Column("pairing_code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("host", sa.String(100), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("api_port", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("os_info", sa.String(100), nullable=False),
        # Cross-DB ref (users.id) — plain int.
        sa.Column("paired_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_pairing_requests_id", "pairing_requests", ["id"])
    op.create_index("ix_pairing_requests_paired_user_id", "pairing_requests", ["paired_user_id"])
    op.create_index("ix_pairing_requests_agent_id", "pairing_requests", ["agent_id"], unique=True)
    op.create_index("ix_pairing_requests_pairing_code", "pairing_requests", ["pairing_code"], unique=True)


def downgrade() -> None:
    """Drop all 7 automation tables and their enum types."""
    op.drop_table("pairing_requests")
    op.drop_table("execution_loop_history")
    op.drop_table("automation_executions")
    op.drop_table("execution_loops")
    op.drop_table("app_action_presets")
    op.drop_table("android_devices")
    op.drop_table("device_agents")
    bind = op.get_bind()
    for name, _ in reversed(_ENUMS):
        sa.Enum(name=name).drop(bind, checkfirst=True)
