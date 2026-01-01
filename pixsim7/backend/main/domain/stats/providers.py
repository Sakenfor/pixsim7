"""
Built-in Stat Definition Providers

Contains the default relationship stats provider and any other built-in
stat definitions. Plugins can add their own providers.
"""
from .registry import stat_definition_provider, StatDefinitionProvider
from .models import (
    StatDefinition,
    StatAxis,
    StatTier,
    StatLevel,
    StatCondition,
)


# =============================================================================
# Default Relationship Stats
# =============================================================================

@stat_definition_provider
class RelationshipStatsProvider(StatDefinitionProvider):
    """Default relationship stat definition.

    Provides the canonical relationship system with:
    - Axes: affinity, trust, chemistry, tension
    - Tiers: stranger, acquaintance, friend, close_friend, lover
    - Levels: light_flirt, deep_flirt, intimate, very_intimate, soulmates
    """
    definition_id = "relationships"

    def get_definition(self) -> StatDefinition:
        return StatDefinition(
            id="relationships",
            display_name="Relationships",
            description="NPC relationship tracking with affinity, trust, chemistry, and tension",
            axes=[
                StatAxis(
                    name="affinity",
                    min_value=0,
                    max_value=100,
                    default_value=0,
                    display_name="Affinity",
                    description="Overall fondness and attraction",
                    semantic_type="positive_sentiment",
                    semantic_weight=1.0,
                ),
                StatAxis(
                    name="trust",
                    min_value=0,
                    max_value=100,
                    default_value=0,
                    display_name="Trust",
                    description="Reliability and confidence",
                    semantic_type="trust_indicator",
                    semantic_weight=1.0,
                ),
                StatAxis(
                    name="chemistry",
                    min_value=0,
                    max_value=100,
                    default_value=0,
                    display_name="Chemistry",
                    description="Physical and emotional compatibility",
                    semantic_type="arousal_source",
                    semantic_weight=1.0,
                ),
                StatAxis(
                    name="tension",
                    min_value=0,
                    max_value=100,
                    default_value=0,
                    display_name="Tension",
                    description="Unresolved emotional energy",
                    semantic_type="negative_sentiment",
                    semantic_weight=1.0,
                ),
            ],
            tiers=[
                StatTier(id="stranger", axis_name="affinity", min=0, max=9.99),
                StatTier(id="acquaintance", axis_name="affinity", min=10, max=29.99),
                StatTier(id="friend", axis_name="affinity", min=30, max=59.99),
                StatTier(id="close_friend", axis_name="affinity", min=60, max=79.99),
                StatTier(id="lover", axis_name="affinity", min=80, max=None),
            ],
            levels=[
                StatLevel(
                    id="light_flirt",
                    conditions={
                        "affinity": StatCondition(type="min", min_value=20),
                        "chemistry": StatCondition(type="min", min_value=20),
                    },
                    priority=1,
                ),
                StatLevel(
                    id="deep_flirt",
                    conditions={
                        "affinity": StatCondition(type="min", min_value=40),
                        "chemistry": StatCondition(type="min", min_value=40),
                        "trust": StatCondition(type="min", min_value=20),
                    },
                    priority=2,
                ),
                StatLevel(
                    id="intimate",
                    conditions={
                        "affinity": StatCondition(type="min", min_value=60),
                        "chemistry": StatCondition(type="min", min_value=60),
                        "trust": StatCondition(type="min", min_value=40),
                    },
                    priority=3,
                ),
                StatLevel(
                    id="very_intimate",
                    conditions={
                        "affinity": StatCondition(type="min", min_value=80),
                        "chemistry": StatCondition(type="min", min_value=80),
                        "trust": StatCondition(type="min", min_value=60),
                    },
                    priority=4,
                ),
                StatLevel(
                    id="soulmates",
                    conditions={
                        "affinity": StatCondition(type="min", min_value=95),
                        "chemistry": StatCondition(type="min", min_value=95),
                        "trust": StatCondition(type="min", min_value=90),
                        "tension": StatCondition(type="max", max_value=10),
                    },
                    priority=5,
                ),
            ],
        )


# =============================================================================
# Default Intimacy Gating
# =============================================================================

# Note: Intimacy gating defaults are defined in models.py and applied
# when no world override is present. Plugins can provide alternative
# gating configurations by registering gating plugins.
