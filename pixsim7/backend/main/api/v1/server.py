"""
Server Info Endpoint

Provides public server identity and metadata for multi-server support.
Clients use this to identify servers and manage connections to multiple instances.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from pixsim7.backend.main.shared.config import settings


router = APIRouter(prefix="/server", tags=["server"])


class ServerInfo(BaseModel):
    """Public server identity information."""
    server_id: str
    server_name: str
    server_description: str
    version: str
    api_version: str


@router.get("/info", response_model=ServerInfo)
async def get_server_info() -> ServerInfo:
    """
    Get public server identity information.

    This endpoint is used by clients to:
    - Identify the server they're connected to
    - Display server name in multi-server UI
    - Store server metadata for account linking

    No authentication required - this is public metadata.
    """
    return ServerInfo(
        server_id=settings.server_id,
        server_name=settings.server_name,
        server_description=settings.server_description,
        version=settings.api_version,
        api_version="v1",
    )
