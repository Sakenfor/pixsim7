"""
Game Meta Contract Routes Plugin

Machine-readable game authoring/bootstrapping contract for AI agents.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_meta import router

manifest = PluginManifest(
    id="game_meta",
    name="Game Meta Contract API",
    version="1.0.0",
    description="Canonical game authoring contract surface for API/AI-agent workflows",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game",
    tags=["game-meta", "contracts"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
