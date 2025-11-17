#!/usr/bin/env python
"""
Container & Event Bus Example

Demonstrates the enhanced Phase 3-4 architecture:
- Dependency injection via LauncherContainer
- Event-driven communication via EventBus
- Clean configuration via config classes

This shows the recommended way to use launcher_core.
"""

import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from pixsim7.launcher_core import (
    ServiceDefinition,
    create_container,
    get_event_bus,
    EventTypes,
    Event
)


def create_demo_services():
    """Create some demo service definitions."""
    root = Path(__file__).parent.parent.parent.parent

    return [
        ServiceDefinition(
            key="backend",
            title="Backend API",
            program="python",
            args=["-m", "uvicorn", "pixsim7_backend.main:app", "--port", "8000"],
            cwd=str(root),
            env_overrides={"PYTHONPATH": str(root)},
            health_url="http://localhost:8000/health",
            health_grace_attempts=6
        ),
        ServiceDefinition(
            key="worker",
            title="ARQ Worker",
            program="python",
            args=["-m", "arq", "pixsim7_backend.workers.arq_worker.WorkerSettings"],
            cwd=str(root),
            env_overrides={"PYTHONPATH": str(root)},
            health_grace_attempts=10
        ),
    ]


def main():
    print("=" * 70)
    print("Container & Event Bus Example")
    print("=" * 70)
    print()

    # Step 1: Get the global event bus
    bus = get_event_bus()

    # Step 2: Subscribe to events BEFORE creating container
    def on_process_event(event: Event):
        """Handle process events."""
        from pixsim7.launcher_core.types import ProcessEvent
        process_event = event.data
        print(f"📦 Process Event: {process_event.service_key} -> {process_event.event_type}")
        if process_event.data:
            print(f"   Data: {process_event.data}")

    def on_health_event(event: Event):
        """Handle health events."""
        from pixsim7.launcher_core.types import HealthEvent
        health_event = event.data
        status_emoji = {
            "stopped": "⚫",
            "starting": "🟡",
            "healthy": "🟢",
            "unhealthy": "🔴",
            "unknown": "⚪"
        }
        emoji = status_emoji.get(health_event.status.value, "⚪")
        print(f"{emoji} Health: {health_event.service_key} -> {health_event.status.value}")

    def on_log_line(event: Event):
        """Handle log events."""
        data = event.data
        service_key = data['service_key']
        line = data['line']
        # Only print backend logs to avoid spam
        if service_key == 'backend':
            print(f"📝 [backend] {line[:80]}...")  # Truncate long lines

    # Subscribe to all process events using wildcard
    bus.subscribe("process.*", on_process_event)

    # Subscribe to health updates
    bus.subscribe(EventTypes.HEALTH_UPDATE, on_health_event)

    # Subscribe to log lines (commented out to avoid spam)
    # bus.subscribe(EventTypes.LOG_LINE, on_log_line)

    # Step 3: Create container with services
    services = create_demo_services()

    print("Creating container with dependency injection...")
    container = create_container(
        services,
        config_overrides={
            'health': {
                'base_interval': 1.0,  # Fast health checks for demo
                'adaptive_enabled': True
            }
        }
    )

    print("✓ Container created")
    print()

    # Step 4: Use container as context manager (auto start/stop)
    print("Starting managers (via context manager)...")
    with container:
        print("✓ Managers started")
        print()

        # Get manager instances
        process_mgr = container.get_process_manager()
        health_mgr = container.get_health_manager()
        log_mgr = container.get_log_manager()

        print(f"Process Manager: {process_mgr.__class__.__name__}")
        print(f"Health Manager: {health_mgr.__class__.__name__}")
        print(f"Log Manager: {log_mgr.__class__.__name__}")
        print()

        # Get event bus stats
        stats = bus.get_stats()
        print(f"Event Bus Stats:")
        print(f"  Subscribers: {stats['subscriber_count']}")
        print(f"  Event Types: {', '.join(stats['event_types'])}")
        print()

        # Step 5: Start a service
        print("Starting backend service...")
        success = process_mgr.start('backend')

        if success:
            print("✓ Backend started")
            print()
            print("Waiting for health checks...")
            print("(Watch for health events above)")
            print()

            # Wait for service to become healthy
            time.sleep(5)

            # Check state
            state = process_mgr.get_state('backend')
            print(f"Backend state:")
            print(f"  Status: {state.status.value}")
            print(f"  Health: {state.health.value}")
            print(f"  PID: {state.pid}")
            print()

            # Get logs
            logs = log_mgr.get_logs('backend', max_lines=10)
            print(f"Last 10 log lines:")
            for line in logs[-10:]:
                print(f"  {line[:80]}")  # Truncate long lines
            print()

            # Stop service
            print("Stopping backend...")
            process_mgr.stop('backend')
            print("✓ Backend stopped")
            print()

        else:
            state = process_mgr.get_state('backend')
            print(f"✗ Failed to start: {state.last_error}")
            print()

        print("Exiting context manager (will auto-stop managers)...")

    print("✓ Managers stopped")
    print()

    # Show final event bus stats
    final_stats = bus.get_stats()
    print(f"Final Event Bus Stats:")
    print(f"  Total Events Published: {final_stats['event_count']}")
    print(f"  Errors: {final_stats['error_count']}")
    print()

    print("=" * 70)
    print("Demo complete!")
    print()
    print("Key Points:")
    print("  ✓ Container manages all dependencies (DI)")
    print("  ✓ Event bus decouples managers from UI")
    print("  ✓ Config classes centralize settings")
    print("  ✓ Context manager auto-starts/stops")
    print("  ✓ Clean, testable architecture")
    print("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
