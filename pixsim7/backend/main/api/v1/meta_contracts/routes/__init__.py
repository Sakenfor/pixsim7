"""Meta-contract HTTP endpoints, grouped by surface.

Each group module owns an APIRouter; this package aggregates them into the
single /meta `router` and re-exports the flat endpoint namespace so
meta_contracts/__init__.py (and its external importers) resolve unchanged.
"""
from fastapi import APIRouter

from . import (
    contracts,
    agent_sessions,
    bridge,
    agent_writes,
    cli_token,
    chat_sessions,
)
from .contracts import (
    CONTRACTS_INDEX_VERSION,
    POLICIES_INDEX_VERSION,
    _discover_game_route_group_contracts,
    _make_tool_name,
    _normalize_route_path,
    _resolve_endpoint_availability,
    _sanitize_tool_fragment,
    _slugify_contract_token,
    _sync_contract_versions,
    _sync_policy_domains,
    list_contract_endpoints,
    list_policy_contracts,
)
from .agent_sessions import (
    agent_heartbeat,
    end_agent_session,
    get_agent_history,
    get_agent_stats,
    list_agent_sessions,
)
from .bridge import (
    _check_launcher_bridge,
    _is_launcher_bridge_active,
    _resolve_effective_user_id_from_authorization,
    get_active_task,
    get_bridge_machines,
    get_bridge_models,
    get_bridge_settings,
    get_bridge_status,
    get_task_result,
    send_message_to_agent,
    send_message_to_agent_stream,
    start_server_bridge,
    stop_server_bridge,
    terminate_agent,
    update_bridge_settings,
)
from .agent_writes import (
    get_agent_writes,
)
from .cli_token import (
    generate_cli_token,
)
from .chat_sessions import (
    _is_generic_cli_profile,
    _resolve_registration_profile_id,
    archive_chat_session,
    get_chat_session,
    get_system_prompt_preview,
    list_chat_sessions,
    register_chat_session,
    restore_chat_session,
    save_chat_session_messages,
)

router = APIRouter(prefix="/meta", tags=["meta"])
router.include_router(contracts.router)
router.include_router(agent_sessions.router)
router.include_router(bridge.router)
router.include_router(agent_writes.router)
router.include_router(cli_token.router)
router.include_router(chat_sessions.router)

__all__ = [
    "CONTRACTS_INDEX_VERSION",
    "POLICIES_INDEX_VERSION",
    "_check_launcher_bridge",
    "_discover_game_route_group_contracts",
    "_is_generic_cli_profile",
    "_is_launcher_bridge_active",
    "_make_tool_name",
    "_normalize_route_path",
    "_resolve_effective_user_id_from_authorization",
    "_resolve_endpoint_availability",
    "_resolve_registration_profile_id",
    "_sanitize_tool_fragment",
    "_slugify_contract_token",
    "_sync_contract_versions",
    "_sync_policy_domains",
    "agent_heartbeat",
    "archive_chat_session",
    "end_agent_session",
    "generate_cli_token",
    "get_active_task",
    "get_agent_history",
    "get_agent_stats",
    "get_agent_writes",
    "get_bridge_machines",
    "get_bridge_models",
    "get_bridge_settings",
    "get_bridge_status",
    "get_chat_session",
    "get_system_prompt_preview",
    "get_task_result",
    "list_agent_sessions",
    "list_chat_sessions",
    "list_contract_endpoints",
    "list_policy_contracts",
    "register_chat_session",
    "restore_chat_session",
    "router",
    "save_chat_session_messages",
    "send_message_to_agent",
    "send_message_to_agent_stream",
    "start_server_bridge",
    "stop_server_bridge",
    "terminate_agent",
    "update_bridge_settings",
]
