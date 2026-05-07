"""Diagnostic Tests Routes.

Mounts ``api.v1.dev_testing_diagnostics`` under /api/v1.  Final paths land
under /api/v1/dev/testing/diagnostics/...  See
``api/v1/dev_testing_diagnostics.py`` for the route surface.

Sister plugin to ``routes/dev_testing`` (the read-only pytest catalog).
"""

from pixsim7.backend.main.api.v1.dev_testing_diagnostics import router
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="diagnostics",
    name="Diagnostic Tests",
    version="1.0.0",
    description="Admin-only async diagnostic runner with live WS event stream",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["dev", "testing", "diagnostics"],
    dependencies=["admin"],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=["admin:routes"],
)
