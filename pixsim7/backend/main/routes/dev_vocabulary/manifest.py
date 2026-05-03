"""Dev Vocabulary API Routes Plugin."""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_vocabulary import router

manifest = PluginManifest(
    id="dev_vocabulary",
    name="Dev Vocabulary API",
    version="1.0.0",
    description="Review surface for parser-harvested vocabulary candidates (list/stats/propose/review).",
    author="PixSim Team",
    kind="route",
    service="devtools",
    prefix="",
    tags=["dev", "vocabulary"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
