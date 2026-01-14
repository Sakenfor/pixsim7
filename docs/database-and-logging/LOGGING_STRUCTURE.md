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

## Viewing Logs

The admin panel UI has been removed. Use the launcher log tab for live output and query `log_entries` in Postgres for structured log history.

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

**Launcher log tab:** http://localhost:5173/logs 🎨
