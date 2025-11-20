"""
Plugin Capability APIs

Provides plugins with restricted, permission-aware access to specific capabilities.
"""

from .world import WorldReadAPI
from .session import SessionReadAPI, SessionMutationsAPI
from .components import ComponentAPI
from .behaviors import BehaviorExtensionAPI
from .logging import LoggingAPI

__all__ = [
    "WorldReadAPI",
    "SessionReadAPI",
    "SessionMutationsAPI",
    "ComponentAPI",
    "BehaviorExtensionAPI",
    "LoggingAPI",
]
