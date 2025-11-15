# Phase 6: Log Ingestion Endpoint - Implementation Complete ✅

**Implementation Date:** 2025-11-13

## Overview

Phase 6 implements a centralized log ingestion and querying system that collects structured logs from all services (API, worker, scripts, frontend) and provides powerful querying capabilities.

## 🎯 Key Features

### 1. **Centralized Log Storage**
- All services can send structured logs to a central database
- Logs are stored with full context (job_id, request_id, artifact_id, etc.)
- Indexed for fast querying across millions of log entries

### 2. **RESTful API Endpoints**
- **POST /api/v1/logs/ingest** - Ingest single log entry
- **POST /api/v1/logs/ingest/batch** - Ingest multiple logs efficiently
- **GET /api/v1/logs/query** - Query logs with filters
- **GET /api/v1/logs/trace/job/{job_id}** - Get complete job trace
- **GET /api/v1/logs/trace/request/{request_id}** - Get complete request trace

### 3. **Automatic Log Forwarding**
- Optional HTTP handler sends logs to ingestion endpoint automatically
- Batched and asynchronous (non-blocking)
- Configurable via environment variables

### 4. **Powerful Querying**
- Filter by: service, level, job_id, request_id, stage, provider_id, time range
- Full-text search in messages and errors
- Pagination support
- Ordered by timestamp (newest first)

## 📋 Implementation Components

### Domain Model

**File:** `pixsim7_backend/domain/log_entry.py`

```python
class LogEntry(SQLModel, table=True):
    """Centralized structured log entry with full context."""
    id: int
    timestamp: datetime
    level: str
    service: str
    env: str
    msg: Optional[str]

    # Correlation fields
    request_id: Optional[str]
    job_id: Optional[int]
    submission_id: Optional[int]
    artifact_id: Optional[int]
    provider_job_id: Optional[str]

    # Context fields
    provider_id: Optional[str]
    operation_type: Optional[str]
    stage: Optional[str]
    user_id: Optional[int]

    # Error fields
    error: Optional[str]
    error_type: Optional[str]

    # Performance fields
    duration_ms: Optional[int]
    attempt: Optional[int]

    # Additional context (JSON)
    extra: Optional[dict]
```

### Service Layer

**File:** `pixsim7_backend/services/log_service.py`

- `ingest_log()` - Ingest single log entry
- `ingest_batch()` - Ingest multiple logs efficiently
- `query_logs()` - Query with filters and pagination
- `get_job_trace()` - Get all logs for a job
- `get_request_trace()` - Get all logs for an API request
- `cleanup_old_logs()` - Delete logs older than N days

### API Endpoints

**File:** `pixsim7_backend/api/v1/logs.py`

All endpoints documented with OpenAPI/Swagger schemas for easy integration.

### HTTP Log Handler

**File:** `pixsim_logging/http_handler.py`

- Asynchronous background worker thread
- Batches logs before sending (configurable batch size)
- Automatic flush on interval (configurable)
- Non-blocking (drops logs if queue is full)
- Graceful shutdown with flush

### Database Migration

**File:** `pixsim7_backend/infrastructure/database/migrations/versions/20251113_0019_6f23b5e5a7ba_add_log_entries_table.py`

Creates `log_entries` table with comprehensive indexes:
- Composite indexes for common query patterns (job+stage, service+level+timestamp, etc.)
- Single-column indexes for all correlation fields
- Optimized for fast querying and tracing

## 🚀 Usage

### 1. Run Database Migration

```bash
cd G:/code/pixsim7
PYTHONPATH=G:/code/pixsim7 alembic upgrade head
```

### 2. Start API Server

The log ingestion endpoints are automatically available when the API starts:

```bash
PYTHONPATH=G:/code/pixsim7 python -m uvicorn pixsim7_backend.main:app --host 0.0.0.0 --port 8001
```

### 3. Enable Automatic Log Forwarding (Optional)

Set environment variable to automatically forward logs from any service:

```bash
export PIXSIM_LOG_INGESTION_URL=http://localhost:8001/api/v1/logs/ingest/batch

# Optional: Configure batching
export PIXSIM_LOG_INGESTION_BATCH_SIZE=10
export PIXSIM_LOG_INGESTION_FLUSH_INTERVAL=5.0

# Then start your service
PYTHONPATH=G:/code/pixsim7 python pixsim7_backend/workers/job_processor.py
```

### 4. Manual Log Ingestion

Send logs directly via HTTP:

```python
import requests

log_entry = {
    "timestamp": "2025-11-13T00:30:00.000Z",
    "level": "info",
    "service": "worker",
    "msg": "job_completed",
    "job_id": 123,
    "provider_id": "pixverse",
    "stage": "provider:complete"
}

response = requests.post(
    "http://localhost:8001/api/v1/logs/ingest",
    json=log_entry
)
```

### 5. Query Logs

```python
import requests

# Query by job
response = requests.get(
    "http://localhost:8001/api/v1/logs/query",
    params={"job_id": 123, "limit": 100}
)
logs = response.json()

# Get complete job trace
response = requests.get(
    "http://localhost:8001/api/v1/logs/trace/job/123"
)
job_trace = response.json()

# Query by stage
response = requests.get(
    "http://localhost:8001/api/v1/logs/query",
    params={
        "stage": "provider:error",
        "provider_id": "pixverse",
        "limit": 50
    }
)
errors = response.json()
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Make sure API is running first
python tests/test_log_ingestion.py
```

Tests cover:
1. ✅ Single log ingestion
2. ✅ Batch log ingestion
3. ✅ Log querying with filters
4. ✅ Job trace retrieval
5. ✅ Request trace retrieval
6. ✅ Advanced multi-filter queries

## 📊 Example Queries

### Get all errors for a provider

```bash
curl "http://localhost:8001/api/v1/logs/query?provider_id=pixverse&level=error&limit=100"
```

### Get complete job lifecycle

```bash
curl "http://localhost:8001/api/v1/logs/trace/job/123"
```

### Search for specific text

```bash
curl "http://localhost:8001/api/v1/logs/query?search=timeout&limit=50"
```

### Get logs in a time range

```bash
curl "http://localhost:8001/api/v1/logs/query?start_time=2025-11-12T00:00:00Z&end_time=2025-11-13T00:00:00Z"
```

### Get all pipeline:artifact stages

```bash
curl "http://localhost:8001/api/v1/logs/query?stage=pipeline:artifact&limit=100"
```

## 🔧 Configuration

### Environment Variables

```bash
# Core logging behavior (structlog via pixsim_logging)
PIXSIM_LOG_FORMAT=human|json                 # human (pretty) or json (default)
PIXSIM_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR|CRITICAL

# Enable automatic HTTP log forwarding from any Python service using pixsim_logging
PIXSIM_LOG_INGESTION_URL=http://localhost:8001/api/v1/logs/ingest/batch
PIXSIM_LOG_ENABLE_HTTP=true|false            # optional, default true when URL set
PIXSIM_LOG_INGESTION_BATCH_SIZE=10          # logs per HTTP batch
PIXSIM_LOG_INGESTION_FLUSH_INTERVAL=5.0     # seconds between flushes

# Direct DB ingestion (DBLogHandler in pixsim_logging)
PIXSIM_LOG_DB_URL=postgresql://user:pass@localhost/pixsim7
# or fallback environment names used elsewhere in the backend
LOG_DATABASE_URL=postgresql://user:pass@localhost/pixsim7
DATABASE_URL=postgresql://user:pass@localhost/pixsim7

# HTTP request log filtering and sampling
PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics    # comma-separated paths to drop (default: /health only)
PIXSIM_LOG_SAMPLE_PATHS=/status:50           # path:rate pairs (1 in N logs)

# Provider status sampling (non-HTTP events)
PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=1        # 1 in N provider:status events (1 = no sampling)
```

### Performance Tuning

**For high-volume logging:**
- Increase batch size: `PIXSIM_LOG_INGESTION_BATCH_SIZE=50`
- Decrease flush interval: `PIXSIM_LOG_INGESTION_FLUSH_INTERVAL=2.0`

**For low-latency logging:**
- Decrease batch size: `PIXSIM_LOG_INGESTION_BATCH_SIZE=5`
- Decrease flush interval: `PIXSIM_LOG_INGESTION_FLUSH_INTERVAL=1.0`

## 🗃️ Database Schema

### Indexes

Optimized for these query patterns:
- **job_id + stage** - Get specific stage for a job
- **job_id + timestamp** - Get job logs chronologically
- **service + level + timestamp** - Get errors/warnings for a service
- **provider_id + timestamp** - Get provider-specific logs
- **stage + timestamp** - Get all logs for a stage
- Individual indexes on all correlation fields

### Storage Recommendations

| Environment | Retention | Storage per Day (estimate) |
|-------------|-----------|---------------------------|
| Development | 7 days    | 10-50 MB                  |
| Staging     | 30 days   | 100-500 MB                |
| Production  | 90 days   | 1-5 GB                    |

### Cleanup

In non-Timescale or simple PostgreSQL deployments, you can use the cleanup
service method to delete old logs explicitly. In a TimescaleDB setup with
retention policies configured via migrations, you normally do **not** need
an additional scheduled cleanup job – Timescale handles it for you.

```python
from pixsim7_backend.services.log_service import LogService

# Delete logs older than 30 days (manual / non-Timescale cleanup)
deleted = await log_service.cleanup_old_logs(days=30)
```

## 📈 Use Cases

### 1. Debugging Job Failures

```python
# Get complete job trace
trace = requests.get(f"{API_URL}/logs/trace/job/{job_id}").json()

# See exactly where the job failed
for log in trace:
    print(f"[{log['timestamp']}] {log['stage']}: {log['msg']}")
```

### 2. Monitoring Provider Performance

```python
# Get all provider:submit events
submits = requests.get(
    f"{API_URL}/logs/query",
    params={"stage": "provider:submit", "provider_id": "pixverse"}
).json()

# Calculate success rate
total = submits['total']
errors = requests.get(
    f"{API_URL}/logs/query",
    params={"stage": "provider:error", "provider_id": "pixverse"}
).json()['total']

success_rate = (total - errors) / total * 100
```

### 3. API Request Tracing

```python
# Get all logs for a specific request
trace = requests.get(
    f"{API_URL}/logs/trace/request/{request_id}"
).json()

# See the complete flow through the API
for log in trace:
    print(f"{log['service']}: {log['msg']}")
```

### 4. Error Analysis

```python
# Get all errors in the last 24 hours
errors = requests.get(
    f"{API_URL}/logs/query",
    params={
        "level": "error",
        "start_time": (datetime.utcnow() - timedelta(days=1)).isoformat()
    }
).json()

# Group by error_type
from collections import Counter
error_types = Counter(log['error_type'] for log in errors['logs'])
print(error_types.most_common(10))
```

## 🔮 Future Enhancements

The system is designed to support:
- **Log aggregation from multiple backend instances** (add instance_id field)
- **Frontend log collection** (JavaScript/browser logs)
- **Real-time log streaming** (WebSocket support)
- **Log analytics dashboard** (aggregations, charts, alerts)
- **Automatic anomaly detection** (ML-based error pattern recognition)
- **Log export** (to external systems like ELK, Splunk, Datadog)

## ✅ Checklist

- [x] LogEntry domain model created
- [x] LogService with ingestion and querying
- [x] API endpoints for ingest and query
- [x] HTTP handler for automatic forwarding
- [x] Database migration with indexes
- [x] Test suite for end-to-end validation
- [x] Documentation and usage examples

## 📝 Files Created

1. `pixsim7_backend/domain/log_entry.py` - Domain model
2. `pixsim7_backend/services/log_service.py` - Service layer
3. `pixsim7_backend/api/v1/logs.py` - API endpoints
4. `pixsim_logging/http_handler.py` - HTTP log forwarder
5. `pixsim7_backend/infrastructure/database/migrations/versions/20251113_0019_6f23b5e5a7ba_add_log_entries_table.py` - Migration
6. `tests/test_log_ingestion.py` - Test suite
7. `docs/PHASE_6_LOG_INGESTION.md` - This document

## 🎉 Summary

Phase 6 is **complete and production-ready**! You now have:

- ✅ Centralized log collection API
- ✅ Powerful querying and tracing
- ✅ Automatic log forwarding (optional)
- ✅ Full job and request tracing
- ✅ Optimized database with indexes
- ✅ Comprehensive test suite

The system is designed to scale to millions of log entries and can be easily integrated with external log analysis tools or used to build custom dashboards.

**Next steps:** Start using the log ingestion in your services, build analytics dashboards, or set up alerting based on error patterns!
