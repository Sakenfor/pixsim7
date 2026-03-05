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
from pixsim7.backend.main.shared.extension_contract import (
    ExtensionKind,
    ExtensionScope,
    ExtensionLifecycleStatus,
    ExtensionIdentity,
    is_canonical_extension_id,
    parse_extension_identity,
    build_extension_identity,
    is_editable_lifecycle,
    can_submit_lifecycle,
    can_approve_lifecycle,
    can_publish_lifecycle,
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
    "ExtensionKind",
    "ExtensionScope",
    "ExtensionLifecycleStatus",
    "ExtensionIdentity",
    "is_canonical_extension_id",
    "parse_extension_identity",
    "build_extension_identity",
    "is_editable_lifecycle",
    "can_submit_lifecycle",
    "can_approve_lifecycle",
    "can_publish_lifecycle",
]
