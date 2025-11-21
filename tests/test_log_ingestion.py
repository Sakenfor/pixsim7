"""
Test log ingestion endpoint.

This script demonstrates Phase 6: Log Ingestion Endpoint functionality.

Usage:
    # Start the API server first (in another terminal)
    python tests/test_log_ingestion.py
"""
import sys
import os
import requests
import time
from datetime import datetime

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# Test configuration
API_BASE_URL = "http://localhost:8001"
INGEST_URL = f"{API_BASE_URL}/api/v1/logs/ingest"
BATCH_INGEST_URL = f"{API_BASE_URL}/api/v1/logs/ingest/batch"
QUERY_URL = f"{API_BASE_URL}/api/v1/logs/query"
JOB_TRACE_URL = f"{API_BASE_URL}/api/v1/logs/trace/job"
REQUEST_TRACE_URL = f"{API_BASE_URL}/api/v1/logs/trace/request"
DISTINCT_URL = f"{API_BASE_URL}/api/v1/logs/distinct"


def test_single_log_ingestion():
    """Test ingesting a single log entry."""
    print("=" * 80)
    print("TEST 1: Single Log Ingestion")
    print("=" * 80)

    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "level": "info",
        "service": "test",
        "env": "test",
        "msg": "test_log_message",
        "job_id": 123,
        "operation_type": "text_to_video",
        "provider_id": "pixverse",
        "stage": "pipeline:start"
    }

    try:
        response = requests.post(INGEST_URL, json=log_entry, timeout=5)
        response.raise_for_status()
        result = response.json()

        print(f"✅ Log ingested successfully")
        print(f"   Log ID: {result['log_id']}")
        print(f"   Message: {result['message']}")
        print()
        return True
    except Exception as e:
        print(f"❌ Failed to ingest log: {e}")
        print()
        return False


def test_batch_log_ingestion():
    """Test ingesting multiple logs in a batch."""
    print("=" * 80)
    print("TEST 2: Batch Log Ingestion")
    print("=" * 80)

    # Simulate a complete job trace
    job_id = 456
    logs = [
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "worker",
            "env": "test",
            "msg": "job_processing_started",
            "job_id": job_id,
            "operation_type": "image_to_video",
            "provider_id": "pixverse",
            "stage": "pipeline:start"
        },
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "worker",
            "env": "test",
            "msg": "account_selected",
            "job_id": job_id,
            "operation_type": "image_to_video",
            "provider_id": "pixverse",
            "extra": {"account_id": 789}
        },
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "worker",
            "env": "test",
            "msg": "artifact_created",
            "job_id": job_id,
            "operation_type": "image_to_video",
            "provider_id": "pixverse",
            "artifact_id": 999,
            "stage": "pipeline:artifact"
        },
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "worker",
            "env": "test",
            "msg": "job_submitted_to_provider",
            "job_id": job_id,
            "operation_type": "image_to_video",
            "provider_id": "pixverse",
            "artifact_id": 999,
            "submission_id": 888,
            "provider_job_id": "pv_test_123",
            "stage": "provider:submit"
        },
    ]

    try:
        response = requests.post(BATCH_INGEST_URL, json={"logs": logs}, timeout=5)
        response.raise_for_status()
        result = response.json()

        print(f"✅ Batch ingested successfully")
        print(f"   Count: {result['count']} logs")
        print(f"   Message: {result['message']}")
        print()
        return job_id
    except Exception as e:
        print(f"❌ Failed to ingest batch: {e}")
        print()
        return None


def test_query_logs():
    """Test querying logs with filters."""
    print("=" * 80)
    print("TEST 3: Query Logs")
    print("=" * 80)

    # Query by service
    try:
        params = {
            "service": "test",
            "limit": 10
        }
        response = requests.get(QUERY_URL, params=params, timeout=5)
        response.raise_for_status()
        result = response.json()

        print(f"✅ Query successful")
        print(f"   Total logs: {result['total']}")
        print(f"   Returned: {len(result['logs'])} logs")
        if result['logs']:
            print(f"   Latest log: {result['logs'][0]['msg']}")
        print()
        return True
    except Exception as e:
        print(f"❌ Failed to query logs: {e}")
        print()
        return False


def test_job_trace(job_id):
    """Test getting complete job trace."""
    print("=" * 80)
    print("TEST 4: Job Trace")
    print("=" * 80)

    try:
        response = requests.get(f"{JOB_TRACE_URL}/{job_id}", timeout=5)
        response.raise_for_status()
        logs = response.json()

        print(f"✅ Job trace retrieved successfully")
        print(f"   Job ID: {job_id}")
        print(f"   Total logs: {len(logs)}")
        print(f"\n   Log stages:")
        for log in logs:
            stage = log.get('stage', 'N/A')
            msg = log.get('msg', 'N/A')
            timestamp = log.get('timestamp', 'N/A')
            print(f"      [{timestamp}] {stage:30s} {msg}")
        print()
        return True
    except Exception as e:
        print(f"❌ Failed to get job trace: {e}")
        print()
        return False


def test_request_trace():
    """Test getting request trace."""
    print("=" * 80)
    print("TEST 5: Request Trace")
    print("=" * 80)

    # First, make a request to generate logs with a request_id
    request_id = "test_request_" + str(int(time.time()))

    # Simulate logs with request_id
    logs = [
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "api",
            "env": "test",
            "msg": "request_received",
            "request_id": request_id
        },
        {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": "info",
            "service": "api",
            "env": "test",
            "msg": "request_processed",
            "request_id": request_id
        },
    ]

    # Ingest logs
    try:
        response = requests.post(BATCH_INGEST_URL, json={"logs": logs}, timeout=5)
        response.raise_for_status()
    except Exception as e:
        print(f"❌ Failed to ingest request logs: {e}")
        return False

    # Get trace
    try:
        response = requests.get(f"{REQUEST_TRACE_URL}/{request_id}", timeout=5)
        response.raise_for_status()
        trace_logs = response.json()

        print(f"✅ Request trace retrieved successfully")
        print(f"   Request ID: {request_id}")
        print(f"   Total logs: {len(trace_logs)}")
        for log in trace_logs:
            msg = log.get('msg', 'N/A')
            timestamp = log.get('timestamp', 'N/A')
            print(f"      [{timestamp}] {msg}")
        print()
        return True
    except Exception as e:
        print(f"❌ Failed to get request trace: {e}")
        print()
        return False


def test_advanced_query():
    """Test advanced querying with multiple filters."""
    print("=" * 80)
    print("TEST 6: Advanced Query (Multiple Filters)")
    print("=" * 80)

    try:
        params = {
            "service": "worker",
            "stage": "provider:submit",
            "provider_id": "pixverse",
            "limit": 10
        }
        response = requests.get(QUERY_URL, params=params, timeout=5)
        response.raise_for_status()
        result = response.json()

        print(f"✅ Advanced query successful")
        print(f"   Filters: service=worker, stage=provider:submit, provider_id=pixverse")
        print(f"   Total matching logs: {result['total']}")
        print(f"   Returned: {len(result['logs'])} logs")
        print()
        return True
    except Exception as e:
        print(f"❌ Failed advanced query: {e}")
        print()
        return False


def test_distinct_values():
    """Test fetching distinct values for base and dynamic fields."""
    print("=" * 80)
    print("TEST 7: Distinct Values")
    print("=" * 80)

    try:
        # Base column distinct (stage)
        params = {"field": "stage", "service": "worker", "limit": 50}
        r1 = requests.get(DISTINCT_URL, params=params, timeout=5)
        r1.raise_for_status()
        d1 = r1.json()
        print(f"✅ Distinct stages fetched; count={d1.get('count')}")

        # Dynamic field distinct (extra.account_id)
        params = {"field": "account_id", "service": "worker", "limit": 50}
        r2 = requests.get(DISTINCT_URL, params=params, timeout=5)
        r2.raise_for_status()
        d2 = r2.json()
        print(f"✅ Distinct account_id fetched; count={d2.get('count')}")
        return True
    except Exception as e:
        print(f"❌ Failed distinct values: {e}")
        print()
        return False


def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("LOG INGESTION ENDPOINT TEST SUITE (Phase 6)")
    print("=" * 80)
    print(f"API Base URL: {API_BASE_URL}")
    print("=" * 80)
    print()

    # Check if API is running
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=2)
        response.raise_for_status()
        print("✅ API server is running\n")
    except Exception as e:
        print(f"❌ API server is not running at {API_BASE_URL}")
        print(f"   Error: {e}")
        print("\n   Please start the API server first:")
        print("   PYTHONPATH=G:/code/pixsim7 python -m uvicorn pixsim7.backend.main.main:app --host 0.0.0.0 --port 8001")
        print()
        return 1

    # Run tests
    results = []

    results.append(("Single Log Ingestion", test_single_log_ingestion()))
    time.sleep(0.5)

    job_id = test_batch_log_ingestion()
    results.append(("Batch Log Ingestion", job_id is not None))
    time.sleep(0.5)

    results.append(("Query Logs", test_query_logs()))
    time.sleep(0.5)

    if job_id:
        results.append(("Job Trace", test_job_trace(job_id)))
    time.sleep(0.5)

    results.append(("Request Trace", test_request_trace()))
    time.sleep(0.5)

    results.append(("Advanced Query", test_advanced_query()))

    # Distinct values endpoint
    results.append(("Distinct Values", test_distinct_values()))

    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status:10s} {test_name}")

    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    print()
    print(f"Results: {passed_count}/{total_count} tests passed")
    print("=" * 80)
    print()

    if passed_count == total_count:
        print("🎉 All tests passed! Phase 6 (Log Ingestion) is working correctly.")
    else:
        print("⚠️  Some tests failed. Please check the errors above.")

    print()
    print("Next steps:")
    print("1. Enable log ingestion in services by setting:")
    print("   export PIXSIM_LOG_INGESTION_URL=http://localhost:8001/api/v1/logs/ingest/batch")
    print("2. Restart services to automatically send logs to the ingestion endpoint")
    print("3. Query logs using the API or build a UI dashboard")
    print()

    return 0 if passed_count == total_count else 1


if __name__ == "__main__":
    sys.exit(main())
