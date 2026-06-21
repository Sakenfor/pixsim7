"""
Provider Accounts API Routes Plugin

Split into modules for better maintainability:
- accounts: Core CRUD operations
- accounts_auth: Authentication & session management (cookie import, re-auth, etc.)
- accounts_credits: Credit sync & status endpoints
- accounts_grants: Targeted slot sharing (grant account to a specific user)
- accounts_maintenance: Admin cleanups (deduplicate, cleanup state)
"""

from fastapi import APIRouter
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.accounts import router as accounts_router
from pixsim7.backend.main.api.v1.accounts_auth import router as auth_router
from pixsim7.backend.main.api.v1.accounts_credits import router as credits_router
from pixsim7.backend.main.api.v1.accounts_grants import router as grants_router
from pixsim7.backend.main.api.v1.accounts_maintenance import router as maintenance_router

# Combine all routers into one. Grants is mounted first so its literal
# `/accounts/grants/*` paths win over the `/accounts/{account_id}` matcher.
router = APIRouter()
router.include_router(grants_router)
router.include_router(accounts_router)
router.include_router(auth_router)
router.include_router(credits_router)
router.include_router(maintenance_router)

manifest = PluginManifest(
    id="accounts",
    name="Provider Accounts API",
    version="1.0.0",
    description="Provider account management (Pixverse, Sora, etc.)",
    author="PixSim Team",
    kind="route",
    service="generation",
    prefix="/api/v1",
    tags=["accounts"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
