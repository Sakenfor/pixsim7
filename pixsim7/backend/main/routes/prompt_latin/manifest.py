"""Latin enhancer composer routes plugin manifest."""

from pixsim7.backend.main.api.v1.prompt_latin import router
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="prompt_latin",
    name="Latin Enhancer Composer API",
    version="1.0.0",
    description="Length-controlled cross-pack picker for latin.enhancer block variants",
    author="PixSim Team",
    kind="route",
    service="content",
    prefix="/api/v1",
    tags=["prompts", "latin-enhancer"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
