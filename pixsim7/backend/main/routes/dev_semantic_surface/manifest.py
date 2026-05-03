"""Dev Semantic Surface API Routes Plugin."""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_semantic_surface import router

manifest = PluginManifest(
    id="dev_semantic_surface",
    name="Dev Semantic Surface API",
    version="1.0.0",
    description="Read-only views over the prompt/asset semantic surface (coverage matrix, concept browser, tag tracer).",
    author="PixSim Team",
    kind="route",
    service="devtools",
    prefix="",
    tags=["dev", "semantic-surface"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
