# PixSim7 Logging Structure

Clean logging architecture with separate logs per component.

---

## 📁 Log Files

All logs are stored in `data/logs/`:

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

### JSON Format (for production/admin panel)

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

### Plain Format (for development/console)

```
2025-11-11 22:30:45 - job_processor - INFO - Processing job #123
```

---

## 📈 Log Levels

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

## 🎉 Summary

**3 log files, 3 purposes:**
1. **backend.log** - API server activity
2. **worker.log** - Background job processing
3. **errors.log** - All errors across components

**Easy to:**
- Debug specific components
- Monitor system health
- Find errors quickly
- Analyze performance
- Track user activity

**View in admin panel:** http://localhost:5173/logs 🎨
