#!/usr/bin/env python
"""
CLI Launcher Example

Demonstrates using launcher_core managers without any UI framework.
This is a simple command-line launcher for PixSim7 services.

Usage:
    python cli_launcher.py start backend
    python cli_launcher.py stop backend
    python cli_launcher.py status
    python cli_launcher.py logs backend
"""

import sys
import time
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from pixsim7.launcher_core import (
    ServiceDefinition,
    ProcessManager,
    HealthManager,
    LogManager,
    ProcessEvent,
    HealthEvent
)


def create_services():
    """Create service definitions (simplified for demo)."""
    # In real usage, import from scripts/launcher_gui/services.py
    return [
        ServiceDefinition(
            key="backend",
            title="Backend API",
            program="python",
            args=["-m", "uvicorn", "pixsim7_backend.main:app", "--host", "0.0.0.0", "--port", "8000"],
            cwd=str(Path(__file__).parent.parent.parent.parent),
            env_overrides={
                "PYTHONPATH": str(Path(__file__).parent.parent.parent.parent),
                "PIXSIM_LOG_FORMAT": "human"
            },
            health_url="http://localhost:8000/health",
            health_grace_attempts=6
        )
    ]


class CLILauncher:
    """Simple CLI launcher using core managers."""

    def __init__(self):
        self.services = create_services()
        self.process_mgr = ProcessManager(
            self.services,
            event_callback=self.on_process_event
        )
        self.health_mgr = HealthManager(
            self.process_mgr.states,
            event_callback=self.on_health_event,
            interval_sec=2.0
        )
        self.log_mgr = LogManager(
            self.process_mgr.states,
            log_callback=self.on_log_line
        )

    def on_process_event(self, event: ProcessEvent):
        """Handle process events."""
        print(f"[PROCESS] {event.service_key}: {event.event_type}")
        if event.data:
            print(f"  → {event.data}")

    def on_health_event(self, event: HealthEvent):
        """Handle health events."""
        status_emoji = {
            "stopped": "⚫",
            "starting": "🟡",
            "healthy": "🟢",
            "unhealthy": "🔴",
            "unknown": "⚪"
        }
        emoji = status_emoji.get(event.status.value, "⚪")
        print(f"[HEALTH] {emoji} {event.service_key}: {event.status.value}")

    def on_log_line(self, service_key: str, line: str):
        """Handle new log lines."""
        # Only print if we're explicitly tailing logs
        pass

    def start(self, service_key: str):
        """Start a service."""
        print(f"Starting {service_key}...")
        success = self.process_mgr.start(service_key)

        if success:
            print(f"✓ Started {service_key}")
            # Start health monitoring
            if not self.health_mgr.is_running():
                self.health_mgr.start()
            # Wait a bit to see initial health
            time.sleep(2)
        else:
            state = self.process_mgr.get_state(service_key)
            print(f"✗ Failed to start {service_key}: {state.last_error}")

    def stop(self, service_key: str):
        """Stop a service."""
        print(f"Stopping {service_key}...")
        success = self.process_mgr.stop(service_key)

        if success:
            print(f"✓ Stopped {service_key}")
        else:
            state = self.process_mgr.get_state(service_key)
            print(f"✗ Failed to stop {service_key}: {state.last_error}")

    def status(self):
        """Show status of all services."""
        print("\nService Status:")
        print("=" * 60)

        for key, state in self.process_mgr.get_all_states().items():
            status_emoji = {
                "stopped": "⚫",
                "starting": "🟡",
                "running": "🟢",
                "stopping": "🟠",
                "failed": "🔴"
            }
            health_emoji = {
                "stopped": "⚫",
                "starting": "🟡",
                "healthy": "🟢",
                "unhealthy": "🔴",
                "unknown": "⚪"
            }

            s_emoji = status_emoji.get(state.status.value, "⚪")
            h_emoji = health_emoji.get(state.health.value, "⚪")

            print(f"{s_emoji} {h_emoji} {state.definition.title:30} "
                  f"[{state.status.value:8} / {state.health.value:8}]")

            if state.pid:
                print(f"   PID: {state.pid}")
            if state.last_error:
                print(f"   Error: {state.last_error}")

        print("=" * 60)

    def logs(self, service_key: str, tail: int = 50, follow: bool = False):
        """Show logs for a service."""
        if follow:
            print(f"Following logs for {service_key} (Ctrl+C to stop)...")
            print("=" * 60)

            # Start log monitoring
            if not self.log_mgr.is_monitoring():
                self.log_mgr.start_monitoring()

            # Override callback to print
            original_callback = self.log_mgr.log_callback

            def print_log(key: str, line: str):
                if key == service_key:
                    print(line)
                if original_callback:
                    original_callback(key, line)

            self.log_mgr.log_callback = print_log

            try:
                while True:
                    time.sleep(0.1)
            except KeyboardInterrupt:
                print("\nStopped following logs")
                self.log_mgr.log_callback = original_callback
        else:
            # Just show recent logs
            logs = self.log_mgr.get_logs(service_key, max_lines=tail)
            print(f"Last {tail} lines for {service_key}:")
            print("=" * 60)
            for line in logs:
                print(line)
            print("=" * 60)

    def cleanup(self):
        """Clean up resources."""
        self.health_mgr.stop()
        self.log_mgr.stop_monitoring()
        self.process_mgr.cleanup()


def main():
    parser = argparse.ArgumentParser(description="CLI Launcher for PixSim7")
    parser.add_argument("command", choices=["start", "stop", "restart", "status", "logs"],
                        help="Command to execute")
    parser.add_argument("service", nargs="?", help="Service key (for start/stop/logs)")
    parser.add_argument("--tail", type=int, default=50, help="Number of log lines to show")
    parser.add_argument("--follow", "-f", action="store_true", help="Follow logs in real-time")

    args = parser.parse_args()

    launcher = CLILauncher()

    try:
        if args.command == "start":
            if not args.service:
                print("Error: service key required for start")
                sys.exit(1)
            launcher.start(args.service)

        elif args.command == "stop":
            if not args.service:
                print("Error: service key required for stop")
                sys.exit(1)
            launcher.stop(args.service)

        elif args.command == "restart":
            if not args.service:
                print("Error: service key required for restart")
                sys.exit(1)
            launcher.stop(args.service)
            time.sleep(1)
            launcher.start(args.service)

        elif args.command == "status":
            launcher.status()

        elif args.command == "logs":
            if not args.service:
                print("Error: service key required for logs")
                sys.exit(1)
            launcher.logs(args.service, tail=args.tail, follow=args.follow)

    except KeyboardInterrupt:
        print("\nInterrupted")
    finally:
        launcher.cleanup()


if __name__ == "__main__":
    main()
