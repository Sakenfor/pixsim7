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
from .config import configure_logging, get_logger
from .spec import COMMON_FIELDS, STAGES, redact_sensitive, bind_job_context, bind_artifact_context
from .file_rotation import rotate_file, append_line

__all__ = [
    "configure_logging",
    "get_logger",
    "COMMON_FIELDS",
    "STAGES",
    "redact_sensitive",
    "bind_job_context",
    "bind_artifact_context",
    "rotate_file",
    "append_line",
]
