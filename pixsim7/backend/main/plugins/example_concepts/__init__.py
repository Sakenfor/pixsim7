"""
Example Concepts Plugin

Demonstrates the extensible action block concepts system:
- Adds new poses and moods via ontology pack
- Registers a custom scorer that boosts mysterious mood blocks
- Shows how to use block extensions for metadata
"""

from .manifest import manifest, router, on_load, on_enable, on_disable

__all__ = ["manifest", "router", "on_load", "on_enable", "on_disable"]
