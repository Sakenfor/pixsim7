"""
Mood derivation plugin.

Provides mood information with labels derived from valence/arousal values.
Works with mood from any source:
- Explicit mood stats in world config
- Semantically derived mood (from positive_sentiment/arousal_source axes)
- Legacy: computed from relationship axes if nothing else available

This plugin adds value by computing human-readable labels from the circumplex
model quadrants, which pure semantic derivations don't do.
"""

from typing import List, Optional, Dict, Any

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult


class MoodFromRelationshipsDerivation(BaseDerivationPlugin):
    """
    Computes mood with labels from available sources.

    Priority of mood sources:
    1. Explicit 'mood' stats -> add label
    2. Semantically derived mood -> add label
    3. Fallback: compute from relationship axes (legacy behavior)

    The main value this plugin adds is computing human-readable labels
    from the valence/arousal circumplex model.

    Formula for fallback is configurable via world meta:
        world.meta.brain_config.plugins.mood_from_relationships = {
            "valence_weights": {"affinity": 0.6, "chemistry": 0.4},
            "arousal_weights": {"chemistry": 0.5, "tension": 0.5}
        }
    """

    @property
    def id(self) -> str:
        return "mood_from_relationships"

    @property
    def name(self) -> str:
        return "Mood with Labels"

    @property
    def required_stats(self) -> List[str]:
        return []  # No hard requirements - adapts to what's available

    @property
    def optional_stats(self) -> List[str]:
        return ["mood", "relationships"]

    @property
    def priority(self) -> int:
        return 40

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        valence: float
        arousal: float
        source: str

        # Priority 1: Explicit mood stats
        if "mood" in context.stats:
            mood_stats = context.stats["mood"]
            valence = mood_stats.axes.get("valence", 50)
            arousal = mood_stats.axes.get("arousal", 50)
            source = "mood_stats"

        # Priority 2: Check if mood was already derived (e.g., by semantic derivation)
        elif "mood" in context.derived:
            existing = context.derived["mood"]
            if isinstance(existing, dict):
                # Already has label? Skip.
                if "label" in existing:
                    return None
                valence = existing.get("valence", 50)
                arousal = existing.get("arousal", 50)
                source = existing.get("source", "semantic_derivation")
            else:
                return None

        # Priority 3: Fallback - derive from relationships
        elif "relationships" in context.stats:
            rel = context.stats["relationships"]
            plugin_cfg = context.get_plugin_config(self.id)

            valence_weights = plugin_cfg.get("valence_weights", {
                "affinity": 0.6,
                "chemistry": 0.4,
            })
            arousal_weights = plugin_cfg.get("arousal_weights", {
                "chemistry": 0.5,
                "tension": 0.5,
            })

            valence = sum(
                rel.axes.get(axis, 50) * weight
                for axis, weight in valence_weights.items()
            )
            arousal = sum(
                rel.axes.get(axis, 50) * weight
                for axis, weight in arousal_weights.items()
            )
            source = "derived_from_relationships"

        else:
            # No mood source available
            return None

        # Clamp to 0-100
        valence = max(0, min(100, valence))
        arousal = max(0, min(100, arousal))

        # Compute label from circumplex quadrants
        label = self._compute_label(valence, arousal)

        return DerivationResult(
            key="mood",
            value={
                "valence": valence,
                "arousal": arousal,
                "label": label,
                "source": source,
            },
            metadata={
                "computed_label": True,
            }
        )

    def _compute_label(self, valence: float, arousal: float) -> str:
        """
        Derive mood label from valence/arousal circumplex quadrants.

        Uses Russell's circumplex model of affect:
        - High valence + High arousal = excited, elated
        - High valence + Low arousal = calm, relaxed
        - Low valence + High arousal = anxious, angry
        - Low valence + Low arousal = sad, subdued
        """
        if valence >= 70 and arousal >= 70:
            return "excited"
        elif valence >= 70 and arousal < 30:
            return "content"
        elif valence >= 60 and arousal >= 60:
            return "happy"
        elif valence >= 60 and arousal < 40:
            return "calm"
        elif valence < 30 and arousal >= 70:
            return "angry"
        elif valence < 40 and arousal >= 60:
            return "anxious"
        elif valence < 30 and arousal < 30:
            return "sad"
        elif valence < 40 and arousal < 40:
            return "subdued"
        elif valence >= 50:
            return "pleasant"
        elif valence < 50:
            return "unpleasant"
        else:
            return "neutral"
