"""Protocol-stability snapshot for the device-agent wire protocol.

Pins the JSON field names + shapes of the agent↔server request/response models
in ``pixsim7.automation.protocols.agent_protocol``. These bodies are reproduced
by hand in two places that can't import the models — the standalone Python agent
(``pixsim7/automation/agent/device_agent.py``, kept import-free for single-file
portability) and the Kotlin app (``apps/pixsim7-android``) — so any change here
is an intentional commitment that must be mirrored in both, plus the OpenAPI
schema the Kotlin side realigns against.
"""
from __future__ import annotations

from pixsim7.automation.protocols.agent_protocol import (
    DeviceReport,
    HeartbeatPayload,
    HeartbeatResponse,
    PairingRequest,
    PairingResponse,
    PairingStatus,
)


def _field_names(model) -> list[str]:
    return list(model.model_fields.keys())


# ── field-name snapshots (the wire contract) ───────────────────────────────


def test_pairing_request_fields() -> None:
    assert _field_names(PairingRequest) == [
        "agent_id",
        "name",
        "host",
        "port",
        "api_port",
        "version",
        "os_info",
    ]


def test_pairing_response_fields() -> None:
    assert _field_names(PairingResponse) == ["pairing_code", "agent_id"]


def test_pairing_status_fields() -> None:
    assert _field_names(PairingStatus) == ["status"]


def test_device_report_fields() -> None:
    assert _field_names(DeviceReport) == ["serial", "state"]


def test_heartbeat_payload_fields() -> None:
    assert _field_names(HeartbeatPayload) == ["devices", "timestamp"]


def test_heartbeat_response_fields() -> None:
    assert _field_names(HeartbeatResponse) == ["status", "devices_synced", "timestamp"]


# ── defaults the agents rely on ────────────────────────────────────────────


def test_pairing_request_port_defaults() -> None:
    # Agents may omit ports; server must default to ADB 5037 / agent-API 8765.
    pr = PairingRequest(agent_id="a", name="n", host="auto", version="1", os_info="x")
    assert pr.port == 5037
    assert pr.api_port == 8765


# ── round-trip wire shapes (what the hand-rolled clients send/receive) ──────


def test_heartbeat_payload_round_trips_client_json() -> None:
    payload = HeartbeatPayload.model_validate(
        {
            "devices": [{"serial": "ABC123", "state": "device"}],
            "timestamp": "1718900000000",
        }
    )
    assert payload.devices[0].serial == "ABC123"
    assert payload.devices[0].state == "device"
    # Extra keys a client might add are ignored, not rejected.
    HeartbeatPayload.model_validate(
        {
            "devices": [{"serial": "X", "state": "device", "extra": "ok"}],
            "timestamp": "0",
        }
    )


def test_heartbeat_response_serializes_expected_keys() -> None:
    dumped = HeartbeatResponse(status="ok", devices_synced=2, timestamp="0").model_dump()
    assert set(dumped) == {"status", "devices_synced", "timestamp"}
