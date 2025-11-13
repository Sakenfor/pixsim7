"""Quick test for log ingestion to TimescaleDB."""
import requests
from datetime import datetime

API_URL = "http://localhost:8001"

def test_single_log_ingestion():
    """Test ingesting a single log entry."""
    print("Testing single log ingestion...")
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),  # No timezone suffix for TIMESTAMP WITHOUT TIME ZONE
        "level": "INFO",
        "service": "test",
        "msg": "test_log_message",
        "job_id": 123
    }

    response = requests.post(
        f"{API_URL}/api/v1/logs/ingest",
        json=log_entry,
        timeout=10
    )

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert "log_id" in data
    print(f"[OK] Single log ingestion successful (ID: {data['log_id']})")
    return data["log_id"]


def test_batch_log_ingestion():
    """Test ingesting multiple logs in batch."""
    print("\nTesting batch log ingestion...")
    logs = []
    for i in range(5):
        logs.append({
            "timestamp": datetime.utcnow().isoformat(),  # No timezone suffix
            "level": "INFO",
            "service": "worker",
            "msg": f"batch_test_log_{i}",
            "job_id": 100 + i,
            "stage": "pipeline:start"
        })

    response = requests.post(
        f"{API_URL}/api/v1/logs/ingest/batch",
        json={"logs": logs},
        timeout=10
    )

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["count"] == 5
    print(f"[OK] Batch ingestion successful ({data['count']} logs)")


def test_query_logs():
    """Test querying logs."""
    print("\nTesting log query...")
    response = requests.get(
        f"{API_URL}/api/v1/logs/query",
        params={"service": "test", "limit": 10},
        timeout=10
    )

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Found {data['total']} logs")
    if data['logs']:
        print(f"Latest log: {data['logs'][0]['msg']}")
    assert response.status_code == 200
    assert data['total'] > 0
    print(f"[OK] Query successful (found {data['total']} logs)")


def test_job_trace():
    """Test getting job trace."""
    print("\nTesting job trace...")
    response = requests.get(
        f"{API_URL}/api/v1/logs/trace/job/100",
        timeout=10
    )

    print(f"Status: {response.status_code}")
    logs = response.json()
    print(f"Found {len(logs)} logs for job 100")
    assert response.status_code == 200
    assert len(logs) > 0
    print(f"[OK] Job trace successful")


if __name__ == "__main__":
    try:
        test_single_log_ingestion()
        test_batch_log_ingestion()
        test_query_logs()
        test_job_trace()
        print("\n" + "="*50)
        print("[OK] ALL TESTS PASSED")
        print("="*50)
    except Exception as e:
        print(f"\n[FAIL] TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
