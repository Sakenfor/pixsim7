"""
Structured logging configuration

Provides JSON-formatted logs with proper structure for easy filtering/searching
"""
import logging
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict
import json


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging

    Outputs logs as JSON for easy parsing and filtering in admin panel
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON"""
        log_data: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "job_id"):
            log_data["job_id"] = record.job_id
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id

        return json.dumps(log_data, ensure_ascii=False)


class ColoredConsoleFormatter(logging.Formatter):
    """
    Colored console formatter for development

    Makes console logs easier to read with colors
    """

    # ANSI color codes
    COLORS = {
        'DEBUG': '\033[36m',    # Cyan
        'INFO': '\033[32m',     # Green
        'WARNING': '\033[33m',  # Yellow
        'ERROR': '\033[31m',    # Red
        'CRITICAL': '\033[35m', # Magenta
    }
    RESET = '\033[0m'

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors (without mutating original record)"""
        color = self.COLORS.get(record.levelname, self.RESET)
        
        # Create colored levelname for formatting without mutating record
        colored_levelname = f"{color}{record.levelname}{self.RESET}"
        
        # Temporarily swap levelname for formatting only
        original_levelname = record.levelname
        record.levelname = colored_levelname
        formatted = super().format(record)
        record.levelname = original_levelname
        
        return formatted


def setup_logging(
    log_level: str = "INFO",
    log_file: str | None = None,
    json_logs: bool = False
) -> None:
    """
    Configure application logging

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file path
        json_logs: Use JSON formatting for logs (useful for production/admin panel)
    """
    # Create logs directory if needed
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Console handler
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

    # File handler (always JSON for easy parsing)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(JSONFormatter())
        root_logger.addHandler(file_handler)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("arq.worker").setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance

    Usage:
        logger = get_logger(__name__)
        logger.info("Something happened")
        logger.error("Something bad", extra={"user_id": 123})
    """
    return logging.getLogger(name)


# Context manager for adding context to logs
class LogContext:
    """
    Add context fields to all logs within a block

    Usage:
        with LogContext(user_id=123, job_id=456):
            logger.info("Processing job")  # Will include user_id and job_id
    """

    def __init__(self, **kwargs):
        self.context = kwargs
        self.old_factory = None

    def __enter__(self):
        old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = old_factory(*args, **kwargs)
            for key, value in self.context.items():
                setattr(record, key, value)
            return record

        logging.setLogRecordFactory(record_factory)
        self.old_factory = old_factory
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        logging.setLogRecordFactory(self.old_factory)
