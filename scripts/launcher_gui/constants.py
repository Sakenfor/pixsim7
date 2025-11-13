"""
Constants used throughout the launcher application.
Centralizes magic numbers and configuration values for easier maintenance.
"""

# Health Check Timeouts (seconds)
HEALTH_CHECK_TIMEOUT = 2
HEALTH_CHECK_INTERVAL = 3.0  # Seconds between health checks

# Docker Compose Timeouts (seconds)
COMPOSE_UP_TIMEOUT = 60
COMPOSE_CMD_TIMEOUT = 5

# Thread Shutdown Timeouts (milliseconds)
THREAD_SHUTDOWN_TIMEOUT_MS = 2000
WORKER_SHUTDOWN_TIMEOUT_MS = 1500

# UI Refresh Intervals (milliseconds)
CONSOLE_REFRESH_INTERVAL_MS = 1000  # 1 second
LOG_AUTO_REFRESH_INTERVAL_MS = 10000  # 10 seconds

# Log Buffer Settings
MAX_LOG_LINES = 1000  # Maximum lines to keep in service log buffer

# Redis Connection Settings
REDIS_TIMEOUT = 1.5  # Seconds for Redis health check socket timeout
REDIS_DEFAULT_PORT = 6379

# HTTP Request Timeouts (seconds)
API_REQUEST_TIMEOUT = 5
LOG_FETCH_TIMEOUT = 5

# Process Management
PROCESS_GRACEFUL_SHUTDOWN_DELAY = 0.5  # Seconds to wait before force kill
