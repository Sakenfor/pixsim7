"""
Core NPC Surface Definitions

Defines the built-in surface types that ship with the platform.
These are general-purpose surface types that most games will use.
"""

from .package_registry import NpcSurfacePackage


def get_core_portrait_package() -> NpcSurfacePackage:
    """
    Core portrait and dialogue surface package.

    Defines basic surface types for NPC portraits and dialogue:
    - portrait: Standard NPC portrait (idle/neutral)
    - dialogue: Talking/conversation state
    - reaction_clip: Short reaction animation
    """
    return NpcSurfacePackage(
        id="core.portrait",
        label="Core Portrait & Dialogue",
        description="Basic portrait and dialogue surface types for NPCs",
        category="portrait",
        surface_types={
            "portrait": {
                "usage": "Standard NPC portrait for dialogue UI (idle/neutral state)",
                "contexts": ["2d_dialogue", "overlay", "inspect"],
            },
            "dialogue": {
                "usage": "Talking/conversation animation",
                "contexts": ["2d_dialogue", "overlay"],
            },
            "reaction_clip": {
                "usage": "Short reaction animation (surprise, laugh, etc.)",
                "contexts": ["2d_dialogue", "cutscene"],
            },
        },
        source_plugin_id=None,  # Built-in
    )


def get_core_mood_package() -> NpcSurfacePackage:
    """
    Core mood-based expression package.

    Defines basic mood surface types:
    - mood_happy: Happy/cheerful expression
    - mood_sad: Sad/disappointed expression
    - mood_angry: Angry/upset expression
    - mood_surprised: Surprised/shocked expression
    - mood_thinking: Thinking/contemplative expression
    - mood_bored: Bored/disinterested expression
    """
    return NpcSurfacePackage(
        id="core.mood",
        label="Core Mood Expressions",
        description="Basic mood-based expression surface types",
        category="mood",
        surface_types={
            "mood_happy": {
                "usage": "Happy/cheerful expression",
                "mood": "happy",
                "contexts": ["2d_dialogue", "overlay"],
            },
            "mood_sad": {
                "usage": "Sad/disappointed expression",
                "mood": "sad",
                "contexts": ["2d_dialogue", "overlay"],
            },
            "mood_angry": {
                "usage": "Angry/upset expression",
                "mood": "angry",
                "contexts": ["2d_dialogue", "overlay"],
            },
            "mood_surprised": {
                "usage": "Surprised/shocked expression",
                "mood": "surprised",
                "contexts": ["2d_dialogue", "overlay", "reaction"],
            },
            "mood_thinking": {
                "usage": "Thinking/contemplative expression",
                "mood": "thinking",
                "contexts": ["2d_dialogue", "overlay"],
            },
            "mood_bored": {
                "usage": "Bored/disinterested expression",
                "mood": "bored",
                "contexts": ["2d_dialogue", "overlay"],
            },
        },
        source_plugin_id=None,  # Built-in
    )


_registered = False


def register_core_surface_packages() -> None:
    """
    Register all core surface packages.

    This should be called during app startup to make core surface types
    available to all plugins and tools.

    Safe to call multiple times (idempotent).
    """
    global _registered
    if _registered:
        return

    from .package_registry import register_npc_surface_package

    register_npc_surface_package(get_core_portrait_package())
    register_npc_surface_package(get_core_mood_package())
    _registered = True


def reset_core_surface_registration() -> None:
    """Reset the registration flag. Used by clear functions for testing."""
    global _registered
    _registered = False


# Register packages at import time so they are always available in the
# registry for tools and plugins that query it.
register_core_surface_packages()
