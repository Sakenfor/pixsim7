"""
Test script to verify structured logging implementation.

This script demonstrates the end-to-end logging trace with:
- Job context binding
- Stage-based logging
- Artifact context binding
- Structured JSON output

Run with:
    PIXSIM_LOG_FORMAT=json python tests/test_structured_logging.py
or:
    PIXSIM_LOG_FORMAT=human python tests/test_structured_logging.py
"""
import os
import sys

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pixsim_logging import configure_logging, bind_job_context, bind_artifact_context


def test_basic_logging():
    """Test basic structured logging configuration."""
    print("=" * 80)
    print("TEST 1: Basic Logging Configuration")
    print("=" * 80)

    logger = configure_logging("test-service")
    logger.info("test_basic", msg="basic_log_message", test_field="test_value")

    print()


def test_job_context():
    """Test job context binding."""
    print("=" * 80)
    print("TEST 2: Job Context Binding")
    print("=" * 80)

    logger = configure_logging("worker")

    # Simulate a job processing workflow
    job_id = 123
    operation_type = "text_to_video"
    provider_id = "pixverse"

    # Bind job context
    job_logger = bind_job_context(logger, job_id=job_id, operation_type=operation_type, provider_id=provider_id)

    # Log stages
    job_logger.info("pipeline:start", msg="job_processing_started")
    job_logger.info("account_selected", account_id=456)
    job_logger.info("pipeline:artifact", msg="artifact_created", artifact_id=789)

    # Bind artifact context
    artifact_logger = bind_artifact_context(job_logger, artifact_id=789, submission_id=321)

    artifact_logger.info("provider:submit", msg="job_submitted_to_provider", provider_job_id="pv_job_abc")
    artifact_logger.info("provider:status", msg="status_polled", status="processing", progress=0.5)
    artifact_logger.info("provider:complete", msg="generation_completed", video_url="https://example.com/video.mp4")

    print()


def test_error_handling():
    """Test error logging with structured context."""
    print("=" * 80)
    print("TEST 3: Error Handling")
    print("=" * 80)

    logger = configure_logging("worker")
    job_logger = bind_job_context(logger, job_id=999, operation_type="image_to_video", provider_id="pixverse")

    # Simulate an error
    try:
        raise ValueError("Simulated provider error")
    except Exception as e:
        job_logger.error(
            "provider:error",
            msg="provider_submission_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            attempt=0
        )

    print()


def test_sampling():
    """Test sampling of provider:status events."""
    print("=" * 80)
    print("TEST 4: Sampling (set PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=5 to sample 1 in 5)")
    print("=" * 80)

    logger = configure_logging("worker")
    job_logger = bind_job_context(logger, job_id=555, provider_id="pixverse")

    # Simulate multiple status polls (most should be sampled out if sampling is enabled)
    for i in range(10):
        job_logger.info("provider:status", msg="status_polled", poll_count=i)

    print()


def test_redaction():
    """Test sensitive data redaction."""
    print("=" * 80)
    print("TEST 5: Sensitive Data Redaction")
    print("=" * 80)

    logger = configure_logging("api")

    # These should be redacted
    logger.info(
        "authentication",
        api_key="secret_key_12345",
        password="my_password",
        jwt_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        user_id=123  # This should NOT be redacted
    )

    print()


def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("STRUCTURED LOGGING TEST SUITE")
    print("=" * 80)
    print(f"Log Format: {os.getenv('PIXSIM_LOG_FORMAT', 'json')}")
    print(f"Log Level: {os.getenv('PIXSIM_LOG_LEVEL', 'INFO')}")
    print(f"Sampling: {os.getenv('PIXSIM_LOG_SAMPLING_PROVIDER_STATUS', '1')}")
    print("=" * 80)
    print()

    test_basic_logging()
    test_job_context()
    test_error_handling()
    test_sampling()
    test_redaction()

    print("=" * 80)
    print("ALL TESTS COMPLETED")
    print("=" * 80)
    print()
    print("Next steps:")
    print("1. Review the JSON output above to verify structured logging")
    print("2. Try running with: PIXSIM_LOG_FORMAT=human python tests/test_structured_logging.py")
    print("3. Try sampling: PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=5 python tests/test_structured_logging.py")
    print()


if __name__ == "__main__":
    main()
