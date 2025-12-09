"""
Logic strategies derivation plugin.

Derives decision-making strategies from personality traits.
Maps Big Five personality traits to strategic tendencies.

Example output:
    ["cautious", "analytical", "collaborative"]

The strategies are derived based on dominant personality traits:
- High openness -> "creative", "exploratory"
- High conscientiousness -> "methodical", "reliable"
- High extraversion -> "collaborative", "assertive"
- High agreeableness -> "diplomatic", "supportive"
- High neuroticism -> "cautious", "risk-averse"
"""

from typing import List, Optional

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult


class LogicStrategiesDerivation(BaseDerivationPlugin):
    """
    Computes decision-making strategies from personality traits.

    Uses Big Five personality model to derive strategic tendencies.
    Each trait above a threshold contributes one or more strategies.

    Configuration via world meta:
        world.meta.brain_config.plugins.logic_strategies = {
            "threshold": 60,  # Minimum trait value to trigger strategy
            "high_threshold": 75,  # Threshold for "strong" variants
        }
    """

    @property
    def id(self) -> str:
        return "logic_strategies"

    @property
    def name(self) -> str:
        return "Logic Strategies from Personality"

    @property
    def required_stats(self) -> List[str]:
        return []  # No hard requirements - adapts to what's available

    @property
    def optional_stats(self) -> List[str]:
        return ["personality"]

    @property
    def priority(self) -> int:
        return 30  # Run after mood derivations

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        # Try to get personality stats
        personality = context.stats.get("personality")
        if not personality:
            return None

        axes = personality.axes
        if not axes:
            return None

        # Get configuration
        plugin_cfg = context.get_plugin_config(self.id)
        threshold = plugin_cfg.get("threshold", 60)
        high_threshold = plugin_cfg.get("high_threshold", 75)

        strategies: List[str] = []

        # Map personality traits to strategies
        openness = axes.get("openness", 50)
        conscientiousness = axes.get("conscientiousness", 50)
        extraversion = axes.get("extraversion", 50)
        agreeableness = axes.get("agreeableness", 50)
        neuroticism = axes.get("neuroticism", 50)

        # High openness -> creative, exploratory
        if openness >= high_threshold:
            strategies.append("creative")
            strategies.append("exploratory")
        elif openness >= threshold:
            strategies.append("open-minded")

        # Low openness -> traditional, conservative
        if openness < 40:
            strategies.append("traditional")

        # High conscientiousness -> methodical, reliable
        if conscientiousness >= high_threshold:
            strategies.append("methodical")
            strategies.append("reliable")
        elif conscientiousness >= threshold:
            strategies.append("organized")

        # Low conscientiousness -> flexible, spontaneous
        if conscientiousness < 40:
            strategies.append("flexible")

        # High extraversion -> collaborative, assertive
        if extraversion >= high_threshold:
            strategies.append("collaborative")
            strategies.append("assertive")
        elif extraversion >= threshold:
            strategies.append("social")

        # Low extraversion -> independent, reflective
        if extraversion < 40:
            strategies.append("independent")
            strategies.append("reflective")

        # High agreeableness -> diplomatic, supportive
        if agreeableness >= high_threshold:
            strategies.append("diplomatic")
            strategies.append("supportive")
        elif agreeableness >= threshold:
            strategies.append("cooperative")

        # Low agreeableness -> competitive, direct
        if agreeableness < 40:
            strategies.append("competitive")
            strategies.append("direct")

        # High neuroticism -> cautious, risk-averse
        if neuroticism >= high_threshold:
            strategies.append("cautious")
            strategies.append("risk-averse")
        elif neuroticism >= threshold:
            strategies.append("vigilant")

        # Low neuroticism -> confident, steady
        if neuroticism < 40:
            strategies.append("confident")
            strategies.append("steady")

        # Add analytical if high openness + high conscientiousness
        if openness >= threshold and conscientiousness >= threshold:
            strategies.append("analytical")

        # Ensure at least one default strategy
        if not strategies:
            strategies.append("balanced")

        return DerivationResult(
            key="logic_strategies",
            value=strategies,
            metadata={
                "source": "personality",
                "threshold": threshold,
                "high_threshold": high_threshold,
            }
        )
