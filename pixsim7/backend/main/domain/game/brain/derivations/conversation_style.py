"""
Conversation Style derivation plugin.

Derives NPC conversation style from personality, relationships, and/or mood.
Delegates to the canonical implementation in domain/game/personality/conversation_style.py.

This plugin serves as a brain-engine adapter for the shared conversation style logic.
"""

from typing import List, Optional, Dict, Any

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult

# Import canonical conversation style logic
from pixsim7.backend.main.domain.game.personality import (
    derive_conversation_style,
    STYLE_THRESHOLDS,
)


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
                "enthusiastic": {"energy_gte": 70, "warmth_gte": 65},
                "playful": {"energy_gte": 60, "warmth_between": [40, 70]},
            },
            "affinity_thresholds": {
                "friendly": 40,
                "affectionate": 80,
            }
        }

    Note: This plugin uses the canonical conversation style logic from
    domain/game/personality/conversation_style.py. Custom thresholds
    can override the defaults but the core algorithm is shared.
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
        plugin_cfg = context.get_plugin_config(self.id)

        # Extract personality if available
        personality = None
        if "personality" in context.stats:
            personality = context.stats["personality"].axes

        # Extract relationship affinity if available
        affinity = None
        if "relationships" in context.stats:
            rel = context.stats["relationships"].axes
            affinity = rel.get("affinity", None)

        # Extract mood valence if available
        mood_valence = None
        mood = self._get_mood(context)
        if mood:
            mood_valence = mood.get("valence", None)

        # Build custom thresholds from plugin config
        custom_thresholds = None
        if "personality_thresholds" in plugin_cfg:
            # Merge plugin config with defaults
            custom_thresholds = {**STYLE_THRESHOLDS, **plugin_cfg["personality_thresholds"]}

        # Use canonical derivation logic
        result = derive_conversation_style(
            personality=personality,
            relationship_affinity=affinity,
            mood_valence=mood_valence,
            custom_thresholds=custom_thresholds,
        )

        # Build factors for metadata (for debugging/tracing)
        factors: Dict[str, Any] = {}
        if personality:
            factors["personality"] = {
                k: v for k, v in personality.items()
                if k in ["extraversion", "agreeableness", "openness", "conscientiousness"]
            }
        if affinity is not None:
            factors["affinity"] = affinity
        if mood_valence is not None:
            factors["mood_valence"] = mood_valence

        return DerivationResult(
            key="conversation_style",
            value=result["style"],
            metadata={
                "factors": factors,
                "dimensions": {
                    "warmth": result["warmth"],
                    "energy": result["energy"],
                    "formality": result["formality"],
                },
            }
        )

    def _get_mood(self, context: DerivationContext) -> Optional[Dict[str, Any]]:
        """Get mood from stats or derived values."""
        if "mood" in context.stats:
            return {"valence": context.stats["mood"].axes.get("valence", 50)}

        if "mood" in context.derived:
            derived_mood = context.derived["mood"]
            if isinstance(derived_mood, dict):
                return derived_mood

        return None
