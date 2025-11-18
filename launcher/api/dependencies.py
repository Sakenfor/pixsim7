"""
API Dependencies - Dependency injection for FastAPI routes.

Provides access to launcher managers via FastAPI's dependency injection.
"""

from fastapi import Depends, HTTPException
from typing import Optional

from launcher.core import (
    LauncherContainer,
    ProcessManager,
    HealthManager,
    LogManager,
    EventBus
)


# Global container instance (initialized in main.py)
_container: Optional[LauncherContainer] = None


def set_container(container: LauncherContainer):
    """Set the global container instance."""
    global _container
    _container = container


def get_container() -> LauncherContainer:
    """
    Dependency: Get the launcher container.

    Raises:
        HTTPException: If container not initialized
    """
    if _container is None:
        raise HTTPException(
            status_code=500,
            detail="Launcher container not initialized"
        )
    return _container


def get_process_manager(
    container: LauncherContainer = Depends(get_container)
) -> ProcessManager:
    """
    Dependency: Get the process manager.

    Args:
        container: Injected container

    Returns:
        ProcessManager instance
    """
    return container.get_process_manager()


def get_health_manager(
    container: LauncherContainer = Depends(get_container)
) -> HealthManager:
    """
    Dependency: Get the health manager.

    Args:
        container: Injected container

    Returns:
        HealthManager instance
    """
    return container.get_health_manager()


def get_log_manager(
    container: LauncherContainer = Depends(get_container)
) -> LogManager:
    """
    Dependency: Get the log manager.

    Args:
        container: Injected container

    Returns:
        LogManager instance
    """
    return container.get_log_manager()


def get_event_bus(
    container: LauncherContainer = Depends(get_container)
) -> EventBus:
    """
    Dependency: Get the event bus.

    Args:
        container: Injected container

    Returns:
        EventBus instance
    """
    return container.get_event_bus()
