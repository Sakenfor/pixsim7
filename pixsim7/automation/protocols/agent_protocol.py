"""Agent wire protocol — the agent↔server request/response contract.

Single source of truth for the remote device-agent endpoints (request-pairing,
pairing-status, heartbeat), so the three implementations stop drifting:

- the FastAPI routes — use these as ``request``/``response_model``;
- the standalone Python agent (``pixsim7/automation/agent/device_agent.py``) —
  intentionally import-free for single-file portability, so it mirrors these
  shapes by hand. ``test_agent_protocol_stability`` pins the field names so the
  agent's hand-rolled dicts can't drift silently;
- the Kotlin app (``apps/pixsim7-android``) — hand-written JSON keyed on these
  field names; realign against the OpenAPI schema these models produce.

The JSON field names ARE the contract — keep them stable; the snapshot test
guards them. Unlike the capability protocols in this package (frozen dataclass
DTOs, no third-party types), these are Pydantic models because they serve
directly as FastAPI request/response bodies.
"""
from __future__ import annotations

from pydantic import BaseModel


class PairingRequest(BaseModel):
    """Agent → ``POST /automation/agents/request-pairing``."""

    agent_id: str
    name: str
    host: str  # "auto" → server detects the agent IP from the request
    port: int = 5037
    api_port: int = 8765
    version: str
    os_info: str


class PairingResponse(BaseModel):
    """Server → agent: the short-lived pairing code."""

    pairing_code: str
    agent_id: str


class PairingStatus(BaseModel):
    """Server → ``GET /automation/agents/pairing-status/{agent_id}``."""

    status: str  # "pending" | "paired" | "expired" | "unknown"


class DeviceReport(BaseModel):
    """One ADB device line carried in a heartbeat."""

    serial: str
    state: str  # "device" | "offline" | "unauthorized" | ...


class HeartbeatPayload(BaseModel):
    """Agent → ``POST /automation/agents/{agent_id}/heartbeat``."""

    devices: list[DeviceReport]
    timestamp: str


class HeartbeatResponse(BaseModel):
    """Server → agent: heartbeat acknowledgement."""

    status: str
    devices_synced: int
    timestamp: str
