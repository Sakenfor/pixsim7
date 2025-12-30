"""
Personality Plugin - Self-Contained Backend

Provides personality-driven NPC behavior including:
- Tag effects (uncomfortable, comfortable, phobia, passion, etc.)
- Behavior profiles (low_energy, evening_wind_down, seeking_comfort)
- Big Five trait effect mappings (uses canonical traits from domain/game/personality)

This plugin lives in packages/plugins/personality/ with:
- backend/: Python backend (this directory)
- shared/types.ts: TypeScript types (if needed)

Uses the behavior_registry for registration.
Trait definitions come from pixsim7.backend.main.domain.game.personality (single source of truth).
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.domain.game.personality import (
    PersonalityTrait,
    PERSONALITY_TRAIT_NAMES,
    TRAIT_ALIASES,
)

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="personality",
    name="Personality System",
    version="1.0.0",
    description="Personality-driven NPC behavior with Big Five traits, tag effects, and behavior profiles",
    author="PixSim Team",
    kind="behavior",  # Behavior extension plugin
    provides=["behavior_profiles", "behavior_traits", "tag_effects"],
    prefix="/api/v1",
    tags=["personality", "behavior", "npc"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[
        "behavior:extend_conditions",
    ],
)


# ===== TAG EFFECTS =====

TAG_EFFECTS = [
    {
        "tag_id": "uncomfortable",
        "default_multiplier": 0.3,
        "description": "Mild aversion - 70% penalty (overridable per-archetype)",
        "priority": 100,
    },
    {
        "tag_id": "comfortable",
        "default_multiplier": 1.5,
        "description": "Mild preference - 50% bonus (overridable per-archetype)",
        "priority": 100,
    },
    {
        "tag_id": "phobia",
        "default_multiplier": 0.05,
        "description": "Strong aversion - 95% penalty (almost never chosen)",
        "priority": 50,
    },
    {
        "tag_id": "passion",
        "default_multiplier": 2.5,
        "description": "Strong preference - 150% bonus (heavily favored)",
        "priority": 50,
    },
    {
        "tag_id": "addiction",
        "default_multiplier": 3.0,
        "description": "Compulsive preference - 200% bonus (hard to resist)",
        "priority": 25,
    },
    {
        "tag_id": "trauma",
        "default_multiplier": 0.01,
        "description": "Severe aversion - 99% penalty (avoided at all costs)",
        "priority": 25,
    },
    {
        "tag_id": "neutral",
        "default_multiplier": 1.0,
        "description": "No effect - baseline",
        "priority": 1000,
    },
]


# ===== BEHAVIOR PROFILES =====

BEHAVIOR_PROFILES = [
    {
        "profile_id": "plugin:personality:low_energy",
        "name": "Low Energy",
        "conditions": [
            {"type": "energy", "max_energy": 30},
        ],
        "modifiers": {
            "categoryWeights": {"rest": 2.0, "sleep": 2.5},
            "activityWeights": {"nap": 1.8, "relax": 1.5},
        },
        "priority": 50,
        "description": "Boosts rest activities when energy is low",
        "tags": ["energy", "automatic"],
    },
    {
        "profile_id": "plugin:personality:evening_wind_down",
        "name": "Evening Wind-Down",
        "conditions": [
            {"type": "time_window", "windows": ["evening", "night"]},
        ],
        "modifiers": {
            "categoryWeights": {"social": 1.2, "leisure": 1.3, "work": 0.7},
        },
        "priority": 75,
        "description": "Reduces work activities in evening, boosts leisure",
        "tags": ["time", "automatic"],
    },
    {
        "profile_id": "plugin:personality:seeking_comfort",
        "name": "Seeking Comfort",
        "conditions": [
            {"type": "mood", "max_valence": -20},
        ],
        "modifiers": {
            "categoryWeights": {"comfort": 1.8, "social": 0.6},
            "tagEffects": {"comforting": 2.0},
        },
        "priority": 60,
        "description": "Seeks comforting activities when feeling down",
        "tags": ["mood", "automatic"],
    },
]


# ===== TRAIT EFFECT MAPPINGS (Big Five) =====
# These mappings connect personality traits to activity preferences.
# Trait IDs use canonical names from domain/game/personality/traits.py.
# "introversion" is an alias for "extraversion" (inverse interpretation).

# Validate that all trait keys are canonical or known aliases
def _validate_trait_id(trait_id: str) -> str:
    """Validate trait ID is canonical or a known alias."""
    if trait_id in PERSONALITY_TRAIT_NAMES:
        return trait_id
    if trait_id in TRAIT_ALIASES:
        return trait_id  # Aliases are valid, interpretation handled at runtime
    raise ValueError(f"Unknown trait ID: {trait_id}. Valid: {PERSONALITY_TRAIT_NAMES}")


TRAIT_EFFECT_MAPPINGS = {
    # Note: "introversion" is treated as inverse of extraversion
    # High introversion = low extraversion preferences
    "introversion": {
        "canonical_trait": PersonalityTrait.EXTRAVERSION.value,
        "inverse": True,  # High introversion = low extraversion
        "description": "How introversion affects social vs solitary activity preferences",
        "mappings": {
            "very_high": [
                {"type": "activity_preference", "tags": ["solitary", "reading", "crafting"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"social": "very_low", "solitary": "very_high"}},
            ],
            "high": [
                {"type": "activity_preference", "tags": ["solitary", "small_group"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"social": "low", "solitary": "high"}},
            ],
            "low": [
                {"type": "activity_preference", "tags": ["social", "group_activities"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"social": "high", "solitary": "low"}},
            ],
            "very_low": [
                {"type": "activity_preference", "tags": ["parties", "crowds", "networking"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"social": "very_high", "solitary": "very_low"}},
            ],
        },
    },
    PersonalityTrait.OPENNESS.value: {
        "canonical_trait": PersonalityTrait.OPENNESS.value,
        "inverse": False,
        "description": "How openness affects creative vs routine activity preferences",
        "mappings": {
            "very_high": [
                {"type": "activity_preference", "tags": ["creative", "novel", "exploration"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"creative": "very_high", "routine": "low"}},
            ],
            "high": [
                {"type": "activity_preference", "tags": ["learning", "art", "travel"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"creative": "high"}},
            ],
            "low": [
                {"type": "activity_preference", "tags": ["familiar", "routine"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"routine": "high", "novel": "low"}},
            ],
            "very_low": [
                {"type": "activity_preference", "tags": ["traditional", "conventional"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"routine": "very_high", "novel": "very_low"}},
            ],
        },
    },
    PersonalityTrait.NEUROTICISM.value: {
        "canonical_trait": PersonalityTrait.NEUROTICISM.value,
        "inverse": False,
        "description": "How neuroticism affects risk-taking and comfort-seeking",
        "mappings": {
            "very_high": [
                {"type": "activity_preference", "tags": ["stressful", "risky"], "modifier": "avoided"},
                {"type": "activity_preference", "tags": ["safe", "comforting"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"risky": "very_low", "comfort": "very_high"}},
            ],
            "high": [
                {"type": "activity_preference", "tags": ["challenging"], "modifier": "uncomfortable"},
                {"type": "activity_preference", "tags": ["relaxing"], "modifier": "comfortable"},
            ],
            "low": [
                {"type": "activity_preference", "tags": ["challenging", "adventure"], "modifier": "comfortable"},
            ],
            "very_low": [
                {"type": "activity_preference", "tags": ["thrill", "risk"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"risky": "high"}},
            ],
        },
    },
    PersonalityTrait.CONSCIENTIOUSNESS.value: {
        "canonical_trait": PersonalityTrait.CONSCIENTIOUSNESS.value,
        "inverse": False,
        "description": "How conscientiousness affects work vs leisure preferences",
        "mappings": {
            "very_high": [
                {"type": "activity_preference", "tags": ["work", "productive", "organized"], "modifier": "preferred"},
                {"type": "category_weight", "categories": {"work": "very_high", "leisure": "low"}},
            ],
            "high": [
                {"type": "activity_preference", "tags": ["structured", "planned"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"work": "high"}},
            ],
            "low": [
                {"type": "activity_preference", "tags": ["spontaneous", "flexible"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"leisure": "high", "work": "low"}},
            ],
            "very_low": [
                {"type": "activity_preference", "tags": ["impulsive", "unplanned"], "modifier": "comfortable"},
                {"type": "category_weight", "categories": {"leisure": "very_high", "work": "very_low"}},
            ],
        },
    },
    PersonalityTrait.AGREEABLENESS.value: {
        "canonical_trait": PersonalityTrait.AGREEABLENESS.value,
        "inverse": False,
        "description": "How agreeableness affects cooperative vs competitive preferences",
        "mappings": {
            "very_high": [
                {"type": "activity_preference", "tags": ["helping", "cooperative", "nurturing"], "modifier": "preferred"},
                {"type": "activity_preference", "tags": ["competitive", "confrontational"], "modifier": "avoided"},
            ],
            "high": [
                {"type": "activity_preference", "tags": ["teamwork", "sharing"], "modifier": "comfortable"},
            ],
            "low": [
                {"type": "activity_preference", "tags": ["competitive", "independent"], "modifier": "comfortable"},
            ],
            "very_low": [
                {"type": "activity_preference", "tags": ["competitive", "confrontational"], "modifier": "comfortable"},
                {"type": "activity_preference", "tags": ["cooperative"], "modifier": "uncomfortable"},
            ],
        },
    },
}


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

    logger = configure_logging("plugin.personality")
    logger.info("Personality plugin loading (v1.0.0)")

    # Register tag effects
    tag_count = 0
    for tag in TAG_EFFECTS:
        success = behavior_registry.register_tag_effect(
            tag_id=tag["tag_id"],
            plugin_id="personality",
            default_multiplier=tag["default_multiplier"],
            description=tag.get("description"),
            priority=tag.get("priority", 100),
        )
        if success:
            tag_count += 1

    logger.info(f"Registered {tag_count} tag effects")

    # Register behavior profiles
    profile_count = 0
    for profile in BEHAVIOR_PROFILES:
        success = behavior_registry.register_behavior_profile(
            profile_id=profile["profile_id"],
            plugin_id="personality",
            name=profile["name"],
            conditions=profile["conditions"],
            modifiers=profile["modifiers"],
            priority=profile.get("priority", 100),
            description=profile.get("description"),
            tags=profile.get("tags"),
        )
        if success:
            profile_count += 1

    logger.info(f"Registered {profile_count} behavior profiles")

    # Register trait effect mappings
    trait_count = 0
    for trait_id, config in TRAIT_EFFECT_MAPPINGS.items():
        success = behavior_registry.register_trait_effect_mapping(
            trait_id=trait_id,
            plugin_id="personality",
            mappings=config["mappings"],
            description=config.get("description"),
        )
        if success:
            trait_count += 1

    logger.info(f"Registered {trait_count} trait effect mappings (Big Five)")

    logger.info(
        f"Personality plugin loaded: "
        f"tags={tag_count}, profiles={profile_count}, traits={trait_count}"
    )


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.personality")
    logger.info("Personality plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.personality")
    logger.info("Personality plugin disabled")
