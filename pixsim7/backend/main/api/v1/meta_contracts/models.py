"""Pydantic request/response DTOs for the meta-contract + agent surfaces."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator




class EndpointAvailabilityEntry(BaseModel):
    status: str = Field(
        "available",
        description="Runtime availability: available | conditional | disabled.",
    )
    reason: Optional[str] = Field(
        None,
        description="Human-readable reason for conditional/disabled state.",
    )
    conditions: List[str] = Field(
        default_factory=list,
        description="Machine-readable condition hints.",
    )


class ContractEndpointEntry(BaseModel):
    id: str
    tool_name: str = Field(
        ...,
        description="Canonical MCP tool name for this endpoint.",
    )
    method: str
    path: str
    summary: str
    auth_required: bool = Field(
        True,
        description="Whether auth is required for this endpoint. Inherits contract-level auth by default.",
    )
    requires_admin: bool = Field(
        False,
        description="Whether this endpoint requires admin privileges.",
    )
    permissions: List[str] = Field(
        default_factory=list,
        description="Permission scopes required by this endpoint.",
    )
    availability: EndpointAvailabilityEntry = Field(
        default_factory=EndpointAvailabilityEntry,
        description="Runtime availability metadata.",
    )
    input_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON-schema-like input contract for MCP/tool generation.",
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON-schema-like output contract.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Endpoint tags for discovery/filtering.",
    )


class AgentPresence(BaseModel):
    """Active agent on a contract node."""
    session_id: str
    agent_type: str
    status: str
    action: str
    detail: str
    plan_id: Optional[str] = None
    task_kind: Optional[str] = None
    duration_seconds: int = 0


class ContractIndexEntry(BaseModel):
    id: str
    name: str
    endpoint: Optional[str] = Field(
        None,
        description="Primary contract endpoint. Null if contract is an endpoint group.",
    )
    version: str
    auth_required: bool
    owner: str
    summary: str
    audience: List[str] = Field(
        default_factory=list,
        description="Who this contract is for: 'user', 'dev', or both.",
    )
    provides: List[str] = Field(
        default_factory=list,
        description="Capabilities this contract surface exposes.",
    )
    relates_to: List[str] = Field(
        default_factory=list,
        description="IDs of related contracts (bidirectional navigation).",
    )
    sub_endpoints: List[ContractEndpointEntry] = Field(
        default_factory=list,
        description="Individual endpoints when contract is an endpoint group.",
    )
    tool_names: List[str] = Field(
        default_factory=list,
        description=(
            "Canonical MCP tool names exposed by this contract. "
            "Use for focused tool allowlists."
        ),
    )
    active_agents: List[AgentPresence] = Field(
        default_factory=list,
        description="Agents currently working on this contract surface.",
    )


class ContractsIndexResponse(BaseModel):
    version: str
    generated_at: str
    contracts: List[ContractIndexEntry]
    total_active_agents: int = 0


class PolicyIndexEntry(BaseModel):
    domain: str
    version: str
    schema_version: str
    endpoint: str
    summary: str
    rules_count: int
    endpoints: List[str] = Field(default_factory=list)


class PoliciesIndexResponse(BaseModel):
    version: str
    generated_at: str
    policies: List[PolicyIndexEntry]


class AgentHeartbeatRequest(BaseModel):
    session_id: str = Field(..., description="Unique agent session identifier")
    run_id: Optional[str] = Field(None, description="Run/invocation ID (from agent token)")
    agent_type: str = Field("claude", description="Agent type (claude, custom, etc.)")
    status: str = Field("active", description="active | paused | completed | errored")
    contract_id: Optional[str] = Field(None, description="Contract surface the agent is working on")
    endpoint: Optional[str] = Field(None, description="Specific endpoint being called")
    plan_id: Optional[str] = Field(None, description="Plan the agent is working on")
    action: str = Field("", description="Current action (reading_plan, editing_code, running_codegen, etc.)")
    detail: str = Field("", description="Free-form detail about current activity")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata (supports nested values)")


class AgentSessionEntry(BaseModel):
    session_id: str
    agent_type: str
    status: str
    started_at: str
    last_heartbeat: str
    duration_seconds: int
    plan_id: Optional[str] = None
    contract_id: Optional[str] = None
    action: str = ""
    detail: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)
    recent_activity: List[Dict[str, Any]] = Field(default_factory=list)


class AgentHeartbeatResponse(BaseModel):
    session_id: str
    status: str
    acknowledged: bool = True
    warnings: List[str] = Field(default_factory=list)


class AgentSessionsResponse(BaseModel):
    active: List[AgentSessionEntry]
    total_active: int
    total_all: int


class AgentHistoryEntry(BaseModel):
    session_id: str
    run_id: Optional[str] = None
    agent_type: str
    status: str
    contract_id: Optional[str] = None
    plan_id: Optional[str] = None
    action: str
    detail: Optional[str] = None
    endpoint: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: str


class AgentHistoryResponse(BaseModel):
    entries: List[AgentHistoryEntry]
    total: int


class AgentStatsContract(BaseModel):
    contract_id: str
    heartbeat_count: int
    unique_sessions: int


class AgentStatsPlan(BaseModel):
    plan_id: str
    heartbeat_count: int
    unique_sessions: int


class AgentStatsResponse(BaseModel):
    total_heartbeats: int
    unique_sessions: int
    by_contract: List[AgentStatsContract]
    by_plan: List[AgentStatsPlan]


class PoolSessionEntry(BaseModel):
    session_id: str
    engine: str
    state: str
    cli_session_id: Optional[str] = None
    cli_model: Optional[str] = None
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    total_duration_ms: int = 0
    started_at: Optional[str] = None
    last_activity: Optional[str] = None
    last_error: Optional[str] = None
    pid: Optional[int] = None
    # Context usage
    context_window: int = 0
    total_tokens: int = 0
    context_pct: Optional[float] = None
    cost_usd: Optional[float] = None


class FailedEngineEntry(BaseModel):
    """An engine that failed the bridge's start-up `--version` probe.

    Surfaced by the bridge in `pool_status` so the backend / frontend can
    distinguish "engine not advertised" (user simply didn't install codex)
    from "engine probe failed" (codex is installed but something is wrong
    with the binary). The reason string is opaque diagnostic — pulled from
    `agent_pool.probe_engine` (e.g. ``binary_not_found``, ``timeout_8.0s``,
    ``exit_-1073741819:Access denied``).
    """
    engine: str
    reason: str


class RemoteAgentEntry(BaseModel):
    bridge_client_id: str
    bridge_id: Optional[str] = None
    agent_type: str
    user_id: Optional[int] = None
    connected_at: str
    busy: bool
    tasks_completed: int
    engines: List[str] = []
    failed_engines: List[FailedEngineEntry] = []
    pool_sessions: List[PoolSessionEntry] = []


class RemoteAgentBridgeStatus(BaseModel):
    connected: int
    available: int
    agents: List[RemoteAgentEntry]
    process_alive: bool = False
    managed_by: Optional[str] = None  # "server" | "launcher" | None


class BridgeMachineEntry(BaseModel):
    bridge_client_id: str
    bridge_id: Optional[str] = None
    agent_type: Optional[str] = None
    status: str
    online: bool
    first_seen_at: str
    last_seen_at: str
    last_connected_at: Optional[str] = None
    last_disconnected_at: Optional[str] = None
    model: Optional[str] = None
    client_host: Optional[str] = None


class BridgeMachinesResponse(BaseModel):
    total: int
    machines: List[BridgeMachineEntry]


class TerminateAgentResponse(BaseModel):
    ok: bool
    bridge_client_id: str
    message: str


class AgentWriteEntry(BaseModel):
    id: str
    domain: str  # "plan" | "prompt" | "notification" | ...
    entity_id: str
    entity_label: str
    event_type: str
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    commit_sha: Optional[str] = None
    actor: str
    timestamp: str


class AgentWritesResponse(BaseModel):
    entries: List[AgentWriteEntry]
    total: int


class CliTokenResponse(BaseModel):
    token: str
    expires_in_hours: int
    scope: str
    agent_id: Optional[str] = None
    command: str = Field(description="Ready-to-paste CLI command")


class StartBridgeRequest(BaseModel):
    pool_size: int = Field(1, ge=1, le=5, description="Number of sessions for primary engine")
    engines: Optional[str] = Field(None, description="Comma-separated engines (e.g. claude,codex). Auto-detects if omitted.")
    extra_args: Optional[str] = Field(None, description="Extra CLI args passed to agent sessions")
    resume_session_id: Optional[str] = Field(None, description="Session UUID to resume")
    shared: bool = Field(False, description="Start as shared/admin bridge (no user scoping). Admin only.")


class StartBridgeResponse(BaseModel):
    ok: bool
    pid: Optional[int] = None
    message: str


class SettingField(BaseModel):
    key: str
    type: str
    label: str
    description: Optional[str] = None
    default: Any = None
    options: Optional[List[Any]] = None
    option_groups: Optional[List[Dict[str, Any]]] = None


class BridgeSettingsResponse(BaseModel):
    service_key: str = "ai-client"
    schema_: List[SettingField] = Field(default_factory=list, alias="schema")
    values: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class BridgeSettingsUpdateRequest(BaseModel):
    values: Dict[str, Any]


class SendMessageRequest(BaseModel):
    message: str = Field(..., description="Message/prompt to send to the remote agent")
    model: str = Field("default", description="Model identifier to pass to the agent")
    context: Optional[Dict[str, Any]] = Field(None, description="Optional context dict")
    timeout: int = Field(120, ge=10, le=600, description="Timeout in seconds")
    asset_ids: Optional[List[int]] = Field(None, description="Asset IDs to include as images (vision)")
    assistant_id: Optional[str] = Field(None, description="Assistant profile to use (resolves persona + model + scope)")
    bridge_session_id: Optional[str] = Field(None, description="Conversation session UUID to route to / resume")
    skip_persona: bool = Field(False, description="If true, do not inject the profile persona into the message")
    custom_instructions: Optional[str] = Field(None, description="User-supplied text appended to the system prompt for this session")
    user_token: Optional[str] = Field(None, description="Pre-minted agent token to inject into the task payload (for API tool auth)")
    focus: Optional[List[str]] = Field(None, description="Capability focus areas — filters which endpoints are included in the system prompt")
    engine: str = Field("claude", description="Agent engine command to use (claude, codex, etc.)")
    session_policy: Optional[str] = Field(
        None,
        description="Session policy override: ephemeral | scoped | persistent",
    )
    scope_key: Optional[str] = Field(
        None,
        description="Scope key for scoped session routing (e.g. plan:auth-refactor)",
    )

    @model_validator(mode="before")
    @classmethod
    def _reject_legacy_session_key(cls, data: Any) -> Any:
        if isinstance(data, dict) and "claude_session_id" in data:
            raise ValueError("claude_session_id is retired; use bridge_session_id")
        return data


class SendMessageResponse(BaseModel):
    ok: bool
    bridge_client_id: str
    response: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    bridge_session_id: Optional[str] = Field(None, description="Conversation session UUID (canonical)")


class RegisterSessionRequest(BaseModel):
    session_id: str = Field(..., description="Session UUID to register")
    engine: str = Field("claude", description="Agent engine")
    label: str = Field("CLI session", description="Display label")
    profile_id: Optional[str] = Field(None, description="Agent profile ID to associate")
    source: Optional[str] = Field(None, description="Registration source (mcp, hook, etc.)")
    scope_key: Optional[str] = Field(None, description="Scope key for session affinity (e.g. plan:my-plan)")
    last_plan_id: Optional[str] = Field(None, description="Plan ID being worked on")
