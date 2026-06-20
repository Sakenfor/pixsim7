"""AgentPairingService — pairing + heartbeat state machine tests (no HTTP).

Exercises the service extracted from the device-agent route handlers (cp2 of
the automation-device-rollup plan). Uses real Postgres in an isolated schema
per the test-fixture canon — the pairing/agent/device tables FK only among
themselves, so ``create_all`` with the three tables suffices (no cross-domain
DDL bypass needed).

These tests also lock in the tz fix uncovered during extraction: the tables use
naive ``sa.DateTime()`` columns, so the expiry comparison must coerce the
stored value to UTC before comparing against an aware ``now``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.automation.domain import AndroidDevice, DeviceAgent, DeviceStatus, PairingRequest
from pixsim7.automation.services import (
    AgentNotFound,
    AgentPairingService,
    PairingCodeExpired,
    PairingCodeNotFound,
)
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings

pytestmark = pytest.mark.asyncio

_TABLES = [DeviceAgent.__table__, AndroidDevice.__table__, PairingRequest.__table__]


def _make_engine(*, search_path: str | None = None) -> AsyncEngine:
    connect_args: dict = {}
    if search_path is not None:
        connect_args["server_settings"] = {"search_path": search_path}
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
        connect_args=connect_args,
    )
    event.listen(
        engine.sync_engine,
        "before_cursor_execute",
        _strip_tz_from_params,
        retval=True,
    )
    return engine


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Fresh isolated schema with the pairing/agent/device tables; dropped after."""
    schema_name = f"test_pairing_{uuid4().hex}"
    admin_engine = _make_engine()
    try:
        async with admin_engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            await conn.execute(text(f'SET search_path TO "{schema_name}"'))
            await conn.run_sync(
                lambda c: SQLModel.metadata.create_all(c, tables=_TABLES)
            )

        engine = _make_engine(search_path=schema_name)
        db = AsyncSession(engine, expire_on_commit=False)
        try:
            yield db
        finally:
            await db.close()
            await engine.dispose()

        async with admin_engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
    finally:
        await admin_engine.dispose()


async def _request(
    svc: AgentPairingService,
    *,
    agent_id: str = "agent-1",
    name: str = "LivingRoom-PC",
    host: str = "auto",
    client_host: str | None = "10.243.48.200",
) -> str:
    return await svc.request_pairing(
        agent_id=agent_id,
        name=name,
        host=host,
        version="1.0.0",
        os_info="Linux 6.1",
        client_host=client_host,
    )


async def _expire(db: AsyncSession, agent_id: str) -> None:
    pr = (await db.execute(
        select(PairingRequest).where(PairingRequest.agent_id == agent_id)
    )).scalars().first()
    pr.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.commit()


# ── request_pairing ────────────────────────────────────────────────────────

async def test_request_pairing_creates_pending(session: AsyncSession):
    svc = AgentPairingService(session)
    code = await _request(svc)

    assert len(code) == 9 and code[4] == "-"  # "A1B2-C3D4"
    assert await svc.get_pairing_status("agent-1") == "pending"

    pr = (await session.execute(
        select(PairingRequest).where(PairingRequest.agent_id == "agent-1")
    )).scalars().first()
    assert pr.host == "10.243.48.200"  # "auto" resolved to client_host
    assert pr.paired_user_id is None


async def test_request_pairing_auto_host_unresolved_when_no_client(session: AsyncSession):
    svc = AgentPairingService(session)
    await _request(svc, client_host=None)

    pr = (await session.execute(
        select(PairingRequest).where(PairingRequest.agent_id == "agent-1")
    )).scalars().first()
    assert pr.host == "auto"


async def test_request_pairing_reissues_for_same_agent(session: AsyncSession):
    svc = AgentPairingService(session)
    code1 = await _request(svc, name="old")
    code2 = await _request(svc, name="new")

    assert code1 != code2
    rows = (await session.execute(
        select(PairingRequest).where(PairingRequest.agent_id == "agent-1")
    )).scalars().all()
    assert len(rows) == 1  # updated in place, not duplicated
    assert rows[0].name == "new"
    assert rows[0].pairing_code == code2


# ── get_pairing_status ──────────────────────────────────────────────────────

async def test_get_pairing_status_unknown(session: AsyncSession):
    svc = AgentPairingService(session)
    assert await svc.get_pairing_status("nobody") == "unknown"


async def test_get_pairing_status_expired(session: AsyncSession):
    svc = AgentPairingService(session)
    await _request(svc)
    await _expire(session, "agent-1")
    assert await svc.get_pairing_status("agent-1") == "expired"


# ── complete_pairing ────────────────────────────────────────────────────────

async def test_complete_pairing_creates_agent_and_marks_paired(session: AsyncSession):
    svc = AgentPairingService(session)
    code = await _request(svc)

    agent = await svc.complete_pairing(pairing_code=code, user_id=7)

    assert agent.agent_id == "agent-1"
    assert agent.user_id == 7
    assert agent.status == "online"
    assert await svc.get_pairing_status("agent-1") == "paired"


async def test_complete_pairing_invalid_code_raises(session: AsyncSession):
    svc = AgentPairingService(session)
    with pytest.raises(PairingCodeNotFound):
        await svc.complete_pairing(pairing_code="DEAD-BEEF", user_id=1)


async def test_complete_pairing_expired_raises_and_deletes(session: AsyncSession):
    svc = AgentPairingService(session)
    code = await _request(svc)
    await _expire(session, "agent-1")

    with pytest.raises(PairingCodeExpired):
        await svc.complete_pairing(pairing_code=code, user_id=1)

    # Expired request is cleaned up.
    assert await svc.get_pairing_status("agent-1") == "unknown"


async def test_complete_pairing_updates_existing_agent(session: AsyncSession):
    svc = AgentPairingService(session)
    code1 = await _request(svc, name="first")
    await svc.complete_pairing(pairing_code=code1, user_id=1)

    code2 = await _request(svc, name="renamed")
    agent = await svc.complete_pairing(pairing_code=code2, user_id=2)

    assert agent.name == "renamed"
    assert agent.user_id == 2
    rows = (await session.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == "agent-1")
    )).scalars().all()
    assert len(rows) == 1  # reused, not duplicated


# ── sync_heartbeat ──────────────────────────────────────────────────────────

async def test_sync_heartbeat_unknown_agent_raises(session: AsyncSession):
    svc = AgentPairingService(session)
    with pytest.raises(AgentNotFound):
        await svc.sync_heartbeat(agent_id="ghost", devices=[])


async def test_sync_heartbeat_upserts_then_marks_absent_offline(session: AsyncSession):
    svc = AgentPairingService(session)
    code = await _request(svc, host="10.0.0.9", client_host=None)
    await svc.complete_pairing(pairing_code=code, user_id=1)

    first = await svc.sync_heartbeat(
        agent_id="agent-1",
        devices=[
            {"serial": "AAA", "state": "device"},
            {"serial": "BBB", "state": "device"},
        ],
    )
    assert first.devices_synced == 2

    second = await svc.sync_heartbeat(
        agent_id="agent-1",
        devices=[{"serial": "AAA", "state": "device"}],
    )
    assert second.devices_synced == 0  # AAA already exists, no new rows

    devices = {
        d.device_serial: d
        for d in (await session.execute(select(AndroidDevice))).scalars().all()
    }
    assert devices["AAA"].status == DeviceStatus.ONLINE
    assert devices["BBB"].status == DeviceStatus.OFFLINE  # absent from 2nd heartbeat

    agent = (await session.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == "agent-1")
    )).scalars().first()
    assert agent.status == "online"
    assert agent.last_heartbeat is not None
