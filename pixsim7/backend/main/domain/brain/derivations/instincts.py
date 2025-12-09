"""
Instincts derivation plugin.

Derives base drives and archetypes from personality traits and resources.

Instincts are fundamental motivations that influence NPC behavior:
- survive: Self-preservation drive (from low resources or high neuroticism)
- socialize: Connection-seeking drive (from high extraversion/agreeableness)
- explore: Novelty-seeking drive (from high openness)
- achieve: Goal-oriented drive (from high conscientiousness)
- protect: Guardian drive (from high agreeableness + trust)
- compete: Dominance-seeking drive (from low agreeableness + high extraversion)

Example output:
    ["survive", "socialize", "explore"]
"""

from typing import List, Optional

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult


class InstinctsDerivation(BaseDerivationPlugin):
    """
    Computes base instincts from personality traits and resources.

    Instincts are always-present drives that influence behavior priorities.
    Unlike strategies (which are decision approaches), instincts represent
    what the NPC fundamentally wants.

    Configuration via world meta:
        world.meta.brain_config.plugins.instincts = {
            "trait_threshold": 55,  # Minimum trait value
            "resource_critical_threshold": 30,  # Resources below this trigger "survive"
        }
    """

    @property
    def id(self) -> str:
        return "instincts"

    @property
    def name(self) -> str:
        return "Instincts from Personality"

    @property
    def required_stats(self) -> List[str]:
        return []  # No hard requirements - adapts to what's available

    @property
    def optional_stats(self) -> List[str]:
        return ["personality", "resources", "relationships"]

    @property
    def priority(self) -> int:
        return 25  # Run before logic strategies

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        # Get configuration
        plugin_cfg = context.get_plugin_config(self.id)
        trait_threshold = plugin_cfg.get("trait_threshold", 55)
        resource_critical = plugin_cfg.get("resource_critical_threshold", 30)

        instincts: List[str] = []

        # Check personality for instincts
        personality = context.stats.get("personality")
        if personality:
            axes = personality.axes

            openness = axes.get("openness", 50)
            conscientiousness = axes.get("conscientiousness", 50)
            extraversion = axes.get("extraversion", 50)
            agreeableness = axes.get("agreeableness", 50)
            neuroticism = axes.get("neuroticism", 50)

            # Explore: driven by high openness
            if openness >= trait_threshold:
                instincts.append("explore")

            # Achieve: driven by high conscientiousness
            if conscientiousness >= trait_threshold:
                instincts.append("achieve")

            # Socialize: driven by high extraversion or agreeableness
            if extraversion >= trait_threshold or agreeableness >= trait_threshold:
                instincts.append("socialize")

            # Compete: driven by low agreeableness + high extraversion
            if agreeableness < 45 and extraversion >= trait_threshold:
                instincts.append("compete")

            # Protect: driven by high agreeableness
            if agreeableness >= 65:
                instincts.append("protect")

            # Survive (from neuroticism): high neuroticism triggers survival focus
            if neuroticism >= 70:
                instincts.append("survive")

        # Check resources for survival instinct
        resources = context.stats.get("resources")
        if resources:
            # Check if any resource is critical
            energy = resources.axes.get("energy", 100)
            hunger = resources.axes.get("hunger", 100)
            health = resources.axes.get("health", 100)

            if energy < resource_critical or hunger < resource_critical or health < resource_critical:
                if "survive" not in instincts:
                    instincts.insert(0, "survive")  # Survival first

        # Check relationships for social instincts
        relationships = context.stats.get("relationships")
        if relationships:
            affinity = relationships.axes.get("affinity", 50)
            trust = relationships.axes.get("trust", 50)

            # Strong bonds enhance protect instinct
            if affinity >= 70 and trust >= 60:
                if "protect" not in instincts:
                    instincts.append("protect")

        # Ensure at least one base instinct
        if not instincts:
            # Default instincts for balanced personality
            instincts = ["survive", "socialize"]

        return DerivationResult(
            key="instincts",
            value=instincts,
            metadata={
                "trait_threshold": trait_threshold,
                "resource_critical": resource_critical,
            }
        )
