"""
Launcher Core - UI-agnostic service management library.

This package provides the core business logic for managing PixSim7 services,
decoupled from any UI framework. It can be used from:
- PySide6/Qt desktop launcher
- FastAPI web service
- CLI tools
- Tests

## Quick Start

### Simple Usage (Direct Managers):
```python
from pixsim7.launcher_core import ProcessManager, HealthManager, LogManager

process_mgr = ProcessManager(services)
health_mgr = HealthManager(process_mgr.states)
log_mgr = LogManager(process_mgr.states)

health_mgr.start()
log_mgr.start_monitoring()

process_mgr.start('backend')
```

### Recommended Usage (Container DI):
```python
from pixsim7.launcher_core import create_container

container = create_container(services)

with container:
    # Managers auto-started
    container.get_process_manager().start('backend')
    # ...
# Managers auto-stopped
```

### Event-Driven Usage:
```python
from pixsim7.launcher_core import create_container, get_event_bus, EventTypes

bus = get_event_bus()

def on_health_update(event):
    print(f"Health: {event.data.service_key} -> {event.data.status}")

bus.subscribe(EventTypes.HEALTH_UPDATE, on_health_update)

container = create_container(services)
container.start_all()
```
"""

from .types import ServiceDefinition, ServiceStatus, HealthStatus, ServiceState, ProcessEvent, HealthEvent
from .process_manager import ProcessManager
from .health_manager import HealthManager
from .log_manager import LogManager
from .config import LauncherConfig, ProcessManagerConfig, HealthManagerConfig, LogManagerConfig, create_default_config
from .event_bus import EventBus, Event, EventTypes, get_event_bus, reset_event_bus
from .container import LauncherContainer, create_container
from .interfaces import IProcessManager, IHealthManager, ILogManager, IEventBus
from .buildables import BuildableDefinition, load_buildables
from .launcher_settings import (
    LauncherSettings,
    load_launcher_settings,
    save_launcher_settings,
    update_launcher_settings,
    apply_launcher_settings_to_env,
)

__all__ = [
    # Core types
    'ServiceDefinition',
    'ServiceState',
    'ServiceStatus',
    'HealthStatus',
    'ProcessEvent',
    'HealthEvent',

    # Managers
    'ProcessManager',
    'HealthManager',
    'LogManager',

    # Configuration
    'LauncherConfig',
    'ProcessManagerConfig',
    'HealthManagerConfig',
    'LogManagerConfig',
    'create_default_config',

    # Event system
    'EventBus',
    'Event',
    'EventTypes',
    'get_event_bus',
    'reset_event_bus',

    # Dependency injection
    'LauncherContainer',
    'create_container',

    # Interfaces (for type hints and testing)
    'IProcessManager',
    'IHealthManager',
    'ILogManager',
    'IEventBus',

    # Buildables
    'BuildableDefinition',
    'load_buildables',

    # Settings
    'LauncherSettings',
    'load_launcher_settings',
    'save_launcher_settings',
    'update_launcher_settings',
    'apply_launcher_settings_to_env',
]

__version__ = '0.2.0'  # Phase 3-4 complete
