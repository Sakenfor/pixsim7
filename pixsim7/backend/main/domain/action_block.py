"""
DEPRECATED: Legacy action_block module shim.

Moved to pixsim7.backend.main.domain.generation.action_block.
This module re-exports from there for backward compatibility.

Migration:
    # Old (deprecated):
    from pixsim7.backend.main.domain.action_block import ActionBlockDB

    # New (preferred):
    from pixsim7.backend.main.domain.generation import ActionBlockDB
"""
from pixsim7.backend.main.domain.generation.action_block import ActionBlockDB

__all__ = ["ActionBlockDB"]
