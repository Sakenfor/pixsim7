"""Block ID policy helpers.

Canonical primitive block IDs should be namespaced to prevent collisions
across packs and authoring surfaces.
"""
from __future__ import annotations


def is_namespaced_block_id(block_id: str) -> bool:
    """Return True when block_id follows <namespace>.<name> shape."""
    value = str(block_id or "").strip()
    if "." not in value:
        return False
    namespace, leaf = value.split(".", 1)
    return bool(namespace.strip() and leaf.strip())


def namespaced_block_id_error(block_id: str) -> str:
    value = str(block_id or "").strip() or "<empty>"
    return (
        f"block_id '{value}' must be namespaced to avoid collisions. "
        "Use format '<namespace>.<name>' (example: 'bananza.boat.deck_cafe')."
    )
