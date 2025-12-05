# Debug Generation Flow

Investigate why a generation is failing or behaving unexpectedly.

## Context
- Backend: `pixsim7/backend/main/`
- Worker: `pixsim7/backend/main/workers/`
- Logs: `data/logs/console/main-api.log`, `data/logs/console/worker.log`

## Investigation Steps

### 1. Check Generation Status
```bash
# Get generation details from API (need auth token from browser)
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/generations/<id>
```

Or check database directly:
```sql
SELECT id, status, error_message, created_at, started_at, completed_at, retry_count
FROM generations WHERE id = <id>;
```

### 2. Check if Worker Received the Job
Look in `data/logs/console/worker.log` for:
- `generation_processing_started` with the generation ID
- `provider:submit` or `provider:error`
- Any exceptions or tracebacks

### 3. Check Provider Submission
```sql
SELECT * FROM provider_submissions WHERE generation_id = <id>;
```

### 4. Trace the Code Path

**API Creation** (`api/v1/generations.py`):
- POST handler creates generation via `GenerationCreationService.create_generation()`
- Check if deduplication is returning old generation

**Creation Service** (`services/generation/creation_service.py`):
- `create_generation()` - main entry point
- Hash deduplication at line ~183
- Cache lookup at line ~213
- ARQ job queueing at line ~285

**Worker** (`workers/job_processor.py`):
- `process_generation()` - picks up from ARQ queue
- Account selection, credit check, provider execution

**Provider** (`services/provider/adapters/pixverse_operations.py`):
- `execute()` routes to operation-specific methods
- `_generate_image_to_video()`, `_generate_text_to_video()`, etc.

### 5. Common Issues

**"Deduplication returning old failed generation"**
- Check `self.cache.find_by_hash()` in creation_service
- Failed generations should be skipped (status check)

**"NameError: GenerationOptions not defined"**
- SDK import failed in pixverse_operations.py
- Check if pixverse-py is installed: `pip show pixverse-py`

**"Generation stuck in pending"**
- Worker not running or not picking up jobs
- Check ARQ/Redis connection
- Check `requeue_pending_generations` cron job

**"Generation stuck in processing"**
- Status poller not running
- Provider API not responding
- Check `poll_job_statuses` cron job

### 6. Verify Code is Actually Running

Add print statements at entry points:
```python
# In create_generation():
print(f"[DEBUG] create_generation called with provider={provider_id}")

# In process_generation():
print(f"[DEBUG] process_generation called for id={generation_id}")
```

If prints don't appear after restart:
- Check you're editing the right file (not a copy)
- Check backend is running from correct directory
- Check for .pyc bytecode caching: `find . -name "*.pyc" -delete`

### 7. Check Which Python/Environment

```bash
# In backend console or where you start it:
which python
python -c "import pixsim7; print(pixsim7.__file__)"
```

Make sure the running process uses the same Python environment where you're editing files.
