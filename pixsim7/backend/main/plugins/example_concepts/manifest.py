"""
Example Concepts Plugin

Demonstrates the extensible action block concepts system:
1. Adds new poses, moods, and locations via vocabulary files (vocabularies/*.yaml)
2. Registers a custom scorer that boosts mysterious mood blocks
3. Shows how to use block extensions for metadata

Vocabulary files are auto-discovered from:
  plugins/example_concepts/vocabularies/
    - poses.yaml: standing_mysterious, leaning_mysterious
    - moods.yaml: mysterious, seductive
    - locations.yaml: secret_garden
    - scoring.yaml: plugin-specific scoring weights

This plugin serves as a reference implementation for extending action blocks.
"""

from typing import Any
from fastapi import APIRouter

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.domain.narrative.action_blocks.filters import BlockFilter
from pixsim7.backend.main.domain.narrative.action_blocks.scorers import BlockScorer
from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
    ActionBlock,
    ActionSelectionContext,
)


# =============================================================================
# PLUGIN MANIFEST
# =============================================================================

PLUGIN_ID = "example_concepts"

manifest = PluginManifest(
    id=PLUGIN_ID,
    name="Example Concepts Plugin",
    version="1.0.0",
    description=(
        "Demonstrates extensible action block concepts: "
        "adds mysterious mood/poses, custom scorer, and extension metadata"
    ),
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["example-concepts"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=["log:emit"],
)


# =============================================================================
# CUSTOM SCORER - Boosts blocks tagged with mysterious mood
# =============================================================================

class MysteriousMoodScorer(BlockScorer):
    """
    Example plugin scorer that boosts blocks with the 'mysterious' mood.

    This demonstrates how plugins can influence block selection by
    registering custom scorers with the plugin extension system.
    """

    def __init__(self, weight: float = 0.15, boost_amount: float = 1.0):
        """
        Args:
            weight: How much this scorer contributes to final score
            boost_amount: Score to give when mysterious mood matches
        """
        super().__init__(weight)
        self.boost_amount = boost_amount

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        """
        Score blocks based on mysterious mood.

        Returns:
            1.0 if block has mysterious mood
            0.8 if block has seductive mood (related)
            0.5 for generic blocks (no mood)
            0.3 for blocks with other moods
        """
        block_mood = block.tags.mood

        if block_mood == "mood:mysterious":
            return self.boost_amount

        if block_mood == "mood:seductive":
            return 0.8  # Related mood gets partial credit

        if block_mood is None:
            return 0.5  # Generic blocks get neutral score

        return 0.3  # Other moods get lower score

    @property
    def name(self) -> str:
        return f"{PLUGIN_ID}.MysteriousMoodScorer"


class ExtensionAwareScorer(BlockScorer):
    """
    Example scorer that reads plugin extension data from blocks.

    This demonstrates how scorers can use the extensions field to
    influence scoring based on plugin-specific metadata.
    """

    def __init__(self, weight: float = 0.1):
        super().__init__(weight)

    def score(self, block: ActionBlock, context: ActionSelectionContext) -> float:
        """
        Score based on plugin extension data.

        Looks for:
        - example_concepts.priority: float (0-1) boost factor
        - example_concepts.featured: bool flag
        """
        # Check block-level extensions
        priority = block.get_extension(PLUGIN_ID, "priority", 0.5)
        featured = block.get_extension(PLUGIN_ID, "featured", False)

        # Check tag-level extensions
        tag_boost = block.tags.get_extension(PLUGIN_ID, "boost", 0.0)

        base_score = float(priority)

        if featured:
            base_score = min(1.0, base_score + 0.3)

        if tag_boost:
            base_score = min(1.0, base_score + float(tag_boost))

        return base_score

    @property
    def name(self) -> str:
        return f"{PLUGIN_ID}.ExtensionAwareScorer"


# =============================================================================
# CUSTOM FILTER - Example of filtering based on extensions
# =============================================================================

class ExtensionEnabledFilter(BlockFilter):
    """
    Example filter that checks plugin extension data.

    Blocks can be disabled for this plugin by setting:
    extensions: {"example_concepts.enabled": false}
    """

    def filter(self, block: ActionBlock, context: ActionSelectionContext) -> bool:
        """
        Filter blocks based on extension-based enable flag.

        Returns True (pass) unless explicitly disabled.
        """
        enabled = block.get_extension(PLUGIN_ID, "enabled", True)
        return bool(enabled)

    @property
    def name(self) -> str:
        return f"{PLUGIN_ID}.ExtensionEnabledFilter"


# =============================================================================
# API ROUTER (minimal for demo)
# =============================================================================

router = APIRouter(prefix="/example-concepts", tags=["example-concepts"])


@router.get("/info")
async def get_plugin_info() -> dict[str, Any]:
    """Get information about this example plugin."""
    return {
        "plugin_id": PLUGIN_ID,
        "version": manifest.version,
        "description": manifest.description,
        "registered_concepts": {
            "poses": ["pose:standing_mysterious", "pose:leaning_mysterious"],
            "moods": ["mood:mysterious", "mood:seductive"],
            "locations": ["location:secret_garden"],
        },
        "registered_scorers": [
            "MysteriousMoodScorer",
            "ExtensionAwareScorer",
        ],
        "registered_filters": [
            "ExtensionEnabledFilter",
        ],
    }


@router.get("/demo-block")
async def get_demo_block() -> dict[str, Any]:
    """
    Return a demo ActionBlock JSON that uses plugin concepts and extensions.

    This shows how blocks can use the new concepts and extensions.
    """
    return {
        "id": "demo_mysterious_block",
        "kind": "single_state",
        "tags": {
            "location": "location:secret_garden",
            "pose": "pose:standing_mysterious",
            "mood": "mood:mysterious",
            "intimacy_level": "intimacy:deep_flirt",
            "content_rating": "romantic",
            "intensity": 6,
            "custom": ["moonlit", "dramatic"],
            # Plugin extensions in tags
            "extensions": {
                "example_concepts.boost": 0.2,
                "example_concepts.theme": "noir",
            },
        },
        "referenceImage": {
            "npc": None,
            "tags": ["mysterious", "silhouette"],
            "crop": "full_body",
        },
        "prompt": (
            "A mysterious figure stands in a moonlit secret garden, "
            "their silhouette partially obscured by shadows. "
            "The atmosphere is enigmatic and alluring."
        ),
        "negativePrompt": "harsh lighting, daytime, crowd",
        "style": "soft_cinema",
        "durationSec": 7.0,
        "compatibleNext": ["demo_reveal_block"],
        "compatiblePrev": ["demo_approach_block"],
        "description": "Demo block showcasing plugin concepts",
        # Block-level extensions
        "extensions": {
            "example_concepts.priority": 0.8,
            "example_concepts.featured": True,
        },
    }


# =============================================================================
# LIFECYCLE HOOKS
# =============================================================================

def on_load(app):
    """Called when plugin is loaded (before app starts)."""
    import pixsim_logging

    logger = pixsim_logging.get_logger()
    logger.info(
        "example_concepts_plugin_loaded",
        version=manifest.version,
    )

    # Register custom scorers and filters with the plugin extension system
    try:
        from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
            register_block_filter,
            register_block_scorer,
            register_extension_validator,
        )

        # Register mysterious mood scorer
        register_block_scorer(
            MysteriousMoodScorer(weight=0.15),
            plugin_id=PLUGIN_ID,
            priority=10,  # Higher priority = runs earlier
        )

        # Register extension-aware scorer
        register_block_scorer(
            ExtensionAwareScorer(weight=0.10),
            plugin_id=PLUGIN_ID,
            priority=5,
        )

        # Register extension-based filter
        register_block_filter(
            ExtensionEnabledFilter(),
            plugin_id=PLUGIN_ID,
            priority=0,
        )

        # Register extension validator
        def validate_priority(value: Any) -> bool:
            """Validate priority is a float between 0 and 1."""
            if not isinstance(value, (int, float)):
                return False
            return 0 <= float(value) <= 1

        register_extension_validator(
            validate_priority,
            plugin_id=PLUGIN_ID,
            namespace=f"{PLUGIN_ID}.priority",
            description="Priority must be a float between 0 and 1",
        )

        logger.info(
            "example_concepts_extensions_registered",
            scorers=2,
            filters=1,
            validators=1,
        )

    except ImportError as e:
        logger.warning(
            "example_concepts_extension_registration_failed",
            error=str(e),
        )
    except Exception as e:
        logger.error(
            "example_concepts_extension_registration_error",
            error=str(e),
        )


async def on_enable():
    """Called when plugin is enabled (after app starts)."""
    import pixsim_logging

    logger = pixsim_logging.get_logger()
    logger.info("example_concepts_plugin_enabled")


async def on_disable():
    """Called when plugin is disabled."""
    import pixsim_logging

    logger = pixsim_logging.get_logger()
    logger.info("example_concepts_plugin_disabled")

    # Clean up registered extensions
    try:
        from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
            get_plugin_extensions,
        )

        get_plugin_extensions().clear_plugin(PLUGIN_ID)
        logger.info("example_concepts_extensions_cleared")

    except Exception as e:
        logger.warning(
            "example_concepts_extension_cleanup_failed",
            error=str(e),
        )
