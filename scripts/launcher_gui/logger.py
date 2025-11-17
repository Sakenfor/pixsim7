"""
Structured logging for the launcher using pixsim_logging.

This module configures the launcher to use structured logging with:
- JSON format for DB/file ingestion
- Human-readable format for console
- Automatic log rotation
- Integration with DatabaseLogViewer
"""
import os
import sys

# Add parent directory to path for pixsim_logging imports
_parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

launcher_logger = None

try:
    from pixsim_logging import configure_logging as _configure_logging

    # Configure launcher to use human-readable format for console by default
    # Set PIXSIM_LOG_FORMAT=json in .env to switch to JSON format
    launcher_logger = _configure_logging("launcher")

    # Log successful initialization
    launcher_logger.info(
        "launcher_logger_initialized",
        version="2.0",
        log_format=os.getenv("PIXSIM_LOG_FORMAT", "json"),
        db_enabled=bool(os.getenv("PIXSIM_LOG_DB_URL") or os.getenv("LOG_DATABASE_URL") or os.getenv("DATABASE_URL"))
    )

except ImportError as e:
    # pixsim_logging not available - fall back to basic logging
    import logging
    import structlog

    # Try to create a basic structlog logger
    try:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )

        structlog.configure(
            processors=[
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.dev.ConsoleRenderer(colors=True),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
            context_class=dict,
            cache_logger_on_first_use=True,
        )

        launcher_logger = structlog.get_logger().bind(service="launcher")
        launcher_logger.warning(
            "launcher_logger_fallback",
            reason="pixsim_logging_not_available",
            error=str(e)
        )
    except Exception as fallback_error:
        # Ultimate fallback - just use print
        print(f"[LAUNCHER] Warning: Could not initialize structured logging: {fallback_error}")
        launcher_logger = None

except Exception as e:
    # Unexpected error - log it but don't crash
    print(f"[LAUNCHER] Error initializing logger: {type(e).__name__}: {e}")
    launcher_logger = None
