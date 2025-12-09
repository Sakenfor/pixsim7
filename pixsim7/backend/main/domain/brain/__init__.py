"""
Brain domain - NPC cognitive modeling.

Provides a generic, data-driven brain state system that adapts to whatever
stat packages a world uses. No hardcoded stat names or structures.

Key Components:
- BrainState: Generic brain state container with stats and derived values
- BrainStatSnapshot: Snapshot of a single stat definition (axes, tiers, levels)
- BrainEngine: Computes brain state from stat packages using semantic derivations

Semantic Derivation System:
Derivations are declared in stat packages using semantic types. For example,
the mood package can declare it derives from "positive_sentiment" - at runtime,
if relationships (or any package) provides an axis with that semantic type,
the derivation runs automatically.

This allows packages to work together without knowing about each other.

Usage:
    from pixsim7.backend.main.domain.brain import BrainEngine, BrainState

    engine = BrainEngine(db)
    brain = await engine.compute_brain_state(npc_id, session, world, npc)

    # Access stats (structure depends on world config)
    if "mood" in brain.stats:
        mood = brain.stats["mood"]
        print(f"Valence: {mood.axes['valence']}, Level: {mood.level_id}")

    # Access derived values (labels, categories from transforms)
    if "mood" in brain.derived:
        print(f"Mood label: {brain.derived['mood']['label']}")

World Configuration:
    world.meta = {
        "stats_config": {
            "definitions": {
                "relationships": get_default_relationship_definition().dict(),
            }
        },
        "brain_config": {
            # Active stat packages (for semantic derivation)
            "active_packages": ["core.relationships", "core.mood"],

            # Optional: disable specific derivations
            "disabled_derivations": ["mood_from_sentiment_full"],
        }
    }
"""

from .types import (
    BrainStatSnapshot,
    BrainState,
)
from .engine import BrainEngine

__all__ = [
    # Types
    "BrainStatSnapshot",
    "BrainState",
    # Engine
    "BrainEngine",
]
