"""Agent pairing + heartbeat state machine.

Extracted from the device-agent route handlers so the pairing/heartbeat state
machine can be unit-tested without HTTP/FastAPI setup and reused by future
pairing flows. Pure refactor — logic preserved exactly.

The service raises domain-level exceptions (``PairingCodeNotFound``,
``PairingCodeExpired``, ``AgentNotFound``); the route layer translates them into
the appropriate HTTP responses.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.automation.domain import (
    AndroidDevice,
    ConnectionMethod,
    DeviceAgent,
    DeviceStatus,
    DeviceType,
    PairingRequest,
)

# Pairing code time-to-live (database-backed; replaced an old in-memory impl).
PAIRING_TTL_MINUTES = 15


def _as_utc(dt: datetime) -> datetime:
    """Coerce a DB datetime to aware UTC for comparison against ``now``.

    The pairing/agent tables use ``sa.DateTime()`` (naive timestamps) and the
    automation engine strips tzinfo on write, so values read back are naive.
    Comparing a naive value against an aware ``datetime.now(timezone.utc)``
    raises ``TypeError`` — this normalizes the stored value as UTC. (Fixes a
    latent crash on the expiry-check path uncovered during the cp2 extraction.)
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class PairingError(Exception):
    """Base class for pairing/heartbeat domain errors."""


class PairingCodeNotFound(PairingError):
    """No pairing request matches the supplied code."""


class PairingCodeExpired(PairingError):
    """The pairing code exists but has passed its TTL."""


class AgentNotFound(PairingError):
    """No registered/paired agent matches the supplied agent_id."""


@dataclass(frozen=True)
class HeartbeatResult:
    devices_synced: int
    timestamp: datetime


class AgentPairingService:
    """State machine for the remote device-agent pairing + heartbeat flow."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def request_pairing(
        self,
        *,
        agent_id: str,
        name: str,
        host: str,
        version: str,
        os_info: str,
        port: int = 5037,
        api_port: int = 8765,
        client_host: str | None = None,
    ) -> str:
        """Start the pairing flow for an agent and return a short pairing code.

        ``client_host`` is the detected request IP, used only when ``host`` is
        ``"auto"``. Cleans up expired pairing requests as a side effect.
        """
        now = datetime.now(timezone.utc)

        # Cleanup expired requests (older than TTL)
        expiry_cutoff = now - timedelta(minutes=PAIRING_TTL_MINUTES)
        expired_requests = (await self.db.execute(
            select(PairingRequest).where(PairingRequest.expires_at < expiry_cutoff)
        )).scalars().all()
        for expired in expired_requests:
            await self.db.delete(expired)
        await self.db.commit()

        # Generate a short pairing code: 4+4 hex segments (e.g., "A1B2-C3D4")
        raw = secrets.token_hex(4).upper()
        pairing_code = f"{raw[:4]}-{raw[4:]}"

        if host == "auto" and client_host:
            host = client_host

        existing = (await self.db.execute(
            select(PairingRequest).where(PairingRequest.agent_id == agent_id)
        )).scalars().first()

        expires_at = now + timedelta(minutes=PAIRING_TTL_MINUTES)

        if existing:
            # Update existing request
            existing.pairing_code = pairing_code
            existing.name = name
            existing.host = host
            existing.port = port
            existing.api_port = api_port
            existing.version = version
            existing.os_info = os_info
            existing.created_at = now
            existing.expires_at = expires_at
            existing.paired_user_id = None  # Reset pairing status
        else:
            # Create new pairing request
            self.db.add(PairingRequest(
                agent_id=agent_id,
                pairing_code=pairing_code,
                name=name,
                host=host,
                port=port,
                api_port=api_port,
                version=version,
                os_info=os_info,
                created_at=now,
                expires_at=expires_at,
            ))

        await self.db.commit()
        return pairing_code

    async def complete_pairing(self, *, pairing_code: str, user_id: int) -> DeviceAgent:
        """Associate an agent with a user via the pairing code.

        Raises ``PairingCodeNotFound`` / ``PairingCodeExpired``. Creates or
        updates the ``DeviceAgent`` record and returns it.
        """
        now = datetime.now(timezone.utc)

        pairing_request = (await self.db.execute(
            select(PairingRequest).where(PairingRequest.pairing_code == pairing_code)
        )).scalars().first()

        if not pairing_request:
            raise PairingCodeNotFound()

        # Enforce TTL
        if _as_utc(pairing_request.expires_at) < now:
            await self.db.delete(pairing_request)
            await self.db.commit()
            raise PairingCodeExpired()

        # Mark as paired
        pairing_request.paired_user_id = user_id

        # Create or update DeviceAgent for this user/agent_id
        existing = (await self.db.execute(
            select(DeviceAgent).where(DeviceAgent.agent_id == pairing_request.agent_id)
        )).scalars().first()

        if existing:
            existing.user_id = user_id
            existing.name = pairing_request.name
            existing.host = pairing_request.host
            existing.port = pairing_request.port
            existing.api_port = pairing_request.api_port
            existing.version = pairing_request.version
            existing.os_info = pairing_request.os_info
            existing.status = "online"
            existing.updated_at = now
            agent = existing
        else:
            agent = DeviceAgent(
                agent_id=pairing_request.agent_id,
                name=pairing_request.name,
                host=pairing_request.host,
                port=pairing_request.port,
                api_port=pairing_request.api_port,
                user_id=user_id,
                status="online",
                version=pairing_request.version,
                os_info=pairing_request.os_info,
                last_heartbeat=None,
                created_at=now,
                updated_at=now,
            )
            self.db.add(agent)

        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def get_pairing_status(self, agent_id: str) -> str:
        """Return ``"unknown" | "expired" | "paired" | "pending"`` for an agent."""
        pairing_request = (await self.db.execute(
            select(PairingRequest).where(PairingRequest.agent_id == agent_id)
        )).scalars().first()

        if not pairing_request:
            return "unknown"

        now = datetime.now(timezone.utc)
        if _as_utc(pairing_request.expires_at) < now:
            return "expired"

        if pairing_request.paired_user_id is not None:
            return "paired"

        return "pending"

    async def sync_heartbeat(
        self,
        *,
        agent_id: str,
        devices: list[dict[str, str]],
    ) -> HeartbeatResult:
        """Mark the agent online and reconcile its reported device list.

        Raises ``AgentNotFound`` if the agent_id is unknown. Devices present in
        the heartbeat are upserted; agent devices absent from it are marked
        offline.
        """
        agent = (await self.db.execute(
            select(DeviceAgent).where(DeviceAgent.agent_id == agent_id)
        )).scalars().first()

        if not agent:
            raise AgentNotFound()

        now = datetime.now(timezone.utc)
        agent.status = "online"
        agent.last_heartbeat = now
        agent.updated_at = now

        synced = 0
        for device_info in devices:
            serial = device_info["serial"]
            state = device_info["state"]

            # Create unique adb_id for remote device
            adb_id = f"{agent.host}:{agent.port}/{serial}"

            existing_device = (await self.db.execute(
                select(AndroidDevice).where(
                    AndroidDevice.adb_id == adb_id,
                    AndroidDevice.agent_id == agent.id,
                )
            )).scalars().first()

            status = DeviceStatus.ONLINE if state == "device" else DeviceStatus.ERROR

            if existing_device:
                existing_device.status = status
                existing_device.last_seen = now
                existing_device.updated_at = now
            else:
                self.db.add(AndroidDevice(
                    name=f"{agent.name}/{serial}",
                    device_type=DeviceType.ADB,
                    connection_method=ConnectionMethod.ADB,
                    adb_id=adb_id,
                    device_serial=serial,
                    agent_id=agent.id,
                    status=status,
                    last_seen=now,
                    created_at=now,
                    updated_at=now,
                ))
                synced += 1

        # Mark devices offline if not in heartbeat
        reported_serials = {d["serial"] for d in devices}
        all_agent_devices = (await self.db.execute(
            select(AndroidDevice).where(AndroidDevice.agent_id == agent.id)
        )).scalars().all()

        for device in all_agent_devices:
            device_serial = device.device_serial
            if device_serial and device_serial not in reported_serials:
                device.status = DeviceStatus.OFFLINE
                device.updated_at = now

        await self.db.commit()
        return HeartbeatResult(devices_synced=synced, timestamp=now)
