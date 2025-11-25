"""
Device Agent API endpoints

Handles registration and heartbeat from remote device agents.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import secrets

from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.domain.automation import DeviceAgent, AndroidDevice, DeviceStatus, DeviceType, ConnectionMethod
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
    devices: List[Dict[str, str]]  # [{"serial": "...", "state": "device"}]
    timestamp: str


# In-memory pairing state (per-process, short-lived).
# This is intended for developer convenience and simple deployments;
# production setups should back this with a shared store.
class PairingRequestState(BaseModel):
    agent_id: str
    pairing_code: str
    name: str
    host: str
    port: int
    api_port: int
    version: str
    os_info: str
    created_at: datetime
    paired_user_id: Optional[int] = None


PAIRING_REQUESTS: Dict[str, PairingRequestState] = {}
PAIRING_CODE_INDEX: Dict[str, str] = {}  # pairing_code -> agent_id
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
) -> PairingStartResponse:
    """Start pairing flow for a remote agent (no auth required).

    Agent calls this to obtain a short-lived pairing code. The user then enters
    this code in the web UI to associate the agent with their account.
    """
    # Basic cleanup of expired requests
    now = datetime.utcnow()
    expiry_cutoff = now - timedelta(minutes=PAIRING_TTL_MINUTES)
    expired_ids = [aid for aid, state in PAIRING_REQUESTS.items() if state.created_at < expiry_cutoff]
    for aid in expired_ids:
        code = PAIRING_REQUESTS[aid].pairing_code
        PAIRING_REQUESTS.pop(aid, None)
        PAIRING_CODE_INDEX.pop(code, None)

    # Generate a short pairing code: 4+4 hex segments (e.g., "A1B2-C3D4")
    raw = secrets.token_hex(4).upper()
    pairing_code = f"{raw[:4]}-{raw[4:]}"

    host = data.host
    if host == "auto" and req.client:
        host = req.client.host

    state = PairingRequestState(
        agent_id=data.agent_id,
        pairing_code=pairing_code,
        name=data.name,
        host=host,
        port=data.port,
        api_port=data.api_port,
        version=data.version,
        os_info=data.os_info,
        created_at=now,
    )
    PAIRING_REQUESTS[data.agent_id] = state
    PAIRING_CODE_INDEX[pairing_code] = data.agent_id

    return PairingStartResponse(pairing_code=pairing_code, agent_id=data.agent_id)


@router.post("/complete-pairing")
async def complete_pairing(
    body: CompletePairingRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Complete pairing for an agent using a pairing code.

    The logged-in user submits the pairing code from the Automation UI.
    This associates the agent with the user and creates/updates the DeviceAgent
    record. Agents can then poll pairing-status to know when pairing is done.
    """
    now = datetime.utcnow()
    agent_id = PAIRING_CODE_INDEX.get(body.pairing_code)
    if not agent_id:
        raise HTTPException(status_code=404, detail="Invalid or expired pairing code")

    state = PAIRING_REQUESTS.get(agent_id)
    if not state:
        raise HTTPException(status_code=404, detail="Pairing request not found")

    # Enforce TTL
    if state.created_at < now - timedelta(minutes=PAIRING_TTL_MINUTES):
        # Clean up
        PAIRING_REQUESTS.pop(agent_id, None)
        PAIRING_CODE_INDEX.pop(body.pairing_code, None)
        raise HTTPException(status_code=410, detail="Pairing code has expired")

    state.paired_user_id = user.id

    # Create or update DeviceAgent for this user/agent_id
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.agent_id == agent_id)
    )
    existing = result.scalars().first()

    if existing:
        existing.user_id = user.id
        existing.name = state.name
        existing.host = state.host
        existing.port = state.port
        existing.api_port = state.api_port
        existing.version = state.version
        existing.os_info = state.os_info
        existing.status = "online"
        existing.updated_at = now
        agent = existing
    else:
        agent = DeviceAgent(
            agent_id=agent_id,
            name=state.name,
            host=state.host,
            port=state.port,
            api_port=state.api_port,
            user_id=user.id,
            status="online",
            version=state.version,
            os_info=state.os_info,
            last_heartbeat=None,
            created_at=now,
            updated_at=now,
        )
        db.add(agent)

    await db.commit()
    await db.refresh(agent)

    return {"status": "paired", "agent_id": agent.agent_id}


@router.get("/pairing-status/{agent_id}", response_model=PairingStatusResponse)
async def get_pairing_status(agent_id: str) -> PairingStatusResponse:
    """Check pairing status for an agent (used by agent to know when user has paired it)."""
    state = PAIRING_REQUESTS.get(agent_id)
    if not state:
        return PairingStatusResponse(status="unknown")

    now = datetime.utcnow()
    if state.created_at < now - timedelta(minutes=PAIRING_TTL_MINUTES):
        return PairingStatusResponse(status="expired")

    if state.paired_user_id is not None:
        return PairingStatusResponse(status="paired")

    return PairingStatusResponse(status="pending")


@router.post("/{agent_id}/heartbeat")
async def agent_heartbeat(
    agent_id: str,
    data: AgentHeartbeatRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Receive heartbeat from agent and sync devices"""
    
    # Find agent
    result = await db.execute(
        select(DeviceAgent).where(
            DeviceAgent.agent_id == agent_id,
            DeviceAgent.user_id == user.id
        )
    )
    agent = result.scalars().first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
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
