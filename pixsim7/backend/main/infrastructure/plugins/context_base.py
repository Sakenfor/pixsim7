"""
Base Capability API

Provides common functionality for all capability APIs including permission checking.
"""

import structlog

from .permissions import PermissionDeniedError, PermissionDeniedBehavior


class BaseCapabilityAPI:
    """
    Base class for capability APIs.

    Provides permission checking and logging for all capability methods.
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        self.plugin_id = plugin_id
        self.permissions = permissions
        self.logger = logger

    def _check_permission(
        self,
        required: str,
        capability_name: str,
        behavior: PermissionDeniedBehavior = PermissionDeniedBehavior.RAISE,
    ) -> bool:
        """
        Check if plugin has required permission.

        Args:
            required: Required permission (e.g., "world:read")
            capability_name: Name of capability being accessed (for error messages)
            behavior: What to do if permission is denied

        Returns:
            True if permission granted, False if denied (and behavior != RAISE)

        Raises:
            PermissionDeniedError: If permission denied and behavior == RAISE
        """
        if required not in self.permissions:
            if behavior == PermissionDeniedBehavior.RAISE:
                raise PermissionDeniedError(self.plugin_id, required, capability_name)
            elif behavior == PermissionDeniedBehavior.WARN:
                self.logger.warning(
                    "plugin_permission_denied",
                    plugin_id=self.plugin_id,
                    required_permission=required,
                    capability=capability_name,
                    action="blocked",
                    msg=f"Plugin '{self.plugin_id}' lacks permission '{required}' for {capability_name}",
                )
            # SILENT: do nothing
            return False
        return True
