"""
Conversation Style derivation plugin.

Derives NPC conversation style from personality, relationships, and/or mood.
Adapts to whatever stats are available.
"""

from typing import List, Optional, Dict, Any

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult


class ConversationStyleDerivation(BaseDerivationPlugin):
    """
    Derives NPC conversation style from personality and/or relationships.

    Adapts to available stats - uses personality if present,
    falls back to relationships, considers mood as modifier.

    Output is a style string like:
    - "enthusiastic", "playful", "warm", "friendly"
    - "reserved", "curt", "distant"
    - "affectionate", "flirty" (high affinity modifiers)
    - "subdued" (low mood modifier)
    - "neutral" (fallback)

    Configurable via world meta:
        world.meta.brain_config.plugins.conversation_style = {
            "personality_thresholds": {
                "enthusiastic": {"extraversion": 70, "agreeableness": 60},
                "playful": {"extraversion": 60, "openness": 70},
            },
            "affinity_thresholds": {
                "friendly": 40,
                "affectionate": 80,
            }
        }
    """

    @property
    def id(self) -> str:
        return "conversation_style"

    @property
    def name(self) -> str:
        return "Conversation Style"

    @property
    def required_stats(self) -> List[str]:
        return []  # Adapts to what's available

    @property
    def optional_stats(self) -> List[str]:
        return ["personality", "relationships", "mood"]

    @property
    def priority(self) -> int:
        return 20

    @property
    def depends_on(self) -> List[str]:
        return ["mood_from_relationships"]

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        style = "neutral"
        factors: Dict[str, Any] = {}

        plugin_cfg = context.get_plugin_config(self.id)

        # Personality-based style
        if "personality" in context.stats:
            p = context.stats["personality"].axes
            extraversion = p.get("extraversion", 50)
            agreeableness = p.get("agreeableness", 50)
            openness = p.get("openness", 50)

            factors["personality"] = {
                "extraversion": extraversion,
                "agreeableness": agreeableness,
                "openness": openness,
            }

            # Check custom thresholds or use defaults
            thresholds = plugin_cfg.get("personality_thresholds", {})

            if thresholds:
                style = self._match_personality_thresholds(p, thresholds, style)
            else:
                # Default personality logic
                if extraversion >= 70 and agreeableness >= 60:
                    style = "enthusiastic"
                elif extraversion >= 60 and openness >= 70:
                    style = "playful"
                elif agreeableness >= 70:
                    style = "warm"
                elif extraversion <= 30:
                    style = "reserved"
                elif agreeableness <= 30:
                    style = "curt"

        # Relationship modifier
        if "relationships" in context.stats:
            rel = context.stats["relationships"].axes
            affinity = rel.get("affinity", 0)
            factors["affinity"] = affinity

            affinity_thresholds = plugin_cfg.get("affinity_thresholds", {
                "distant": 20,
                "friendly": 40,
                "affectionate": 80,
                "flirty": 80,
            })

            if affinity <= affinity_thresholds.get("distant", 20):
                style = "distant"
            elif affinity >= affinity_thresholds.get("affectionate", 80):
                # High affinity upgrades existing style
                if style == "warm":
                    style = "affectionate"
                elif style == "playful":
                    style = "flirty"
                elif style == "neutral":
                    style = "affectionate"
            elif affinity >= affinity_thresholds.get("friendly", 40) and style == "neutral":
                style = "friendly"

        # Mood modifier
        mood = self._get_mood(context)
        if mood:
            valence = mood.get("valence", 50)
            factors["mood_valence"] = valence

            mood_threshold = plugin_cfg.get("subdued_mood_threshold", 30)
            if valence <= mood_threshold and style not in ["distant", "curt"]:
                style = "subdued"

        return DerivationResult(
            key="conversation_style",
            value=style,
            metadata={"factors": factors}
        )

    def _match_personality_thresholds(
        self,
        personality: Dict[str, float],
        thresholds: Dict[str, Dict[str, float]],
        default_style: str,
    ) -> str:
        """Match personality against custom threshold configs."""
        for style_name, requirements in thresholds.items():
            matches = True
            for axis, threshold in requirements.items():
                if personality.get(axis, 50) < threshold:
                    matches = False
                    break
            if matches:
                return style_name
        return default_style

    def _get_mood(self, context: DerivationContext) -> Optional[Dict[str, Any]]:
        """Get mood from stats or derived values."""
        if "mood" in context.stats:
            return {"valence": context.stats["mood"].axes.get("valence", 50)}

        if "mood" in context.derived:
            derived_mood = context.derived["mood"]
            if isinstance(derived_mood, dict):
                return derived_mood

        return None
