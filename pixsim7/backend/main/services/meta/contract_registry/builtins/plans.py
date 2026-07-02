"""Built-in plans contract surfaces."""
from __future__ import annotations

from ..models import MetaContract, MetaContractEndpoint
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
)


def _builtin_plans_management() -> MetaContract:
    return MetaContract(
        id="plans.management",
        name="Plan Management",
        endpoint=None,
        version="2.5.1",
        auth_required=True,
        owner="devtools lane",
        summary=(
            "Plan registry backed by Document base entity. Create, browse, "
            "update plans with hierarchy (parent/children), checkpoints, "
            "companion docs, and AI agent work assignment."
        ),
        provides=[
            "plan_registry",
            "plan_creation",
            "plan_hierarchy",
            "plan_status_management",
            "plan_documents",
            "plan_activity",
            "plan_sync",
            "agent_assignment",
            "plan_authoring_policy",
        ],
        relates_to=["devtools.codegen", "ui.catalog"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="plans.agent_context",
                method="GET",
                path="/api/v1/dev/plans/agent-context",
                summary=(
                    "Start here. Full work package for AI agent: current assignment, "
                    "all active plans, and available API actions with request schemas."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "plan_id": {
                                    "type": "string",
                                    "description": "Optional specific plan to fetch instead of auto-assignment.",
                                },
                            },
                        },
                    },
                },
                tags=["agent", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.create",
                method="POST",
                path="/api/v1/dev/plans",
                summary="Create a new plan (Document + PlanRegistry). Supports parent_id for sub-plans.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["id", "title"],
                            "properties": {
                                "id": {"type": "string"},
                                "title": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "status": {"type": "string"},
                                "stage": {"type": "string"},
                                "owner": {"type": "string"},
                                "priority": {"type": "string"},
                                "summary": {"type": "string"},
                                "markdown": {"type": "string"},
                                "task_scope": {"type": "string"},
                                "visibility": {"type": "string"},
                                "target": {"type": "object"},
                                "checkpoints": {"type": "array", "items": {"type": "object"}},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "code_paths": {"type": "array", "items": {"type": "string"}},
                                "companions": {"type": "array", "items": {"type": "string"}},
                                "handoffs": {"type": "array", "items": {"type": "string"}},
                                "depends_on": {"type": "array", "items": {"type": "string"}},
                                "parent_id": {"type": "string"},
                            },
                        },
                    },
                    "required": ["body"],
                    "x-policy-ref": PLAN_AUTHORING_CONTRACT_ENDPOINT,
                },
                tags=["create", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.meta_authoring_contract",
                method="GET",
                path=PLAN_AUTHORING_CONTRACT_ENDPOINT,
                summary=(
                    "Canonical plan authoring rules (required/suggested fields) "
                    "by principal type."
                ),
                tags=["agent", "planning", "policy"],
            ),
            MetaContractEndpoint(
                id="plans.list",
                method="GET",
                path="/api/v1/dev/plans",
                summary="List all plans with filters, text search, and optional compact payload mode.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "q": {"type": "string"},
                                "status": {"type": "string"},
                                "owner": {"type": "string"},
                                "namespace": {"type": "string"},
                                "priority": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "tag": {"type": "string"},
                                "compact": {"type": "boolean"},
                                "include_hidden": {"type": "boolean"},
                                "limit": {"type": "integer"},
                                "offset": {"type": "integer"},
                                "refresh": {"type": "boolean"},
                            },
                        },
                    },
                },
                tags=["list", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.detail",
                method="GET",
                path="/api/v1/dev/plans/{plan_id}",
                summary=(
                    "Get plan with full metadata, markdown, checkpoints, "
                    "and children. Supports `params.include_markdown=false` "
                    "to drop the long-form doc body and `params.fields=<csv>` "
                    "for an explicit top-level field whitelist (snake or "
                    "camelCase; unknown names → 400; `id` always included). "
                    "Use these to trim responses below the MCP ~30k "
                    "truncation limit when only a few fields are needed."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "params": {
                            "type": "object",
                            "properties": {
                                "include_markdown": {"type": "boolean"},
                                "fields": {
                                    "type": "string",
                                    "description": (
                                        "Comma-separated field whitelist "
                                        "(e.g. 'id,title,openSummary,"
                                        "checkpoints'). Ignored field "
                                        "params if not set."
                                    ),
                                },
                            },
                        },
                    },
                },
                tags=["read", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.checkpoint_detail",
                method="GET",
                path="/api/v1/dev/plans/{plan_id}/checkpoints/{checkpoint_id}",
                summary=(
                    "Get a single checkpoint by id without pulling the full "
                    "plan. Use when ``plans.detail`` payloads exceed tool-"
                    "output truncation limits (~30k chars) and the tail of "
                    "``checkpoints[]`` gets chopped. Discover checkpoint IDs "
                    "via ``open_summary.open_checkpoints`` on ``plans.list`` "
                    "/ ``plans.detail`` or via ``plans.todo_summary``."
                ),
                tags=["read", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.update",
                method="PATCH",
                path="/api/v1/dev/plans/{plan_id}",
                summary="Update plan fields with optional git commit traceability for audit trail.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "body": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "status": {"type": "string"},
                                "stage": {"type": "string"},
                                "task_scope": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "owner": {"type": "string"},
                                "priority": {"type": "string"},
                                "summary": {"type": "string"},
                                "markdown": {"type": "string"},
                                "visibility": {"type": "string"},
                                "target": {"type": "object"},
                                "checkpoints": {"type": "array", "items": {"type": "object"}},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "code_paths": {"type": "array", "items": {"type": "string"}},
                                "companions": {"type": "array", "items": {"type": "string"}},
                                "handoffs": {"type": "array", "items": {"type": "string"}},
                                "depends_on": {"type": "array", "items": {"type": "string"}},
                                "patch": {"type": "object"},
                                "commit_sha": {
                                    "type": "string",
                                    "description": "Git commit SHA to record on the audit event.",
                                },
                                "auto_head": {
                                    "type": "boolean",
                                    "description": "Resolve current HEAD as commit_sha if not provided.",
                                },
                                "verify_commits": {
                                    "type": "boolean",
                                    "description": "Verify commit SHA exists in the repo.",
                                },
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "planning", "git"],
            ),
            MetaContractEndpoint(
                id="plans.progress",
                method="POST",
                path="/api/v1/dev/plans/progress/{plan_id}",
                summary=(
                    "Log in-flight checkpoint progress with optional git commit traceability. "
                    "Supports point deltas, execution metadata, and commit SHA evidence. "
                    "Auto-routes by checkpoint shape: for a step-tracked checkpoint (steps[]), "
                    "points_done/points_delta are translated onto step toggles (first-N done) "
                    "and points are derived from steps — no need to pick between points and "
                    "mark_steps_done. Setting status='done' on an underwater checkpoint "
                    "auto-completes it; completing the points auto-promotes status to done."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "body": {
                            "type": "object",
                            "required": ["checkpoint_id"],
                            "properties": {
                                "checkpoint_id": {"type": "string"},
                                "points_delta": {
                                    "type": "integer",
                                    "description": "Relative points change. On a stepped checkpoint, routed onto step toggles.",
                                },
                                "points_done": {
                                    "type": "integer",
                                    "description": "Absolute points done. On a stepped checkpoint, marks the first N steps done.",
                                },
                                "points_total": {
                                    "type": "integer",
                                    "description": "Points budget. Rejected on a stepped checkpoint unless it equals the step count (the total is fixed by steps[]).",
                                },
                                "mark_steps_done": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Step ids or labels to mark done (targeted path for stepped checkpoints).",
                                },
                                "mark_steps_undone": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Step ids or labels to mark not-done.",
                                },
                                "status": {"type": "string", "enum": ["pending", "active", "done", "blocked"]},
                                "owner": {"type": "string"},
                                "eta": {"type": "string"},
                                "blockers": {"type": "array", "items": {"type": "object"}},
                                "append_evidence": {"type": "array", "items": {"type": "string"}},
                                "append_tests": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Checkpoint-linked test suite IDs (alias for test_suite evidence).",
                                },
                                "note": {"type": "string"},
                                "sync_plan_stage": {"type": "boolean"},
                                "commit_sha": {
                                    "type": "string",
                                    "description": "Git commit SHA to record as evidence (7-40 hex chars).",
                                },
                                "append_commits": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Additional commit SHAs to append as evidence.",
                                },
                                "commit_range": {
                                    "type": "string",
                                    "description": "Git range (e.g. 'abc123..def456') — auto-expanded via rev-list.",
                                },
                                "auto_head": {
                                    "type": "boolean",
                                    "description": "Resolve current HEAD as commit_sha if not provided.",
                                },
                                "verify_commits": {
                                    "type": "boolean",
                                    "description": "Verify commit SHAs exist in the repo (default true).",
                                },
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "progress", "planning", "git"],
            ),
            MetaContractEndpoint(
                id="plans.documents",
                method="GET",
                path="/api/v1/dev/plans/documents/{plan_id}",
                summary="Companion and handoff documents for a plan.",
                tags=["read", "docs", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.work_log",
                method="GET",
                path="/api/v1/dev/plans/work-log/{plan_id}",
                summary=(
                    "List a plan's work_summary entries (from log_work), newest "
                    "first. Each entry hydrates summary/decisions/next/blockers/"
                    "evidence plus session_id/run_id/agent_type/timestamp out of "
                    "the activity log, so a fresh session can resume a plan cold "
                    "from the prior session's handoff notes. Paginated via "
                    "limit/offset."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "limit": {
                                    "type": "integer",
                                    "description": "Max entries to return (1-500, default 50).",
                                },
                                "offset": {
                                    "type": "integer",
                                    "description": "Entries to skip for pagination (default 0).",
                                },
                            },
                        },
                    },
                    "required": ["plan_id"],
                },
                tags=["read", "agent", "planning", "observability"],
            ),
            MetaContractEndpoint(
                id="plans.activity",
                method="GET",
                path="/api/v1/dev/plans/activity",
                summary=(
                    "Recent change activity across all plans (default 7-day "
                    "lookback). For ``field == 'checkpoints'`` events the giant "
                    "old/new JSON blobs are replaced with a compact "
                    "``checkpoint_delta`` (per-checkpoint diff) by default; "
                    "pass ``include_raw_diffs=true`` to keep the raw strings."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "days": {"type": "integer"},
                                "limit": {"type": "integer"},
                                "include_raw_diffs": {"type": "boolean"},
                            },
                        },
                    },
                },
                tags=["activity", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.todo_summary",
                method="GET",
                path="/api/v1/dev/plans/todo-summary",
                summary=(
                    "Per-plan open-work view. For each plan with at least one "
                    "checkpoint where ``points_done < points_total``, returns "
                    "the open checkpoints, point totals, a precise "
                    "``last_touched_at`` (max of plan.updated_at and any "
                    "checkpoint.last_update.at), and a truncated recent note. "
                    "Sorted by last_touched_at desc. Use this — not "
                    "``plans.list`` — when answering 'which plans should I "
                    "continue?'; it skips plans whose checkpoints are all "
                    "complete and produces ~10× smaller payloads."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "stage": {"type": "string"},
                                "tag": {"type": "string"},
                                "owner": {"type": "string"},
                                "status": {
                                    "type": "string",
                                    "description": "Plan status filter. Default 'active'; pass empty string to include all.",
                                },
                                "min_open_points": {"type": "integer"},
                                "since_days": {"type": "integer"},
                                "limit": {"type": "integer"},
                                "max_open_checkpoints": {"type": "integer"},
                                "include_hidden": {"type": "boolean"},
                            },
                        },
                    },
                },
                tags=["agent", "planning", "todo"],
            ),
            MetaContractEndpoint(
                id="plans.settings_get",
                method="GET",
                path="/api/v1/dev/plans/settings",
                summary=(
                    "Read runtime plan mode flags (DB-only mode) and effective "
                    "participant-liveness TTLs (stale + idle-release minutes)."
                ),
                tags=["settings", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.settings_update",
                method="PATCH",
                path="/api/v1/dev/plans/settings",
                summary="Toggle runtime plan mode flags + participant-liveness TTLs (admin, applies to current backend process).",
                requires_admin=True,
                permissions=["admin"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["plans_db_only_mode"],
                            "properties": {
                                "plans_db_only_mode": {"type": "boolean"},
                                # Optional GLOBAL/system TTL overrides (not per-user):
                                # omit to leave unchanged, send null to reset to
                                # env/default. Positive minutes.
                                "participant_stale_minutes": {
                                    "type": ["number", "null"],
                                    "exclusiveMinimum": 0,
                                },
                                "claim_idle_release_minutes": {
                                    "type": ["number", "null"],
                                    "exclusiveMinimum": 0,
                                },
                            },
                        },
                    },
                    "required": ["body"],
                },
                tags=["settings", "admin", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.sync",
                method="POST",
                path="/api/v1/dev/plans/sync",
                summary="Sync filesystem plan manifests into the DB (disabled when PLANS_DB_ONLY_MODE=1).",
                requires_admin=True,
                permissions=["admin"],
                availability={
                    "status": "conditional",
                    "reason": "Only available when DB-only mode is disabled.",
                    "conditions": ["settings.plans_db_only_mode == false"],
                },
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "commit_sha": {"type": "string"},
                            },
                        },
                    },
                },
                tags=["sync", "admin", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.export",
                method="POST",
                path="/api/v1/dev/plans/{plan_id}/export",
                summary=(
                    "One-shot FS snapshot of a single plan to docs/plans/<scope>/<id>/. "
                    "Works regardless of the 'fs-export' tag; killswitch returns 409."
                ),
                requires_admin=True,
                permissions=["admin"],
                availability={
                    "status": "conditional",
                    "reason": "Only available when DB-only mode is disabled.",
                    "conditions": ["settings.plans_db_only_mode == false"],
                },
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "commit": {
                                    "type": "boolean",
                                    "description": "Stage and commit written files (default true).",
                                },
                                "scope_override": {
                                    "type": "string",
                                    "enum": ["active", "done", "parked"],
                                    "description": "Override the destination scope dir; default derives from plan status.",
                                },
                            },
                        },
                    },
                },
                tags=["export", "admin", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.export_batch",
                method="POST",
                path="/api/v1/dev/plans/export",
                summary=(
                    "Batch FS export. Single git commit per batch. Exactly one selector: "
                    "ids, all_tagged, or changed_since."
                ),
                requires_admin=True,
                permissions=["admin"],
                availability={
                    "status": "conditional",
                    "reason": "Only available when DB-only mode is disabled.",
                    "conditions": ["settings.plans_db_only_mode == false"],
                },
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "ids": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Explicit plan IDs to export.",
                                },
                                "all_tagged": {
                                    "type": "boolean",
                                    "description": "Export all plans tagged 'fs-export'.",
                                },
                                "changed_since": {
                                    "type": "string",
                                    "format": "date-time",
                                    "description": "Export all tagged plans changed at/after this ISO timestamp.",
                                },
                            },
                        },
                    },
                },
                tags=["export", "admin", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.claim",
                method="POST",
                path="/api/v1/dev/plans/{plan_id}/claim",
                summary=(
                    "Explicitly claim a (plan, checkpoint) for the calling agent. "
                    "Soft: an existing live claimant is returned in 'conflicts' "
                    "rather than rejected. Advances the participant heartbeat. "
                    "Auto-released when the agent run ends. Omit checkpoint_id for "
                    "a plan-level claim."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "checkpoint_id": {
                                    "type": "string",
                                    "description": "Checkpoint to claim. Omit for a plan-level claim.",
                                },
                            },
                        },
                    },
                },
                tags=["agent", "planning", "claim"],
            ),
            MetaContractEndpoint(
                id="plans.release",
                method="POST",
                path="/api/v1/dev/plans/{plan_id}/release",
                summary=(
                    "Release the caller's open claim(s) on a plan (or one "
                    "checkpoint if checkpoint_id is given)."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "checkpoint_id": {
                                    "type": "string",
                                    "description": "Checkpoint to release. Omit to release all of the caller's claims on the plan.",
                                },
                            },
                        },
                    },
                },
                tags=["agent", "planning", "claim"],
            ),
            MetaContractEndpoint(
                id="plans.active_agents",
                method="GET",
                path="/api/v1/dev/plans/active-agents",
                summary=(
                    "Cross-plan roster of agents currently active (non-stale, "
                    "owning run not terminal), grouped by plan. The at-a-glance "
                    "'who is working on what right now' overview."
                ),
                tags=["agent", "planning", "observability"],
            ),
            MetaContractEndpoint(
                id="plans.participants",
                method="GET",
                path="/api/v1/dev/plans/{plan_id}/participants",
                summary=(
                    "Attributed participants for one plan (builders + reviewers) "
                    "with agent/run/session context and liveness. The per-plan "
                    "companion to plans.active_agents (the cross-plan roster)."
                ),
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": ["plan_id"],
                },
                tags=["read", "agent", "planning", "observability"],
            ),
            MetaContractEndpoint(
                id="plans.revisions",
                method="GET",
                path="/api/v1/dev/plans/revisions/{plan_id}",
                summary="List immutable revision-history snapshots for a plan, newest first.",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": ["plan_id"],
                },
                tags=["read", "planning", "history"],
            ),
            MetaContractEndpoint(
                id="plans.restore_revision",
                method="POST",
                path="/api/v1/dev/plans/restore/{plan_id}/{revision}",
                summary="Restore a plan's HEAD fields from an immutable revision snapshot.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "auto_head": {"type": "boolean"},
                                "commit_sha": {"type": "string"},
                                "verify_commits": {"type": "boolean"},
                            },
                        },
                    },
                    "required": ["plan_id", "revision"],
                },
                tags=["update", "planning", "history"],
            ),
            MetaContractEndpoint(
                id="plans.stages",
                method="GET",
                path="/api/v1/dev/plans/stages",
                summary="List canonical plan stages for UI/agent validation of the stage field.",
                tags=["read", "planning", "policy"],
            ),
            MetaContractEndpoint(
                id="plans.archive",
                method="POST",
                path="/api/v1/dev/plans/archive/{plan_id}",
                summary=(
                    "Archive a plan (hidden from listings, recoverable via "
                    "unarchive). Admin only."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {"auto_head": {"type": "boolean"}},
                        },
                    },
                    "required": ["plan_id"],
                },
                tags=["update", "planning", "admin"],
            ),
            MetaContractEndpoint(
                id="plans.unarchive",
                method="POST",
                path="/api/v1/dev/plans/unarchive/{plan_id}",
                summary="Unarchive a plan back to active or parked status. Admin only.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "restore_status": {"type": "string"},
                                "auto_head": {"type": "boolean"},
                            },
                        },
                    },
                    "required": ["plan_id"],
                },
                tags=["update", "planning", "admin"],
            ),
            MetaContractEndpoint(
                id="plans.delete",
                method="DELETE",
                path="/api/v1/dev/plans/{plan_id}",
                summary=(
                    "Soft-delete (status=removed) or hard-delete (?hard=true) a "
                    "plan. Soft is recoverable. Admin only."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {"hard": {"type": "boolean"}},
                        },
                    },
                    "required": ["plan_id"],
                },
                tags=["delete", "planning", "admin"],
            ),
        ],
    )
