"""Small demo script to exercise pixsim_logging.

Usage (PowerShell):
    $env:PIXSIM_LOG_FORMAT = "human"
    # Optionally configure DB/HTTP targets before running
    # $env:PIXSIM_LOG_DB_URL = "postgresql://user:pass@host:5432/db"
    # $env:PIXSIM_LOG_INGESTION_URL = "http://localhost:8000/api/v1/logs/ingest/batch"
    # $env:PIXSIM_LOG_ENABLE_HTTP = "true"

    python -m pixsim_logging.demo_logging
"""
from __future__ import annotations

import os
import time

from . import configure_logging, bind_job_context, bind_artifact_context


def main() -> None:
    service = os.getenv("PIXSIM_DEMO_SERVICE", "demo")
    logger = configure_logging(service)

    logger.info("demo_start", note="basic log", service_demo=service)

    # Bind some common context helpers
    job_logger = bind_job_context(logger, job_id=123, operation_type="render", provider_id="demo_provider")
    art_logger = bind_artifact_context(job_logger, artifact_id=456, submission_id=789)

    art_logger.info("pipeline:start", stage="pipeline:start")
    art_logger.info("provider:status", stage="provider:status", attempt=1, duration_ms=42)

    # Emit a faux HTTP request event so path filtering/sampling can be verified
    logger.info("http_request", event="http_request", path="/health", method="GET", status_code=200)
    logger.info("http_request", event="http_request", path="/status", method="GET", status_code=200)

    # Give background handlers a moment to flush before process exit
    time.sleep(1.0)


if __name__ == "__main__":  # pragma: no cover
    main()
