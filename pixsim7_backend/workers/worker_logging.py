"""
Worker logging configuration

Separate logging setup for ARQ workers
"""
import logging
import sys
import os
from pathlib import Path
from pixsim7_backend.infrastructure.logging.config import JSONFormatter, ColoredConsoleFormatter


def setup_worker_logging(log_level: str = "INFO"):
    """
    Configure worker-specific logging

    Creates separate log files for workers to avoid mixing with API logs
    """
    # Get log file paths from env
    worker_log_file = os.getenv("WORKER_LOG_FILE", "data/logs/worker.log")
    error_log_file = os.getenv("ERROR_LOG_FILE", "data/logs/errors.log")
    json_logs = os.getenv("JSON_LOGS", "false").lower() == "true"

    # Create logs directory
    for log_file in [worker_log_file, error_log_file]:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    root_logger.handlers.clear()

    # Console handler (colored for readability)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)

    if json_logs:
        console_handler.setFormatter(JSONFormatter())
    else:
        console_formatter = ColoredConsoleFormatter(
            fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)

    root_logger.addHandler(console_handler)

    # Worker log file (all logs)
    worker_handler = logging.FileHandler(worker_log_file)
    worker_handler.setLevel(logging.DEBUG)
    worker_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(worker_handler)

    # Error log file (errors only, across all components)
    error_handler = logging.FileHandler(error_log_file)
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(error_handler)

    # Quiet noisy loggers
    logging.getLogger("arq.worker").setLevel(logging.INFO)
    logging.getLogger("arq.jobs").setLevel(logging.INFO)

    # Log startup
    logger = logging.getLogger("worker")
    logger.info("=" * 60)
    logger.info("📝 Worker logging configured")
    logger.info(f"   Worker logs: {worker_log_file}")
    logger.info(f"   Error logs: {error_log_file}")
    logger.info("=" * 60)
