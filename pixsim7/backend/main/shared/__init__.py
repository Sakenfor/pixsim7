"""
Shared utilities and types

Exports common utilities that can be used across all domains.
"""
from pixsim7.backend.main.shared.auth_claims import AuthClaims, UserContext
from pixsim7.backend.main.shared.logging import (
    get_backend_logger,
    get_event_logger,
    get_plugin_logger,
)

__all__ = [
    "AuthClaims",
    "UserContext",
    "get_backend_logger",
    "get_event_logger",
    "get_plugin_logger",
]
