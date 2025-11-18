"""
Configuration - Structured configuration for launcher managers.

Replaces scattered parameters with clean configuration objects,
making it easier to configure managers and pass around settings.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable


@dataclass
class ProcessManagerConfig:
    """
    Configuration for ProcessManager.

    Centralizes all process management settings in one place.
    """
    # Logging
    log_dir: Optional[Path] = None  # Directory for console logs (default: data/logs/console)

    # Events
    event_callback: Optional[Callable] = None  # Callback for process events

    # Behavior
    default_graceful_timeout: float = 5.0  # Seconds to wait before force kill
    kill_retry_attempts: int = 3  # Number of times to retry killing a process
    kill_retry_delay: float = 0.5  # Seconds between kill retries

    # Platform-specific
    windows_create_no_window: bool = True  # Don't create console windows on Windows
    unix_use_process_groups: bool = True  # Use process groups on Unix


@dataclass
class HealthManagerConfig:
    """
    Configuration for HealthManager.

    Centralizes all health monitoring settings.
    """
    # Intervals
    base_interval: float = 2.0  # Base health check interval (seconds)
    adaptive_enabled: bool = True  # Enable adaptive interval adjustment
    startup_interval: float = 0.5  # Fast interval during startup (seconds)
    stable_interval: float = 5.0  # Slow interval when all stable (seconds)

    # Timeouts
    http_timeout: float = 0.8  # HTTP health check timeout (seconds)
    tcp_timeout: float = 0.5  # TCP health check timeout (seconds)

    # Thresholds
    failure_threshold: int = 5  # Default failures before marking unhealthy
    stable_duration: float = 300.0  # Seconds before switching to stable interval (5 min)

    # Events
    event_callback: Optional[Callable] = None  # Callback for health events


@dataclass
class LogManagerConfig:
    """
    Configuration for LogManager.

    Centralizes all log management settings.
    """
    # Storage
    log_dir: Optional[Path] = None  # Directory for log files (default: data/logs/console)
    max_log_lines: int = 5000  # Maximum lines to keep in memory per service

    # Monitoring
    monitor_interval: float = 0.5  # How often to check log files (seconds)
    monitor_enabled: bool = True  # Start monitoring automatically

    # Events
    log_callback: Optional[Callable] = None  # Callback for new log lines

    # Persistence
    persist_logs: bool = True  # Write logs to disk
    log_file_buffering: int = 1  # Line buffered


@dataclass
class LauncherConfig:
    """
    Master configuration for entire launcher system.

    Bundles all manager configurations together.
    """
    # Manager configs
    process: ProcessManagerConfig = field(default_factory=ProcessManagerConfig)
    health: HealthManagerConfig = field(default_factory=HealthManagerConfig)
    log: LogManagerConfig = field(default_factory=LogManagerConfig)

    # Global settings
    root_dir: Optional[Path] = None  # Project root directory
    auto_start_managers: bool = True  # Automatically start health/log monitoring
    stop_services_on_exit: bool = False  # Stop all services when launcher exits

    @classmethod
    def from_dict(cls, config_dict: dict) -> 'LauncherConfig':
        """
        Create configuration from dictionary.

        Useful for loading from JSON/YAML config files.

        Args:
            config_dict: Dictionary with configuration values

        Returns:
            LauncherConfig instance
        """
        process_config = ProcessManagerConfig(
            **config_dict.get('process', {})
        )
        health_config = HealthManagerConfig(
            **config_dict.get('health', {})
        )
        log_config = LogManagerConfig(
            **config_dict.get('log', {})
        )

        return cls(
            process=process_config,
            health=health_config,
            log=log_config,
            root_dir=config_dict.get('root_dir'),
            auto_start_managers=config_dict.get('auto_start_managers', True),
            stop_services_on_exit=config_dict.get('stop_services_on_exit', False)
        )

    def to_dict(self) -> dict:
        """
        Convert configuration to dictionary.

        Useful for saving to JSON/YAML config files.

        Returns:
            Dictionary representation
        """
        return {
            'process': {
                'log_dir': str(self.process.log_dir) if self.process.log_dir else None,
                'default_graceful_timeout': self.process.default_graceful_timeout,
                'kill_retry_attempts': self.process.kill_retry_attempts,
                'kill_retry_delay': self.process.kill_retry_delay,
                'windows_create_no_window': self.process.windows_create_no_window,
                'unix_use_process_groups': self.process.unix_use_process_groups,
            },
            'health': {
                'base_interval': self.health.base_interval,
                'adaptive_enabled': self.health.adaptive_enabled,
                'startup_interval': self.health.startup_interval,
                'stable_interval': self.health.stable_interval,
                'http_timeout': self.health.http_timeout,
                'tcp_timeout': self.health.tcp_timeout,
                'failure_threshold': self.health.failure_threshold,
                'stable_duration': self.health.stable_duration,
            },
            'log': {
                'log_dir': str(self.log.log_dir) if self.log.log_dir else None,
                'max_log_lines': self.log.max_log_lines,
                'monitor_interval': self.log.monitor_interval,
                'monitor_enabled': self.log.monitor_enabled,
                'persist_logs': self.log.persist_logs,
                'log_file_buffering': self.log.log_file_buffering,
            },
            'root_dir': str(self.root_dir) if self.root_dir else None,
            'auto_start_managers': self.auto_start_managers,
            'stop_services_on_exit': self.stop_services_on_exit,
        }


def create_default_config(root_dir: Optional[Path] = None) -> LauncherConfig:
    """
    Create default launcher configuration.

    Args:
        root_dir: Project root directory (optional)

    Returns:
        LauncherConfig with sensible defaults
    """
    if root_dir is None:
        # Try to infer root from this file's location
        # launcher_core is in pixsim7/launcher_core, so root is 2 levels up
        root_dir = Path(__file__).parent.parent.parent

    log_dir = root_dir / 'data' / 'logs' / 'console'

    return LauncherConfig(
        process=ProcessManagerConfig(
            log_dir=log_dir,
            default_graceful_timeout=5.0,
            kill_retry_attempts=3,
            kill_retry_delay=0.5,
        ),
        health=HealthManagerConfig(
            base_interval=2.0,
            adaptive_enabled=True,
            startup_interval=0.5,
            stable_interval=5.0,
            http_timeout=0.8,
            tcp_timeout=0.5,
        ),
        log=LogManagerConfig(
            log_dir=log_dir,
            max_log_lines=5000,
            monitor_interval=0.5,
            monitor_enabled=True,
        ),
        root_dir=root_dir,
        auto_start_managers=True,
        stop_services_on_exit=False,
    )
