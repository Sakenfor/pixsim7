"""
Device Agent API endpoints

Handles registration and heartbeat from remote device agents.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import secrets

from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.domain.automation import DeviceAgent, AndroidDevice, DeviceStatus, DeviceType, ConnectionMethod, PairingRequest
from pixsim7.backend.main.api.dependencies import CurrentUser

router = APIRouter(prefix="/automation/agents", tags=["device-agents"])


class AgentRegisterRequest(BaseModel):
    agent_id: str
    name: str
    host: str  # "auto" to detect from request IP
    port: int = 5037
    api_port: int = 8765
    version: str
    os_info: str


class AgentHeartbeatRequest(BaseModel):
    devices: List[dict[str, str]]  # [{"serial": "...", "state": "device"}]
    timestamp: str


# Pairing TTL constant (moved from in-memory implementation to database-backed)
PAIRING_TTL_MINUTES = 15


class PairingStartRequest(BaseModel):
    agent_id: str
    name: str
    host: str
    port: int = 5037
    api_port: int = 8765
    version: str
    os_info: str


class PairingStartResponse(BaseModel):
    pairing_code: str
    agent_id: str


class CompletePairingRequest(BaseModel):
    pairing_code: str


class CompletePairingResponse(BaseModel):
    """Response from completing agent pairing."""
    status: str
    agent_id: str


class PairingStatusResponse(BaseModel):
    status: str  # "pending" | "paired" | "expired" | "unknown"


@router.post("/register")
async def register_agent(
    request: Request,
    data: AgentRegisterRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Register a new device agent"""
    
    # Detect host from request if "auto"
    host = data.host
    if host == "auto":
        # Get client IP from request
        if request.client:
            host = request.client.host
        else:
            raise HTTPException(status_code=400, detail="Could not detect client IP")
    
    # Check if agent already exists
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == data.agent_id)
    )
    existing = result.scalars().first()
    
    now = datetime.utcnow()
    
    if existing:
        # Update existing agent
        existing.name = data.name
        existing.host = host
        existing.port = data.port
        existing.api_port = data.api_port
        existing.version = data.version
        existing.os_info = data.os_info
        existing.status = "online"
        existing.last_heartbeat = now
        existing.updated_at = now
        agent = existing
    else:
        # Create new agent
        agent = DeviceAgent(
            agent_id=data.agent_id,
            name=data.name,
            host=host,
            port=data.port,
            api_port=data.api_port,
            user_id=user.id,
            status="online",
            version=data.version,
            os_info=data.os_info,
            last_heartbeat=now,
            created_at=now,
            updated_at=now
        )
        db.add(agent)
    
    await db.commit()
    await db.refresh(agent)
    
    return {
        "status": "registered",
        "agent": {
            "id": agent.id,
            "agent_id": agent.agent_id,
            "name": agent.name,
            "host": agent.host
        }
    }


@router.post("/request-pairing", response_model=PairingStartResponse)
async def request_pairing(
    data: PairingStartRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
) -> PairingStartResponse:
    """Start pairing flow for a remote agent (no auth required).

    Agent calls this to obtain a short-lived pairing code. The user then enters
    this code in the web UI to associate the agent with their account.
    """
    now = datetime.utcnow()

    # Cleanup expired requests (older than TTL)
    expiry_cutoff = now - timedelta(minutes=PAIRING_TTL_MINUTES)
    await db.execute(
        select(PairingRequest).where(PairingRequest.expires_at < expiry_cutoff)
    )
    expired_requests = (await db.execute(
        select(PairingRequest).where(PairingRequest.expires_at < expiry_cutoff)
    )).scalars().all()

    for expired in expired_requests:
        await db.delete(expired)

    await db.commit()

    # Generate a short pairing code: 4+4 hex segments (e.g., "A1B2-C3D4")
    raw = secrets.token_hex(4).upper()
    pairing_code = f"{raw[:4]}-{raw[4:]}"

    host = data.host
    if host == "auto" and req.client:
        host = req.client.host

    # Check if pairing request already exists for this agent_id
    existing = (await db.execute(
        select(PairingRequest).where(PairingRequest.agent_id == data.agent_id)
    )).scalars().first()

    expires_at = now + timedelta(minutes=PAIRING_TTL_MINUTES)

    if existing:
        # Update existing request
        existing.pairing_code = pairing_code
        existing.name = data.name
        existing.host = host
        existing.port = data.port
        existing.api_port = data.api_port
        existing.version = data.version
        existing.os_info = data.os_info
        existing.created_at = now
        existing.expires_at = expires_at
        existing.paired_user_id = None  # Reset pairing status
    else:
        # Create new pairing request
        pairing_request = PairingRequest(
            agent_id=data.agent_id,
            pairing_code=pairing_code,
            name=data.name,
            host=host,
            port=data.port,
            api_port=data.api_port,
            version=data.version,
            os_info=data.os_info,
            created_at=now,
            expires_at=expires_at,
        )
        db.add(pairing_request)

    await db.commit()

    return PairingStartResponse(pairing_code=pairing_code, agent_id=data.agent_id)


@router.post("/complete-pairing", response_model=CompletePairingResponse)
async def complete_pairing(
    body: CompletePairingRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CompletePairingResponse:
    """Complete pairing for an agent using a pairing code.

    The logged-in user submits the pairing code from the Automation UI.
    This associates the agent with the user and creates/updates the DeviceAgent
    record. Agents can then poll pairing-status to know when pairing is done.
    """
    now = datetime.utcnow()

    # Look up pairing request by code
    pairing_request = (await db.execute(
        select(PairingRequest).where(PairingRequest.pairing_code == body.pairing_code)
    )).scalars().first()

    if not pairing_request:
        raise HTTPException(status_code=404, detail="Invalid or expired pairing code")

    # Enforce TTL
    if pairing_request.expires_at < now:
        # Clean up expired request
        await db.delete(pairing_request)
        await db.commit()
        raise HTTPException(status_code=410, detail="Pairing code has expired")

    # Mark as paired
    pairing_request.paired_user_id = user.id

    # Create or update DeviceAgent for this user/agent_id
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == pairing_request.agent_id)
    )
    existing = result.scalars().first()

    if existing:
        existing.user_id = user.id
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
            user_id=user.id,
            status="online",
            version=pairing_request.version,
            os_info=pairing_request.os_info,
            last_heartbeat=None,
            created_at=now,
            updated_at=now,
        )
        db.add(agent)

    await db.commit()
    await db.refresh(agent)

    return CompletePairingResponse(status="paired", agent_id=agent.agent_id)


@router.get("/pairing-status/{agent_id}", response_model=PairingStatusResponse)
async def get_pairing_status(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
) -> PairingStatusResponse:
    """Check pairing status for an agent (used by agent to know when user has paired it)."""
    pairing_request = (await db.execute(
        select(PairingRequest).where(PairingRequest.agent_id == agent_id)
    )).scalars().first()

    if not pairing_request:
        return PairingStatusResponse(status="unknown")

    now = datetime.utcnow()
    if pairing_request.expires_at < now:
        return PairingStatusResponse(status="expired")

    if pairing_request.paired_user_id is not None:
        return PairingStatusResponse(status="paired")

    return PairingStatusResponse(status="pending")


@router.post("/{agent_id}/heartbeat")
async def agent_heartbeat(
    agent_id: str,
    data: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_db)
):
    """Receive heartbeat from agent and sync devices.

    No authentication required - agent just needs to be registered/paired.
    The agent_id serves as the authentication mechanism for paired agents.
    """

    # Find agent by agent_id only (no user auth required for heartbeat)
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == agent_id)
    )
    agent = result.scalars().first()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found - complete pairing first")
    
    # Update agent status
    now = datetime.utcnow()
    agent.status = "online"
    agent.last_heartbeat = now
    agent.updated_at = now
    
    # Sync devices
    synced = 0
    for device_info in data.devices:
        serial = device_info["serial"]
        state = device_info["state"]
        
        # Create unique adb_id for remote device
        adb_id = f"{agent.host}:{agent.port}/{serial}"
        
        # Find existing device
        result = await db.execute(
            select(AndroidDevice).where(
                AndroidDevice.adb_id == adb_id,
                AndroidDevice.agent_id == agent.id
            )
        )
        existing_device = result.scalars().first()
        
        status = DeviceStatus.ONLINE if state == "device" else DeviceStatus.ERROR
        
        if existing_device:
            # Update existing
            existing_device.status = status
            existing_device.last_seen = now
            existing_device.updated_at = now
        else:
            # Create new
            device = AndroidDevice(
                name=f"{agent.name}/{serial}",
                device_type=DeviceType.ADB,
                connection_method=ConnectionMethod.ADB,
                adb_id=adb_id,
                device_serial=serial,
                agent_id=agent.id,
                status=status,
                last_seen=now,
                created_at=now,
                updated_at=now
            )
            db.add(device)
            synced += 1
    
    # Mark devices offline if not in heartbeat
    reported_serials = {d["serial"] for d in data.devices}
    result = await db.execute(
        select(AndroidDevice).where(AndroidDevice.agent_id == agent.id)
    )
    all_agent_devices = result.scalars().all()
    
    for device in all_agent_devices:
        device_serial = device.device_serial
        if device_serial and device_serial not in reported_serials:
            device.status = DeviceStatus.OFFLINE
            device.updated_at = now
    
    await db.commit()
    
    return {
        "status": "ok",
        "devices_synced": synced,
        "timestamp": now.isoformat()
    }


@router.get("")
async def list_agents(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """List all agents for current user"""
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.user_id == user.id)
    )
    agents = result.scalars().all()
    
    # Mark stale agents as offline
    now = datetime.utcnow()
    stale_threshold = now - timedelta(minutes=2)
    
    for agent in agents:
        if agent.last_heartbeat and agent.last_heartbeat < stale_threshold:
            if agent.status != "offline":
                agent.status = "offline"
    
    await db.commit()
    
    return agents


class AdminCreateAgentRequest(BaseModel):
    """Request to directly create an agent (bypasses pairing for testing)."""
    name: str
    host: str  # ZeroTier IP of the remote PC
    port: int = 5037
    api_port: int = 8765


@router.post("/admin/create")
async def admin_create_agent(
    data: AdminCreateAgentRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Directly create a device agent (for testing/admin use).

    Use this to add a remote PC by its ZeroTier IP without going through
    the pairing code flow. Useful for development and testing.

    Example:
        POST /api/v1/automation/agents/admin/create
        {
            "name": "LivingRoom-PC",
            "host": "10.243.48.200"
        }
    """
    import uuid
    now = datetime.utcnow()

    # Check if agent with same host already exists for this user
    result = await db.execute(
        select(DeviceAgent).where(
            DeviceAgent.host == data.host,
            DeviceAgent.user_id == user.id
        )
    )
    existing = result.scalars().first()

    if existing:
        # Update existing
        existing.name = data.name
        existing.port = data.port
        existing.api_port = data.api_port
        existing.status = "offline"  # Will go online when heartbeat received
        existing.updated_at = now
        agent = existing
    else:
        # Create new
        agent = DeviceAgent(
            agent_id=str(uuid.uuid4()),
            name=data.name,
            host=data.host,
            port=data.port,
            api_port=data.api_port,
            user_id=user.id,
            status="offline",
            version="manual",
            os_info="Added manually",
            created_at=now,
            updated_at=now
        )
        db.add(agent)

    await db.commit()
    await db.refresh(agent)

    return {
        "status": "created",
        "agent": {
            "id": agent.id,
            "agent_id": agent.agent_id,
            "name": agent.name,
            "host": agent.host,
            "port": agent.port,
            "api_port": agent.api_port,
            "status": agent.status
        },
        "note": "Agent created. Run device_agent.py on the remote PC to connect."
    }


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Delete an agent and its devices"""
    result = await db.execute(
        select(DeviceAgent).where(
            DeviceAgent.agent_id == agent_id,
            DeviceAgent.user_id == user.id
        )
    )
    agent = result.scalars().first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Delete associated devices
    result = await db.execute(
        select(AndroidDevice).where(AndroidDevice.agent_id == agent.id)
    )
    devices = result.scalars().all()
    for device in devices:
        await db.delete(device)
    
    # Delete agent
    await db.delete(agent)
    await db.commit()
    
    return {"status": "deleted"}
