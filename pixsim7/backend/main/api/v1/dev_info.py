"""
Service Info Endpoint

Provides metadata about this backend service for discovery.
Used by the launcher and other services to discover capabilities.
"""
from fastapi import APIRouter
from typing import List, Dict, Any
import os

from pixsim7.backend.main.shared.config import settings

router = APIRouter(prefix="/dev/info", tags=["dev"])


@router.get("", response_model=Dict[str, Any])
async def get_service_info():
    """
    Get service metadata for discovery.

    This endpoint allows the launcher and other services to:
    - Discover this service's capabilities
    - Find available endpoints
    - Understand dependencies
    - Learn what features this service provides

    Returns:
        Service metadata including ID, name, version, endpoints, and capabilities
    """

    # Read port from environment
    port = int(os.getenv("BACKEND_PORT", settings.port))

    return {
        "service_id": "main-api",
        "name": "PixSim7 Main API",
        "version": settings.api_version,
        "type": "backend",
        "port": port,

        # Service endpoints
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json",
            "architecture": "/dev/architecture/map",
            "info": "/dev/info",
        },

        # What this service provides (high-level capabilities)
        "provides": [
            "game",           # Game sessions, worlds, NPCs
            "users",          # User management, auth
            "assets",         # Asset management
            "generations",    # AI generation (for now - will split later)
            "prompts",        # Prompt management
            "admin",          # Admin operations
            "automation",     # Automation tasks
            "dialogue",       # NPC dialogue
            "actions",        # Action blocks
        ],

        # What this service depends on
        "dependencies": [
            "db",            # PostgreSQL database
            "redis",         # Redis cache (optional)
        ],

        # Service categorization
        "tags": ["core", "api", "game", "monolith"],

        # Environment info
        "environment": {
            "debug": settings.debug,
            "host": settings.host,
            "port": port,
            "database_url": "postgresql://..." if settings.database_url else None,  # Sanitized
        },

        # Future: links to related services when we split
        "related_services": [],

        # Architecture metadata
        "architecture": {
            "pattern": "clean-architecture",
            "layers": ["routes", "plugin-context", "capabilities", "domain", "orm"],
            "features": [
                "plugin-system",
                "capability-apis",
                "permission-based-access",
                "service-composition",
            ],
        },
    }
