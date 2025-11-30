"""
Provider Accounts API Routes Plugin

Split into three modules for better maintainability:
- accounts: Core CRUD operations
- accounts_auth: Authentication & session management (cookie import, re-auth, etc.)
- accounts_credits: Credit sync & status endpoints
"""

from fastapi import APIRouter
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.accounts import router as accounts_router
from pixsim7.backend.main.api.v1.accounts_auth import router as auth_router
from pixsim7.backend.main.api.v1.accounts_credits import router as credits_router

# Combine all routers into one
router = APIRouter()
router.include_router(accounts_router)
router.include_router(auth_router)
router.include_router(credits_router)

manifest = PluginManifest(
    id="accounts",
    name="Provider Accounts API",
    version="1.0.0",
    description="Provider account management (Pixverse, Sora, etc.)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["accounts"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
