# Generation System Issues Report

## Overview

This document outlines issues discovered in the current generation/jobs system after the refactoring from `Job` to `Generation` model.

**Generated**: 2025-11-18
**Scope**: Backend generation service, worker integration, and job processing

---

## Critical Issues

### 1. ⚠️ **CRITICAL: Worker Function Name Mismatch**

**Location**: `pixsim7_backend/services/generation/generation_service.py:184`

**Problem**:
The `GenerationService.create_generation()` method tries to enqueue a job named `"process_generation"`:

```python
await arq_pool.enqueue_job(
    "process_generation",  # New worker function name
    generation_id=generation.id,
    _queue_name="default",
)
```

However, the actual worker function is named `process_job`:

**File**: `pixsim7_backend/workers/job_processor.py:41`
```python
async def process_job(job_id: int) -> dict:
```

**File**: `pixsim7_backend/workers/arq_worker.py:81`
```python
functions = [
    process_job,  # Not process_generation!
    process_automation,
    poll_job_statuses,
    run_automation_loops,
]
```

**Impact**:
- 🔴 **Generations are never processed!**
- Jobs get queued but ARQ cannot find the `process_generation` function
- Jobs sit in Redis queue forever with "function not found" errors
- Users see jobs stuck in "PENDING" status indefinitely

**Fix Required**:
Either:
- Option A: Change `generation_service.py` to use `"process_job"`
- Option B: Rename worker function to `process_generation` and update `arq_worker.py`

**Recommended**: Option A (less changes, maintains backward compatibility)

---

### 2. ⚠️ **CRITICAL: Parameter Name Mismatch**

**Location**: `pixsim7_backend/services/generation/generation_service.py:185`

**Problem**:
The service enqueues jobs with parameter name `generation_id`:

```python
await arq_pool.enqueue_job(
    "process_generation",
    generation_id=generation.id,  # ← uses generation_id
    _queue_name="default",
)
```

But the worker function expects `job_id`:

**File**: `pixsim7_backend/workers/job_processor.py:41`
```python
async def process_job(job_id: int) -> dict:  # ← expects job_id
```

**Impact**:
- Even if Issue #1 is fixed, jobs would fail with "missing required parameter job_id"
- Worker would receive `generation_id` but function signature requires `job_id`

**Fix Required**:
Change the enqueue call to use `job_id=generation.id` for backward compatibility.

---

## Minor Issues

### 3. ⚡ Comment/Documentation Out of Sync

**Location**: `pixsim7_backend/services/generation/generation_service.py:184`

**Problem**:
Comment says "New worker function name" but the function name hasn't actually been changed:

```python
await arq_pool.enqueue_job(
    "process_generation",  # New worker function name ← misleading comment
    generation_id=generation.id,
```

**Impact**: Minor - causes developer confusion when debugging

**Fix**: Update comment or complete the renaming

---

### 4. 📝 Backward Compatibility Aliases

**Location**: `pixsim7_backend/domain/__init__.py:36-37`

**Current State**:
```python
Job = Generation  # Backward compatibility alias
GenerationArtifact = Generation  # Backward compatibility alias
```

**Observation**:
- These aliases work for imports: `from pixsim7_backend.domain import Job`
- However, the refactor is incomplete - worker still uses `job_id` parameter naming
- Mixed terminology throughout codebase (generation_id vs job_id)

**Recommendation**:
- Either fully commit to "Generation" terminology everywhere
- Or keep "Job" terminology for consistency with ARQ queue/worker layer
- Document the decision and apply consistently

---

## Architecture Observations

### Job Processing Pipeline

The current flow (when fixed):

```
1. User creates generation → POST /api/v1/jobs
2. GenerationService.create_generation()
   - Validates params
   - Creates Generation record
   - Enqueues ARQ job
3. ARQ Worker picks up job
   - process_job(job_id) function
   - Selects provider account
   - Submits to provider
   - Updates generation status
4. Status Poller (cron)
   - poll_job_statuses() every 10 seconds
   - Checks provider status
   - Updates Generation records
```

### Generation Model Strengths

The unified `Generation` model is well-designed:
- ✅ Single source of truth
- ✅ Immutable parameters (reproducible)
- ✅ Canonical params + raw params stored
- ✅ Prompt versioning integration
- ✅ Proper status tracking
- ✅ Comprehensive indexing

### Database Schema

**Table**: `generations`

Key fields:
- `id` (PK)
- `operation_type`, `provider_id`
- `raw_params`, `canonical_params` (JSON)
- `inputs` (JSON array)
- `reproducible_hash` (SHA-256)
- `status`, `priority`, `scheduled_at`
- `asset_id` (FK to result)
- `prompt_version_id` (FK)

**Note**: Schema appears sound, no migration issues detected (uses SQLModel auto-creation)

---

## Recommended Fixes

### Fix #1: Update GenerationService to use correct function name

**File**: `pixsim7_backend/services/generation/generation_service.py`

**Line 183-187**: Change to:
```python
await arq_pool.enqueue_job(
    "process_job",  # Use existing worker function name
    job_id=generation.id,  # Use job_id parameter name
    _queue_name="default",
)
```

### Fix #2: Update comment for clarity

**Line 184**: Change comment to:
```python
"process_job",  # ARQ worker function (backward compatible with Job naming)
```

### Fix #3: Add validation test

Add a test that verifies ARQ enqueue matches worker function signature:

```python
def test_generation_enqueue_matches_worker():
    """Ensure generation service enqueues with correct function name and params"""
    from pixsim7_backend.workers.job_processor import process_job
    import inspect

    # Get worker function signature
    sig = inspect.signature(process_job)
    params = list(sig.parameters.keys())

    # Verify it expects job_id
    assert "job_id" in params or "generation_id" in params
```

---

## Testing Recommendations

After fixes are applied, test:

1. **Create a generation**: POST /api/v1/jobs
2. **Verify ARQ picks it up**: Check Redis queue
3. **Verify processing**: Check generation status changes
4. **Verify completion**: Check asset_id is set

**Test command**:
```bash
# Start worker
arq pixsim7_backend.workers.arq_worker.WorkerSettings

# Create test generation
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "operation_type": "text_to_video",
    "provider_id": "pixverse",
    "params": {"prompt": "test video", "quality": "720p"}
  }'

# Watch worker logs
tail -f logs/worker.log
```

---

## Related Files

**Generation Service**:
- `pixsim7_backend/services/generation/generation_service.py`

**Worker**:
- `pixsim7_backend/workers/job_processor.py`
- `pixsim7_backend/workers/arq_worker.py`
- `pixsim7_backend/workers/status_poller.py`

**Domain**:
- `pixsim7_backend/domain/generation.py`
- `pixsim7_backend/domain/__init__.py`

**API**:
- `pixsim7_backend/api/v1/jobs.py`

---

## Conclusion

The generation system architecture is solid, but the refactoring from `Job` to `Generation` was not completed consistently:

- ✅ **Good**: Domain model unified and well-designed
- ✅ **Good**: Service layer clean and functional
- ❌ **Bad**: Worker integration broken (function name mismatch)
- ❌ **Bad**: Parameter naming inconsistent
- ⚠️ **Incomplete**: Mixed "job" and "generation" terminology

**Priority**: Fix Critical Issues #1 and #2 immediately to restore job processing functionality.
