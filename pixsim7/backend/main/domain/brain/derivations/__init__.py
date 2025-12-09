"""
Built-in derivation plugins.

Import this module to register all built-in plugins with the derivation registry.
"""

from ..derivation_registry import register_derivation

from .mood_from_relationships import MoodFromRelationshipsDerivation
from .behavior_urgency import BehaviorUrgencyDerivation
from .conversation_style import ConversationStyleDerivation


def register_builtin_derivations() -> None:
    """Register all built-in derivation plugins."""
    register_derivation(MoodFromRelationshipsDerivation())
    register_derivation(BehaviorUrgencyDerivation())
    register_derivation(ConversationStyleDerivation())


# Auto-register on import
register_builtin_derivations()
