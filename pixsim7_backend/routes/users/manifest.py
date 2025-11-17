"""
Users API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.users import router

manifest = PluginManifest(
    id="users",
    name="Users API",
    version="1.0.0",
    description="User management endpoints (profile, preferences, usage)",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["users"],
    dependencies=["auth"],  # Depends on auth for CurrentUser
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
