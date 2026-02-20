"""
Shared utilities and types

Exports common utilities that can be used across all domains.
"""
from pixsim7.backend.main.shared.auth_claims import AuthClaims, AuthPrincipal, UserContext
from pixsim7.backend.main.shared.logging import (
    get_backend_logger,
    get_event_logger,
    get_plugin_logger,
)

from pixsim7.backend.main.shared.namespaced_id import (
    parse_namespaced_id,
    make_namespaced_id,
    get_namespace,
)

__all__ = [
    "AuthClaims",
    "AuthPrincipal",
    "UserContext",
    "get_backend_logger",
    "get_event_logger",
    "get_plugin_logger",
    "parse_namespaced_id",
    "make_namespaced_id",
    "get_namespace",
]
