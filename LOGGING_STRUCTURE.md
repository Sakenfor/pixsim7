# PixSim7 Logging Structure

Unified, structured logging across API, workers, scripts, and (future) frontend.

This document now covers:
1. Field Catalog (shared spec)
2. Stage Taxonomy
3. Root Logging Package Usage (`pixsim_logging`)
4. Legacy File-Based Logs (transition plan)
5. Security & Redaction
6. Sampling & Performance
7. Examples

---

## 📁 Log Files
Legacy file targets (still supported during transition) stored in `data/logs/`:

### **1. backend.log**
**What:** API server logs (FastAPI/uvicorn)
**Contains:**
- HTTP requests/responses
- API endpoint activity
- Authentication events
- Database queries
- General API operations

**Usage:**
```bash
# Watch backend logs
tail -f data/logs/backend.log

# Search for errors
grep ERROR data/logs/backend.log

# Filter by user
grep "user_id.*123" data/logs/backend.log
```

---

### **2. worker.log**
**What:** Background worker logs (ARQ job processor)
**Contains:**
- Job processing events
- Status polling
- Provider API calls
- Asset creation
- Job success/failure
- Worker health

**Usage:**
```bash
# Watch worker activity
tail -f data/logs/worker.log

# Search for job processing
grep "job_id.*456" data/logs/worker.log

# Check worker status
grep "poll_job_statuses" data/logs/worker.log
```

---

### **3. errors.log**
**What:** All ERROR+ logs across ALL components
**Contains:**
- Backend API errors
- Worker errors
- Database errors
- Provider errors
- System exceptions

**Usage:**
```bash
# Watch all errors
tail -f data/logs/errors.log

# Count errors today
grep $(date +%Y-%m-%d) data/logs/errors.log | wc -l

# Find critical errors
grep CRITICAL data/logs/errors.log
```

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Backend API logs
LOG_FILE=data/logs/backend.log

# Worker logs (ARQ)
WORKER_LOG_FILE=data/logs/worker.log

# Error logs (all components)
ERROR_LOG_FILE=data/logs/errors.log

# Log level
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL

# Format (JSON for production, plain for development)
JSON_LOGS=false
```

### Starting Components

**Backend:**
```bash
cd G:/code/pixsim7
PYTHONPATH=G:/code/pixsim7 python -m uvicorn pixsim7_backend.main:app --host 0.0.0.0 --port 8001
```
Logs to: `data/logs/backend.log` + `data/logs/errors.log`

**Worker:**
```bash
cd G:/code/pixsim7
PYTHONPATH=G:/code/pixsim7 arq pixsim7_backend.workers.arq_worker.WorkerSettings
```
Logs to: `data/logs/worker.log` + `data/logs/errors.log`

---

## 📊 Log Format

### JSON Format (production / ingestion)

```json
{
  "timestamp": "2025-11-11T22:30:45.123456Z",
  "level": "INFO",
  "logger": "job_processor",
  "message": "Processing job #123",
  "module": "job_processor",
  "function": "process_job",
  "line": 45,
  "user_id": 1,
  "job_id": 123
}
```

### Human Format (development / console)

```
2025-11-11 22:30:45 - job_processor - INFO - Processing job #123
```

---

## 📈 Log Levels
## 🧱 Field Catalog (Spec)

| Field | Purpose | Notes |
|-------|---------|-------|
| timestamp | Event time (UTC ISO) | Added by structlog TimeStamper |
| level | Severity | DEBUG / INFO / WARN / ERROR / CRITICAL |
| msg | Short event message | Avoid concatenated strings; use context fields |
| service | Component emitting | api / worker / script-launcher / game-service / frontend |
| env | Deployment environment | dev / staging / prod |
| request_id | HTTP request correlation | Added by FastAPI middleware (future) |
| job_id | Job lifecycle correlation | Bound at pipeline start |
| submission_id | ProviderSubmission ID | After provider submit |
| artifact_id | GenerationArtifact ID | After artifact creation |
| provider_job_id | Provider internal job ID | From provider response |
| provider_id | Provider identifier | pixverse / sora / etc. |
| operation_type | Generation operation | text_to_video, image_to_video... |
| stage | Lifecycle stage | See taxonomy below |
| attempt | Retry attempt number | 0 initial, increment on retry |
| duration_ms | Duration of stage when available | Calculated post completion |
| error | Human-readable error | Only on failures |
| error_type | Exception class / category | Enables grouping |
| user_id | Originating user (optional) | Avoid email / PII |

### Optional / Future Fields
| Field | Purpose |
| reproducible_hash | Canonical artifact hash |
| account_id | Provider account used |
| retry_policy | Policy applied (exponential/backoff) |
| content_flags | Safety classification summary |

## 🌀 Stage Taxonomy

| Stage | Description |
|-------|-------------|
| pipeline:start | Pipeline run invoked for job |
| pipeline:artifact | Canonical params + artifact created |
| provider:map_params | Provider-specific mapping performed |
| provider:submit | Submission sent to provider |
| provider:status | Status poll (sampled) |
| provider:complete | Provider signaled completion |
| provider:error | Provider returned error |
| retry:decision | Retry strategy evaluated |

## 🧩 Root Logging Package

Usage (Python):
```python
from pixsim_logging import configure_logging, get_logger
logger = configure_logging("api")
logger.info("pipeline:start", job_id=123, operation_type="text_to_video")
```

Environment overrides:
```
PIXSIM_LOG_FORMAT=human        # human console output
PIXSIM_LOG_LEVEL=DEBUG         # log level threshold
PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=5  # sample provider:status 1 in 5
```

### Binding Helpers
```python
from pixsim_logging import bind_job_context
logger = bind_job_context(logger, job_id=123, operation_type="text_to_video")
logger.info("pipeline:artifact", artifact_id=999)
```

## 🔐 Security & Redaction
Sensitive keys automatically redacted: `api_key`, `jwt_token`, `authorization`, `password`, `secret`.
Never log full credentials, prompts containing PII, or unfiltered user-supplied headers.

## 🔁 Sampling & Performance
`provider:status` events can be high volume. Sampling controlled by `PIXSIM_LOG_SAMPLING_PROVIDER_STATUS` (default 1 = no sampling).
Log large payloads as references (IDs) rather than entire JSON blocks.

## 🧪 Examples
### Artifact Creation
```json
{
    "timestamp":"2025-11-12T12:34:56.789Z",
    "level":"INFO",
    "service":"worker",
    "stage":"pipeline:artifact",
    "job_id":123,
    "artifact_id":456,
    "operation_type":"text_to_video",
    "msg":"artifact_created"
}
```

### Provider Submission
```json
{
    "timestamp":"2025-11-12T12:34:57.010Z",
    "level":"INFO",
    "service":"worker",
    "stage":"provider:submit",
    "job_id":123,
    "submission_id":321,
    "provider_id":"pixverse",
    "provider_job_id":"pv_job_abc",
    "operation_type":"text_to_video",
    "msg":"submitted"
}
```

### Provider Error
```json
{
    "timestamp":"2025-11-12T12:35:04.444Z",
    "level":"ERROR",
    "service":"worker",
    "stage":"provider:error",
    "job_id":123,
    "submission_id":321,
    "provider_id":"pixverse",
    "error":"timeout",
    "error_type":"TimeoutError",
    "attempt":0,
    "msg":"provider_submission_failed"
}
```

## 🔄 Transition Plan
1. Introduce `pixsim_logging` (Phase 2)
2. Migrate worker & pipeline first
3. Migrate API startup & middleware
4. Deprecate direct file handlers; keep errors.log until ingestion added
5. Introduce client (frontend) structured emitter

## 🧭 Contributor Guide (Initial)
1. Import and configure logger once at entrypoint.
2. Bind context early (job_id, operation_type).
3. Use stage strings from taxonomy.
4. Add new stage? Update STAGES in `spec.py` and this doc.
5. Avoid logging entire provider payload—log IDs.
6. For retries, increment attempt and log `retry:decision` with reason.

---

| Level | Usage | Example |
|-------|-------|---------|
| **DEBUG** | Detailed info for debugging | "Selecting account for provider pixverse" |
| **INFO** | Normal operations | "Job #123 completed successfully" |
| **WARNING** | Potential issues | "Account low on credits (5 remaining)" |
| **ERROR** | Errors that need attention | "Failed to submit job: API timeout" |
| **CRITICAL** | Severe errors | "Database connection lost" |

---

## 🔍 Viewing Logs in Admin Panel

The admin panel provides a web UI for viewing logs:

**URL:** http://localhost:5173/logs

**Features:**
- Filter by log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Filter by logger name
- Search messages
- Filter by user_id or job_id
- View exception stack traces
- Auto-refresh
- Pagination

**Quick Filters:**
- 🔴 Errors Only - Show only ERROR/CRITICAL
- ⚠️ Warnings - Show warnings
- ℹ️ Info - Show info logs
- 🐛 Debug - Show debug logs

---

## 🗂️ Log Rotation (Production)

For production, use log rotation to manage disk space:

### Using logrotate (Linux)

Create `/etc/logrotate.d/pixsim7`:

```bash
/path/to/pixsim7/data/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 pixsim pixsim
    sharedscripts
    postrotate
        # Reload services after rotation
        systemctl reload pixsim7-backend
        systemctl reload pixsim7-worker
    endscript
}
```

### Manual Rotation

```bash
# Rotate logs manually
cd data/logs
mv backend.log backend.log.$(date +%Y%m%d)
mv worker.log worker.log.$(date +%Y%m%d)
mv errors.log errors.log.$(date +%Y%m%d)

# Compress old logs
gzip backend.log.*
gzip worker.log.*
gzip errors.log.*

# Restart services to create new files
systemctl restart pixsim7-backend
systemctl restart pixsim7-worker
```

---

## 🎯 Best Practices

### 1. Use Structured Logging

**Good:**
```python
logger.info("Job completed", extra={"job_id": 123, "duration_sec": 45})
```

**Bad:**
```python
logger.info(f"Job {job_id} completed in {duration} seconds")
```

### 2. Log Context

Use `LogContext` for adding context to all logs in a block:

```python
from pixsim7_backend.infrastructure.logging import LogContext

with LogContext(user_id=user.id, job_id=job.id):
    logger.info("Processing job")  # Includes user_id and job_id automatically
```

### 3. Appropriate Log Levels

- **DEBUG:** Internal state, variable values
- **INFO:** User actions, successful operations
- **WARNING:** Recoverable issues, deprecations
- **ERROR:** Failed operations that need attention
- **CRITICAL:** System-wide failures

### 4. Don't Log Sensitive Data

❌ **Never log:**
- Passwords
- API keys
- JWT tokens
- Credit card numbers
- Personal information (unless necessary and encrypted)

---

## 🐛 Debugging

### Common Tasks

**Find all errors for a specific job:**
```bash
grep "job_id.*123" data/logs/errors.log
```

**Watch worker activity in real-time:**
```bash
tail -f data/logs/worker.log | grep process_job
```

**Count requests per minute:**
```bash
grep "$(date +%Y-%m-%d\ %H:%M)" data/logs/backend.log | wc -l
```

**Find slow operations:**
```bash
grep "duration" data/logs/backend.log | grep -E "[0-9]{3,}"
```

---

## 📦 Storage Recommendations

| Environment | Retention | Rotation |
|-------------|-----------|----------|
| **Development** | 7 days | Daily |
| **Staging** | 14 days | Daily |
| **Production** | 30-90 days | Daily |
| **Errors** | 90+ days | Weekly |

**Estimated disk usage:**
- Backend: ~50-200 MB/day
- Worker: ~100-500 MB/day (varies with job volume)
- Errors: ~10-50 MB/day

**Total:** ~500 MB - 2 GB per day with moderate traffic

---

---

## ✅ Implementation Status

**Last Updated:** 2025-11-12

### Completed Components

**Phase 1: Entrypoint Integration**
- ✅ `pixsim7_backend/main.py` (FastAPI) - Uses `pixsim_logging.configure_logging("api")`
- ✅ `pixsim7_backend/workers/job_processor.py` - Uses `pixsim_logging.get_logger()`
- ✅ Configured service names: "api" and "worker"

**Phase 2: Request ID Middleware**
- ✅ `pixsim7_backend/api/middleware.py` - Updated to use `structlog.contextvars`
- ✅ Request IDs automatically bind to all logs within a request context
- ✅ `pixsim_logging/config.py` - Added `structlog.contextvars.merge_contextvars` processor

**Phase 3: Pipeline Logging**
- ✅ `pixsim7_backend/services/submission/pipeline.py`
  - Uses structured logging with proper stages: `pipeline:start`, `pipeline:artifact`, `provider:submit`, `provider:error`
  - Uses `bind_job_context()` and `bind_artifact_context()` helpers
  - All context (job_id, operation_type, provider_id, artifact_id, submission_id) flows through logs

**Phase 4: Provider Adapter Logging**
- ✅ `pixsim7_backend/services/provider/adapters/pixverse.py`
  - Structured logging in `execute()`, `check_status()`, `upload_asset()`, `extract_embedded_assets()`
  - Stage taxonomy: `provider:status`, `provider:error`
  - All logs include provider_id, operation_type, and error context

### Test Results

**Test Script:** `tests/test_structured_logging.py`

Successfully verified:
1. ✅ Logger initializes with service name and environment
2. ✅ Logs emit in JSON format when `PIXSIM_LOG_FORMAT=json`
3. ✅ Job context binding (`job_id`, `operation_type`, `provider_id`)
4. ✅ Artifact context binding (`artifact_id`, `submission_id`)
5. ✅ Stages emit correctly: `pipeline:start`, `pipeline:artifact`, `provider:submit`, `provider:status`, `provider:complete`
6. ✅ Error handling with `provider:error` stage
7. ✅ Sensitive data redaction (`api_key`, `password`, `jwt_token` → `***redacted***`)
8. ✅ Sampling support via `PIXSIM_LOG_SAMPLING_PROVIDER_STATUS`

### Usage in Code

**In Services:**
```python
from pixsim_logging import get_logger, bind_job_context

logger = get_logger()

async def process_job(job_id: int):
    job_logger = bind_job_context(logger, job_id=job_id, operation_type="text_to_video")
    job_logger.info("pipeline:start", msg="processing_started")
    # ... processing logic ...
    job_logger.info("provider:submit", provider_job_id="pv_123", msg="submitted")
```

**In Entrypoints:**
```python
from pixsim_logging import configure_logging

# At application startup
logger = configure_logging("api")  # or "worker", "script-launcher", etc.
```

**In Middleware (Already Implemented):**
```python
import structlog

# In FastAPI middleware
structlog.contextvars.bind_contextvars(request_id=request_id)
```

### Example Output

**JSON Format (Production):**
```json
{
  "timestamp": "2025-11-12T22:53:59.696742Z",
  "level": "info",
  "service": "worker",
  "env": "dev",
  "job_id": 123,
  "operation_type": "text_to_video",
  "provider_id": "pixverse",
  "stage": "pipeline:start",
  "msg": "job_processing_started"
}
```

```json
{
  "timestamp": "2025-11-12T22:53:59.696897Z",
  "level": "error",
  "service": "worker",
  "env": "dev",
  "job_id": 999,
  "operation_type": "image_to_video",
  "provider_id": "pixverse",
  "stage": "provider:error",
  "error": "Simulated provider error",
  "error_type": "ValueError",
  "attempt": 0,
  "msg": "provider_submission_failed"
}
```

### Migration Status

**Completed:**
- [x] Core logging package (`pixsim_logging/`)
- [x] API entrypoint integration
- [x] Worker entrypoint integration
- [x] Request ID middleware
- [x] Pipeline structured logging
- [x] Provider adapter logging (Pixverse)
- [x] Test suite

**Future (Not Required Yet):**
- [ ] Log ingestion endpoint for centralized collection
- [ ] Frontend structured logger
- [ ] Deprecate legacy file handlers (keep during transition)
- [ ] Implement `provider:map_params` stage
- [ ] Add `duration_ms` calculation
- [ ] Expand sampling to other high-volume events

### Testing

```bash
# JSON format (production)
PIXSIM_LOG_FORMAT=json python tests/test_structured_logging.py

# Human format (development)
PIXSIM_LOG_FORMAT=human python tests/test_structured_logging.py

# With sampling enabled
PIXSIM_LOG_SAMPLING_PROVIDER_STATUS=5 python tests/test_structured_logging.py
```

### Next Steps

1. **Enable Pipeline in Production** - Set `PIXSIM7_USE_PIPELINE=1` in environment
2. **Monitor Logs** - Verify all required fields are present in JSON format
3. **Performance Tuning** - Adjust `PIXSIM_LOG_SAMPLING_PROVIDER_STATUS` if needed
4. **Future Enhancements** - Build log ingestion endpoint, add duration tracking

---

## 🎉 Summary

**3 log files, 3 purposes:**
1. **backend.log** - API server activity
2. **worker.log** - Background job processing
3. **errors.log** - All errors across components

**Structured logging features:**
- Unified field catalog across all services
- Stage taxonomy for pipeline tracing
- Context propagation (job_id, request_id, etc.)
- Automatic sensitive data redaction
- Configurable sampling for high-volume events
- JSON output for ingestion or human-readable for development

**Easy to:**
- Debug specific components
- Monitor system health
- Find errors quickly
- Analyze performance
- Track user activity
- Trace job lifecycle end-to-end

**View in admin panel:** http://localhost:5173/logs 🎨
