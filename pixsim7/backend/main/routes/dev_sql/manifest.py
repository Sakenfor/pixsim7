"""
SQL Query Explorer API Routes Plugin

Dev tool for running read-only SQL queries against the database.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_sql import router

manifest = PluginManifest(
    id="dev_sql",
    name="SQL Query Explorer",
    version="1.0.0",
    description="Interactive SQL query explorer for diagnostics and data exploration",
    author="PixSim Team",
    kind="route",
    prefix="",  # Empty prefix normalizes to /api/v1
    tags=["dev", "sql", "diagnostics", "admin"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,

    # Admin-level access required
    permissions=["admin:read"],
)
