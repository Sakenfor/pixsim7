"""Root shared logging package for PixSim7.

Importable by backend API, workers, scripts, and auxiliary services:
    from pixsim_logging import configure_logging, get_logger

Default usage:
    logger = configure_logging(service_name="api")
    logger.info("logger_initialized", version="1")

Environment overrides:
    PIXSIM_LOG_FORMAT=human   # pretty console
    PIXSIM_LOG_LEVEL=DEBUG    # log level
    PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=5  # sample 1 in N provider status logs

This package keeps zero dependencies on application domain models.
"""
from .config import configure_logging, configure_stdlib_root_logger, get_logger, get_ingestion_stats, get_registered_services
from .domains import is_domain_enabled, update_domain_config
from .spec import COMMON_FIELDS, STAGES, DOMAINS, SERVICES, redact_sensitive, bind_job_context, bind_generation_context, bind_domain_context
from .file_rotation import rotate_file, append_line
from .console_renderer import CleanConsoleRenderer
from .reader import LogRecord, parse_line, parse_lines, field_registry, tail_file, FieldDefinition, FieldRegistry, sanitize_line, LogWriter

__all__ = [
    # Configuration
    "configure_logging",
    "configure_stdlib_root_logger",
    "get_logger",
    "get_ingestion_stats",
    "get_registered_services",
    # Domain filtering
    "is_domain_enabled",
    "update_domain_config",
    # Spec & context
    "COMMON_FIELDS",
    "STAGES",
    "DOMAINS",
    "SERVICES",
    "redact_sensitive",
    "bind_job_context",
    "bind_generation_context",
    "bind_domain_context",
    # File utilities
    "rotate_file",
    "append_line",
    # Rendering
    "CleanConsoleRenderer",
    # Reading & consumption
    "LogRecord",
    "parse_line",
    "parse_lines",
    "field_registry",
    "tail_file",
    "FieldDefinition",
    "FieldRegistry",
    "sanitize_line",
    "LogWriter",
]
