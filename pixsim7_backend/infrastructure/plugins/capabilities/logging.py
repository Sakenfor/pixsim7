"""
Logging Capability API

Provides structured logging for plugins.
"""

import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI


class LoggingAPI(BaseCapabilityAPI):
    """
    Structured logging for plugins.

    Required permission: log:emit
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        super().__init__(plugin_id, permissions, logger)

    def info(self, message: str, **kwargs):
        """Log info message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.info",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.info(message, plugin_id=self.plugin_id, **kwargs)

    def warning(self, message: str, **kwargs):
        """Log warning message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.warning",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.warning(message, plugin_id=self.plugin_id, **kwargs)

    def error(self, message: str, **kwargs):
        """Log error message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.error",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.error(message, plugin_id=self.plugin_id, **kwargs)

    def debug(self, message: str, **kwargs):
        """Log debug message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.debug",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.debug(message, plugin_id=self.plugin_id, **kwargs)
