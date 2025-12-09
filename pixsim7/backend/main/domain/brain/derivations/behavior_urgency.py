"""
Behavior Urgency derivation plugin.

Computes urgency scores for behavior/activity selection from
resources, drives, and/or mood stats.
"""

from typing import List, Optional, Dict, Any

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult


class BehaviorUrgencyDerivation(BaseDerivationPlugin):
    """
    Computes behavior urgency scores from resources and/or drives.

    Used by behavior engine to weight activity selection.
    Adapts to whatever resource/drive stats are available.

    Output structure:
        {
            "rest": 70,        # From low energy
            "eat": 30,         # From low hunger
            "relax": 50,       # From high stress
            "socialize": 60,   # From social drive
            "explore": 40,     # From novelty drive
            "achieve": 55,     # From achievement drive
            "mood_boost": 20,  # From low mood valence
        }

    Configurable via world meta:
        world.meta.brain_config.plugins.behavior_urgency = {
            "resource_mappings": {
                "rest": {"source": "energy", "inverted": true},
                "eat": {"source": "hunger", "inverted": true},
            },
            "drive_mappings": {
                "socialize": "social",
                "explore": "novelty",
            }
        }
    """

    @property
    def id(self) -> str:
        return "behavior_urgency"

    @property
    def name(self) -> str:
        return "Behavior Urgency Scores"

    @property
    def required_stats(self) -> List[str]:
        return []  # No hard requirements - adapts to what's available

    @property
    def optional_stats(self) -> List[str]:
        return ["resources", "drives", "mood"]

    @property
    def priority(self) -> int:
        return 30  # Runs after mood derivations

    @property
    def depends_on(self) -> List[str]:
        return ["mood_from_relationships"]  # Use derived mood if available

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        urgency: Dict[str, float] = {}
        sources_used: List[str] = []

        plugin_cfg = context.get_plugin_config(self.id)

        # From resources (if available)
        if "resources" in context.stats:
            sources_used.append("resources")
            res = context.stats["resources"].axes

            resource_mappings = plugin_cfg.get("resource_mappings", {
                "rest": {"source": "energy", "inverted": True},
                "eat": {"source": "hunger", "inverted": True},
                "relax": {"source": "stress", "inverted": False},
            })

            for urgency_key, mapping in resource_mappings.items():
                source_axis = mapping.get("source", urgency_key)
                inverted = mapping.get("inverted", False)
                value = res.get(source_axis)

                if value is not None:
                    if inverted:
                        urgency[urgency_key] = max(0, 100 - value)
                    else:
                        urgency[urgency_key] = value

        # From drives (if available) - drives are already urgency values
        if "drives" in context.stats:
            sources_used.append("drives")
            drives = context.stats["drives"].axes

            drive_mappings = plugin_cfg.get("drive_mappings", {
                "socialize": "social",
                "explore": "novelty",
                "achieve": "achievement",
                "rest_need": "rest",
                "autonomy_need": "autonomy",
                "safety_need": "safety",
            })

            for urgency_key, drive_axis in drive_mappings.items():
                value = drives.get(drive_axis)
                if value is not None:
                    urgency[urgency_key] = value

        # From mood (stat or derived)
        mood = self._get_mood(context)
        if mood:
            sources_used.append("mood")
            valence = mood.get("valence", 50)
            # Low valence = higher urgency to do mood-boosting activities
            mood_boost_threshold = plugin_cfg.get("mood_boost_threshold", 70)
            urgency["mood_boost"] = max(0, mood_boost_threshold - valence)

        if not urgency:
            return None

        return DerivationResult(
            key="behavior_urgency",
            value=urgency,
            metadata={"sources_used": sources_used}
        )

    def _get_mood(self, context: DerivationContext) -> Optional[Dict[str, Any]]:
        """Get mood from stats or derived values."""
        # Try explicit mood stats first
        if "mood" in context.stats:
            return {"valence": context.stats["mood"].axes.get("valence", 50)}

        # Try derived mood
        if "mood" in context.derived:
            derived_mood = context.derived["mood"]
            if isinstance(derived_mood, dict):
                return derived_mood

        return None
