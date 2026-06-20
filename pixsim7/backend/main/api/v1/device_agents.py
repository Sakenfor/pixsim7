"""
Device Agent API endpoints

Handles registration and heartbeat from remote device agents.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel

from pixsim7.backend.main.infrastructure.database.session import get_automation_db
from pixsim7.automation.domain import DeviceAgent, AndroidDevice
from pixsim7.automation.services import (
    AgentNotFound,
    AgentPairingService,
    PairingCodeExpired,
    PairingCodeNotFound,
)
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
    db: AsyncSession = Depends(get_automation_db)
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
    
    now = datetime.now(timezone.utc)
    
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
    db: AsyncSession = Depends(get_automation_db),
) -> PairingStartResponse:
    """Start pairing flow for a remote agent (no auth required).

    Agent calls this to obtain a short-lived pairing code. The user then enters
    this code in the web UI to associate the agent with their account.
    """
    pairing_code = await AgentPairingService(db).request_pairing(
        agent_id=data.agent_id,
        name=data.name,
        host=data.host,
        port=data.port,
        api_port=data.api_port,
        version=data.version,
        os_info=data.os_info,
        client_host=req.client.host if req.client else None,
    )
    return PairingStartResponse(pairing_code=pairing_code, agent_id=data.agent_id)


@router.post("/complete-pairing", response_model=CompletePairingResponse)
async def complete_pairing(
    body: CompletePairingRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_automation_db),
) -> CompletePairingResponse:
    """Complete pairing for an agent using a pairing code.

    The logged-in user submits the pairing code from the Automation UI.
    This associates the agent with the user and creates/updates the DeviceAgent
    record. Agents can then poll pairing-status to know when pairing is done.
    """
    try:
        agent = await AgentPairingService(db).complete_pairing(
            pairing_code=body.pairing_code, user_id=user.id
        )
    except PairingCodeNotFound:
        raise HTTPException(status_code=404, detail="Invalid or expired pairing code")
    except PairingCodeExpired:
        raise HTTPException(status_code=410, detail="Pairing code has expired")

    return CompletePairingResponse(status="paired", agent_id=agent.agent_id)


@router.get("/pairing-status/{agent_id}", response_model=PairingStatusResponse)
async def get_pairing_status(
    agent_id: str,
    db: AsyncSession = Depends(get_automation_db)
) -> PairingStatusResponse:
    """Check pairing status for an agent (used by agent to know when user has paired it)."""
    status = await AgentPairingService(db).get_pairing_status(agent_id)
    return PairingStatusResponse(status=status)


@router.post("/{agent_id}/heartbeat")
async def agent_heartbeat(
    agent_id: str,
    data: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_automation_db)
):
    """Receive heartbeat from agent and sync devices.

    No authentication required - agent just needs to be registered/paired.
    The agent_id serves as the authentication mechanism for paired agents.
    """
    try:
        result = await AgentPairingService(db).sync_heartbeat(
            agent_id=agent_id, devices=data.devices
        )
    except AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found - complete pairing first")

    return {
        "status": "ok",
        "devices_synced": result.devices_synced,
        "timestamp": result.timestamp.isoformat(),
    }


@router.get("")
async def list_agents(
    user: CurrentUser,
    db: AsyncSession = Depends(get_automation_db)
):
    """List all agents for current user"""
    result = await db.execute(
        select(DeviceAgent).where(DeviceAgent.user_id == user.id)
    )
    agents = result.scalars().all()
    
    # Mark stale agents as offline
    now = datetime.now(timezone.utc)
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
    db: AsyncSession = Depends(get_automation_db)
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
    now = datetime.now(timezone.utc)

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
    db: AsyncSession = Depends(get_automation_db)
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
