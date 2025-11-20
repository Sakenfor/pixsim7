# Redis & Background Workers Setup

**Status:** ✅ Complete - Redis + ARQ workers are configured and ready!

---

## 🚀 Quick Start

### 1. Install & Start Redis

**Option A: Docker (Recommended)**
```bash
# Start Redis in Docker
docker run -d -p 6379:6379 --name pixsim-redis redis:7-alpine

# Check it's running
docker ps | grep pixsim-redis
```

**Option B: Native Install**
```bash
# Windows (with Chocolatey)
choco install redis-64
redis-server

# macOS
brew install redis
brew services start redis

# Linux
sudo apt install redis-server
sudo systemctl start redis
```

**Verify Redis is working:**
```bash
redis-cli ping
# Should return: PONG
```

---

### 2. Configure Environment

Update your `.env` file:
```env
# Redis connection
REDIS_URL=redis://localhost:6379/0

# Worker settings
ARQ_MAX_JOBS=10          # Max concurrent jobs
ARQ_JOB_TIMEOUT=3600     # 1 hour timeout per job
ARQ_MAX_TRIES=3          # Retry failed jobs 3 times
```

---

### 3. Start the System

You need **3 processes running**:

#### Terminal 1: API Server
```bash
cd /g/code/pixsim7
PYTHONPATH=/g/code/pixsim7 python pixsim7_backend/main.py
```

**Expected output:**
```
✅ Database initialized
✅ Redis connected
✅ ARQ pool ready
✅ Providers registered
✅ PixSim7 ready!
INFO:     Uvicorn running on http://0.0.0.0:8000
```

#### Terminal 2: ARQ Worker
```bash
cd /g/code/pixsim7
PYTHONPATH=/g/code/pixsim7 arq pixsim7_backend.workers.arq_worker.WorkerSettings
```

**Expected output:**
```
🚀 PixSim7 ARQ Worker Starting
✅ Job processor registered: process_job
✅ Status poller registered: poll_job_statuses (every 10s)
```

#### Terminal 3: Monitor (Optional)
```bash
# Watch Redis queue
redis-cli MONITOR

# Or watch ARQ queue stats
redis-cli
> KEYS arq:*
> LLEN arq:queue:default
```

---

## 📋 How It Works

### 1. Job Creation Flow

```
User → POST /api/v1/jobs → JobService.create_job()
                                ↓
                        1. Save job to database
                        2. Emit JOB_CREATED event
                        3. Queue job via ARQ
                                ↓
                        Job queued in Redis
```

### 2. Job Processing Flow

```
ARQ Worker picks up job → process_job()
                             ↓
                    1. Get job from database
                    2. Select provider account
                    3. Submit to provider (Pixverse)
                    4. Update job status → PROCESSING
```

### 3. Status Polling Flow

```
Every 10 seconds → poll_job_statuses()
                        ↓
                1. Find all PROCESSING jobs
                2. Check status with provider
                3. If COMPLETED:
                   - Create asset
                   - Mark job as COMPLETED
                4. If FAILED:
                   - Mark job as FAILED
```

---

## 🔍 Monitoring

### Check Redis Status
```bash
# Via API
curl http://localhost:8000/health

# Via Redis CLI
redis-cli info stats
redis-cli LLEN arq:queue:default  # Queue length
```

### Check Worker Status
```bash
# Worker logs show:
# - Jobs processed
# - Polling activity
# - Errors/retries

# In worker terminal:
# Look for: "Job X queued for processing"
# Look for: "Poll complete: X checked, Y completed..."
```

### Check Job Status
```bash
# Via API
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/jobs

# Job status progression:
# PENDING → PROCESSING → COMPLETED
#                      ↘ FAILED
```

---

## 🛠️ Worker Commands

### Start Worker
```bash
cd /g/code/pixsim7
PYTHONPATH=/g/code/pixsim7 arq pixsim7_backend.workers.arq_worker.WorkerSettings
```

### Run Specific Worker Task Manually
```bash
# Test job processor
cd /g/code/pixsim7
PYTHONPATH=/g/code/pixsim7 python -c "
from pixsim7_backend.workers.job_processor import process_job
import asyncio
asyncio.run(process_job(job_id=1))
"

# Test status poller
cd /g/code/pixsim7
PYTHONPATH=/g/code/pixsim7 python -c "
from pixsim7_backend.workers.status_poller import poll_job_statuses
import asyncio
asyncio.run(poll_job_statuses())
"
```

### Worker Configuration
See `workers/arq_worker.py` for settings:
- `max_jobs`: Max concurrent jobs (default: 10)
- `job_timeout`: Timeout per job (default: 3600s = 1 hour)
- `max_tries`: Retry failed jobs (default: 3)
- `cron_jobs`: Status poller runs every 10 seconds

---

## 🐛 Troubleshooting

### Redis Connection Error
```
Error: Redis not available
```
**Solution:**
1. Check Redis is running: `redis-cli ping`
2. Check REDIS_URL in `.env`
3. Server will still start but workers won't work

### Worker Not Processing Jobs
**Check:**
1. Worker is running (see Terminal 2 above)
2. Redis is running
3. Job status is PENDING (not already PROCESSING)
4. Check worker logs for errors

### Jobs Stuck in PENDING
**Possible causes:**
1. Worker not running → Start worker
2. Redis not available → Start Redis
3. No provider accounts → Add accounts via API
4. Account exhausted/cooldown → Wait or add more accounts

### Jobs Stuck in PROCESSING
**Possible causes:**
1. Status poller not running (should run every 10s automatically)
2. Provider API issues
3. Check worker logs for errors

---

## 📈 Performance Tuning

### For Many Jobs (1000+)

Increase worker capacity in `.env`:
```env
ARQ_MAX_JOBS=20          # More concurrent jobs
ARQ_JOB_TIMEOUT=7200     # 2 hour timeout
```

Start multiple workers:
```bash
# Terminal 2
arq pixsim7_backend.workers.arq_worker.WorkerSettings

# Terminal 3
arq pixsim7_backend.workers.arq_worker.WorkerSettings

# Terminal 4
arq pixsim7_backend.workers.arq_worker.WorkerSettings
```

### For Fast Polling

Update status poller frequency in `workers/arq_worker.py`:
```python
cron_jobs = [
    cron(
        poll_job_statuses,
        second={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},  # Every 5 seconds
    )
]
```

---

## ✅ Verification Checklist

After setup, verify:
- [ ] Redis responds to `redis-cli ping`
- [ ] API server shows "✅ Redis connected"
- [ ] Worker shows "🚀 PixSim7 ARQ Worker Starting"
- [ ] Create job via API → Job queued
- [ ] Worker logs show "Processing job X"
- [ ] Status poller runs every 10s
- [ ] Job progresses: PENDING → PROCESSING → COMPLETED

---

## 🎯 Next Steps

**You're all set!**

1. Start Redis
2. Start API server
3. Start ARQ worker
4. Create a job via API
5. Watch it process automatically!

**For importing videos:**
- Jobs will be queued via ARQ
- Workers process them in parallel
- Status updates automatically every 10s
- Assets created when complete

**See also:**
- `CURRENT_STATUS_AND_NEXT_STEPS.md` - Overall project status
- `GETTING_STARTED.md` - Initial setup
- `workers/arq_worker.py` - Worker configuration
