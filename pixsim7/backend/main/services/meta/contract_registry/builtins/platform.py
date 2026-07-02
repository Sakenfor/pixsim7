"""Built-in platform contract surfaces."""
from __future__ import annotations

from ..models import MetaContract, MetaContractEndpoint


def _builtin_notifications() -> MetaContract:
    return MetaContract(
        id="notifications",
        name="Notifications",
        endpoint=None,
        version="2.0.0",
        auth_required=True,
        owner="platform",
        summary=(
            "Structured notification contract — all writes require event_type. "
            "Dynamic read-time rendering and category granularity preferences. "
            "POST /notifications/emit is the primary write path."
        ),
        provides=[
            "notification_list",
            "notification_structured_emit",
            "notification_structured_write_policy",
            "notification_event_types",
            "notification_read_status",
            "notification_categories",
        ],
        relates_to=["plans.management", "user.assistant"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="notifications.categories",
                method="GET",
                path="/api/v1/notifications/categories",
                summary="List all notification categories with defaults and user's current granularity selections.",
            ),
            MetaContractEndpoint(
                id="notifications.list",
                method="GET",
                path="/api/v1/notifications",
                summary="List notifications for current user (broadcasts + targeted). Supports category filter, unread_only, and include_suppressed.",
            ),
            MetaContractEndpoint(
                id="notifications.create",
                method="POST",
                path="/api/v1/notifications",
                summary="Deprecated — use notifications.emit. Stamps event_type='notification.manual' automatically.",
                tags=["write", "legacy", "deprecated"],
            ),
            MetaContractEndpoint(
                id="notifications.emit",
                method="POST",
                path="/api/v1/notifications/emit",
                summary=(
                    "Structured emit endpoint for agents/integrations. "
                    "Requires event_type + payload; known events are validated."
                ),
                input_schema={
                    "type": "object",
                    "required": ["body"],
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["event_type"],
                            "properties": {
                                "event_type": {
                                    "type": "string",
                                    "description": "Event identifier (e.g. plan.created, plan.updated).",
                                },
                                "category": {"type": "string"},
                                "severity": {"type": "string"},
                                "source": {"type": "string"},
                                "ref_type": {"type": "string"},
                                "ref_id": {"type": "string"},
                                "broadcast": {"type": "boolean"},
                                "user_id": {"type": "integer"},
                                "actor_name": {"type": "string"},
                                "actor_user_id": {"type": "integer"},
                                "title": {
                                    "type": "string",
                                    "description": "Required only for custom event types.",
                                },
                                "body": {"type": "string"},
                                "payload": {
                                    "type": "object",
                                    "description": (
                                        "Structured event payload. Built-in plan events expect "
                                        "payload.planTitle (plan.created) and payload.changes "
                                        "(plan.updated)."
                                    ),
                                },
                            },
                        }
                    },
                },
                tags=["write", "structured", "agent"],
            ),
            MetaContractEndpoint(
                id="notifications.mark_read",
                method="PATCH",
                path="/api/v1/notifications/{notification_id}/read",
                summary="Mark a single notification as read.",
            ),
            MetaContractEndpoint(
                id="notifications.mark_all_read",
                method="POST",
                path="/api/v1/notifications/mark-all-read",
                summary="Mark all notifications as read for the current user.",
            ),
        ],
    )


def _builtin_chat_tabs() -> MetaContract:
    return MetaContract(
        id="chat_tabs",
        name="Chat Tabs",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="platform",
        summary=(
            "Server-persisted AI Assistant chat tabs. Each tab is a UI surface "
            "pointing at a ChatSession; closing a tab keeps the session "
            "(re-openable from the closed-tab picker). Stable tab id is the "
            "ref_id for chat-tab unread notifications (notification-system Phase 4a)."
        ),
        provides=[
            "chat_tab_list",
            "chat_tab_crud",
            "chat_tab_reorder",
        ],
        relates_to=["user.assistant", "notifications"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="chat_tabs.list",
                method="GET",
                path="/api/v1/chat-tabs",
                summary="List the caller's open chat tabs, ordered by order_index.",
            ),
            MetaContractEndpoint(
                id="chat_tabs.create",
                method="POST",
                path="/api/v1/chat-tabs",
                summary=(
                    "Create a chat tab. If session_id is omitted, a fresh "
                    "ChatSession is auto-created and bound to the new tab."
                ),
                tags=["write"],
            ),
            MetaContractEndpoint(
                id="chat_tabs.update",
                method="PATCH",
                path="/api/v1/chat-tabs/{tab_id}",
                summary=(
                    "Partial update — only fields present in the body are written. "
                    "Pass null for plan_id / scope_key / draft to clear them."
                ),
                tags=["write"],
            ),
            MetaContractEndpoint(
                id="chat_tabs.delete",
                method="DELETE",
                path="/api/v1/chat-tabs/{tab_id}",
                summary=(
                    "Close a tab. Deletes the ChatTab row; the underlying "
                    "ChatSession is preserved for later reopening."
                ),
                tags=["write"],
            ),
            MetaContractEndpoint(
                id="chat_tabs.reorder",
                method="POST",
                path="/api/v1/chat-tabs/reorder",
                summary=(
                    "Bulk reorder tabs. Body: {tabs: [{id, order_index}, ...]}. "
                    "All ids must belong to the caller; partial writes are rejected."
                ),
                tags=["write"],
            ),
        ],
    )


def _builtin_devtools_codegen() -> MetaContract:
    return MetaContract(
        id="devtools.codegen",
        name="Developer Tasks & Codegen",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="devtools lane",
        audience=["dev"],
        summary=(
            "Code generation tasks, database migrations, and developer utilities. "
            "Tasks discovered from tools/codegen/manifest.ts."
        ),
        provides=[
            "codegen_tasks",
            "migration_management",
            "test_runner",
        ],
        relates_to=["plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="codegen.tasks",
                method="GET",
                path="/api/v1/devtools/codegen/tasks",
                summary="List available codegen tasks.",
            ),
            MetaContractEndpoint(
                id="codegen.run",
                method="POST",
                path="/api/v1/devtools/codegen/run",
                summary="Execute a codegen task.",
            ),
            MetaContractEndpoint(
                id="codegen.migrations_status",
                method="GET",
                path="/api/v1/devtools/codegen/migrations/status",
                summary="Database migration status across all scopes.",
            ),
        ],
    )


def _builtin_ui_catalog() -> MetaContract:
    return MetaContract(
        id="ui.catalog",
        name="UI Component Catalog",
        endpoint="/api/v1/meta/ui/contract",
        version="1.0.0",
        auth_required=False,
        owner="frontend lane",
        audience=["dev", "agent"],
        summary=(
            "Queryable catalog of UI components, composition patterns, and "
            "agent guidance. Backend-owned source of truth — agents query "
            "these endpoints instead of parsing the generated JSON file."
        ),
        provides=[
            "ui_components",
            "ui_patterns",
            "ui_guidance",
            "overlay_widget_api",
            "badge_system",
        ],
        relates_to=["devtools.codegen", "plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="ui.contract",
                method="GET",
                path="/api/v1/meta/ui/contract",
                summary="Catalog summary: counts, categories, version.",
                auth_required=False,
                tags=["discovery"],
            ),
            MetaContractEndpoint(
                id="ui.components",
                method="GET",
                path="/api/v1/meta/ui/components",
                summary="List/search UI components. Supports ?q= and ?category= filters.",
                auth_required=False,
                tags=["components"],
            ),
            MetaContractEndpoint(
                id="ui.component_detail",
                method="GET",
                path="/api/v1/meta/ui/components/{component_id}",
                summary="Single component with exports, examples, and use_instead_of.",
                auth_required=False,
                tags=["components"],
            ),
            MetaContractEndpoint(
                id="ui.patterns",
                method="GET",
                path="/api/v1/meta/ui/patterns",
                summary="Composition patterns (sidebar, overlay, filterable list). Supports ?topic= filter.",
                auth_required=False,
                tags=["patterns"],
            ),
            MetaContractEndpoint(
                id="ui.pattern_detail",
                method="GET",
                path="/api/v1/meta/ui/patterns/{pattern_id}",
                summary="Single pattern with step-by-step recipe.",
                auth_required=False,
                tags=["patterns"],
            ),
            MetaContractEndpoint(
                id="ui.guidance",
                method="GET",
                path="/api/v1/meta/ui/guidance",
                summary="Agent coding rules and pre-coding checklist.",
                auth_required=False,
                tags=["guidance"],
            ),
        ],
    )


def _builtin_user_assistant() -> MetaContract:
    return MetaContract(
        id="user.assistant",
        name="User AI Assistant",
        endpoint=None,
        version="1.2.0",
        auth_required=True,
        owner="user-experience lane",
        summary=(
            "User-facing AI assistant capabilities: asset management, "
            "generation, game authoring, and project help."
        ),
        # `provides` = capability tags (the chat UI's focus-area vocabulary);
        # `relates_to` = the contract ids those capabilities resolve to. The
        # two namespaces are intentionally distinct — "asset_management" the
        # capability is NOT "assets.management" the contract (a capability is
        # many-to-many over contracts). Don't rename one to match the other;
        # the MCP focus resolver matches `provides ∪ id` precisely so both
        # work. See mcp_server.resolve_enabled_tool_names_for_focus.
        provides=[
            "asset_management",
            "generation_assistance",
            "game_authoring",
            "prompt_authoring",
        ],
        relates_to=[
            "assets.management",
            "generation.assistance",
            "prompts.authoring",
            "blocks.discovery",
            "game.authoring",
        ],
        sub_endpoints=[],
    )


def _builtin_testing_catalog() -> MetaContract:
    return MetaContract(
        id="testing.catalog",
        name="Test Suite Catalog",
        endpoint="/api/v1/dev/testing/contract",
        version="1.0.0",
        auth_required=False,
        owner="platform",
        audience=["dev", "agent"],
        summary=(
            "Live test suite discovery, conventions, and coverage-gap detection. "
            "Suites self-register via TEST_SUITE dict literals (AST-extracted). "
            "Agents query guidance and coverage endpoints when creating tests."
        ),
        provides=[
            "test_suites",
            "test_guidance",
            "test_conventions",
            "coverage_gaps",
            "plan_evidence_linking",
        ],
        relates_to=["plans.management", "devtools.codegen", "ui.catalog"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="testing.contract",
                method="GET",
                path="/api/v1/dev/testing/contract",
                summary="Catalog summary: suite count, layers, kinds, categories.",
                auth_required=False,
                tags=["discovery"],
            ),
            MetaContractEndpoint(
                id="testing.catalog",
                method="GET",
                path="/api/v1/dev/testing/catalog",
                summary="List/filter test suites. Supports ?layer=, ?category=, ?kind= filters.",
                auth_required=False,
                tags=["suites"],
            ),
            MetaContractEndpoint(
                id="testing.validate",
                method="GET",
                path="/api/v1/dev/testing/catalog/validate",
                summary="Validate all suite metadata (paths exist, required fields).",
                auth_required=False,
                tags=["validation"],
            ),
            MetaContractEndpoint(
                id="testing.guidance",
                method="GET",
                path="/api/v1/dev/testing/guidance",
                summary="Conventions, TEST_SUITE template, and pre-creation checklist for agents.",
                auth_required=False,
                tags=["guidance"],
            ),
            MetaContractEndpoint(
                id="testing.coverage_gaps",
                method="GET",
                path="/api/v1/dev/testing/coverage-gaps",
                summary="Find source paths not covered by any test suite. Supports ?scope= prefix filter.",
                auth_required=False,
                tags=["coverage"],
            ),
            MetaContractEndpoint(
                id="testing.sync",
                method="POST",
                path="/api/v1/dev/testing/sync",
                summary="Sync test suites from filesystem discovery into DB.",
                tags=["sync"],
            ),
            MetaContractEndpoint(
                id="testing.suites_db",
                method="GET",
                path="/api/v1/dev/testing/suites",
                summary="Query suites from DB (fast, no filesystem scan). Requires prior sync.",
                auth_required=False,
                tags=["suites", "db"],
            ),
        ],
    )


def _builtin_diagnostics() -> MetaContract:
    return MetaContract(
        id="diagnostics",
        name="Diagnostics Runner",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="platform",
        audience=["dev", "agent"],
        summary=(
            "Run allowlisted maintenance scripts (tools/ and scripts/) as tracked "
            "diagnostic runs and read their history. Every run is persisted to the "
            "diagnostic_runs table attributed to the caller (started_by), so an "
            "agent-triggered backfill is auditable just like a human-triggered one. "
            "Running requires the 'devtools.diagnostics' permission (admins pass "
            "implicitly); the read endpoints share the same gate. Scripts default "
            "to dry-run — set params.apply=true only to make destructive changes."
        ),
        provides=[
            "diagnostic_discovery",
            "script_run",
            "run_history",
        ],
        relates_to=["testing.catalog", "plans.management", "devtools.codegen"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="diagnostics.list",
                method="GET",
                path="/api/v1/dev/testing/diagnostics",
                summary=(
                    "List runnable diagnostics with their param contract. For the "
                    "'shell-script' diagnostic, the 'script' param's options are the "
                    "allowlisted tools/ and scripts/ paths ([--apply] marks scripts "
                    "that support a dry-run/apply toggle)."
                ),
                permissions=["devtools.diagnostics"],
                tags=["discovery"],
            ),
            MetaContractEndpoint(
                id="diagnostics.runs",
                method="GET",
                path="/api/v1/dev/testing/diagnostics/runs",
                summary=(
                    "Recent diagnostic run history (most recent first). Each summary "
                    "carries status, started_by, params, timestamps, and event_count. "
                    "Use this to check whether a backfill/script already ran."
                ),
                permissions=["devtools.diagnostics"],
                tags=["history"],
            ),
            MetaContractEndpoint(
                id="diagnostics.run_status",
                method="GET",
                path="/api/v1/dev/testing/diagnostics/runs/{run_id}",
                summary="One run with its full typed-event log (poll this after diagnostics.run).",
                permissions=["devtools.diagnostics"],
                tags=["history"],
            ),
            MetaContractEndpoint(
                id="diagnostics.run",
                method="POST",
                path="/api/v1/dev/testing/diagnostics/{diagnostic_id}/run",
                summary=(
                    "Start a diagnostic run; returns run_id immediately (async). "
                    "diagnostic_id is usually 'shell-script'. Body: {\"params\": {...}}. "
                    "For 'shell-script' set params.script to an allowlisted path from "
                    "diagnostics.list; params.apply defaults to false (dry-run)."
                ),
                permissions=["devtools.diagnostics"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "properties": {
                                "params": {
                                    "type": "object",
                                    "description": (
                                        "Diagnostic params. For 'shell-script': "
                                        "{script: <allowlisted path>, apply: bool, "
                                        "args: str, kill_grace_s: str}."
                                    ),
                                },
                            },
                        },
                    },
                },
                tags=["run"],
            ),
            MetaContractEndpoint(
                id="diagnostics.cancel",
                method="POST",
                path="/api/v1/dev/testing/diagnostics/runs/{run_id}/cancel",
                summary="Request cancellation of an in-flight run.",
                permissions=["devtools.diagnostics"],
                tags=["run"],
            ),
        ],
    )


def _builtin_project_files() -> MetaContract:
    return MetaContract(
        id="project.files",
        name="Project File Access",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="platform",
        summary="Read-only access to project source files for AI agents reviewing plans and code.",
        audience=["dev"],
        provides=[
            "project_file_read",
            "project_file_list",
            "project_file_search",
        ],
        sub_endpoints=[
            MetaContractEndpoint(
                id="files_read",
                method="GET",
                path="/api/v1/files/read",
                summary="Read a project file with line numbers. Provide path (relative), optional offset and limit.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "path": {"type": "string", "description": "Relative file path (e.g. 'pixsim7/backend/main/services/foo.py')"},
                                "offset": {"type": "integer", "description": "Start line (1-based, default 1)"},
                                "limit": {"type": "integer", "description": "Max lines (default 500, max 2000)"},
                            },
                            "required": ["path"],
                        },
                    },
                },
            ),
            MetaContractEndpoint(
                id="files_list",
                method="GET",
                path="/api/v1/files/list",
                summary="List files in a project directory with sizes. Supports glob patterns.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "path": {"type": "string", "description": "Relative directory path (default: project root)"},
                                "pattern": {"type": "string", "description": "Glob pattern (e.g. '*.py', '**/*.ts')"},
                            },
                        },
                    },
                },
            ),
            MetaContractEndpoint(
                id="files_search",
                method="GET",
                path="/api/v1/files/search",
                summary="Search for text/regex patterns across project files. Returns matching lines with paths.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "pattern": {"type": "string", "description": "Text or regex pattern to search for"},
                                "path": {"type": "string", "description": "Directory to search in (default: root)"},
                                "glob": {"type": "string", "description": "File glob filter (e.g. '*.py')"},
                                "max_results": {"type": "integer", "description": "Max matches (default 50, max 200)"},
                            },
                            "required": ["pattern"],
                        },
                    },
                },
            ),
        ],
    )
