# Generation Flow Fix Plan

**Created**: 2024-12-04
**Status**: Phase 1, 2 & 3 Complete
**Scope**: Fix issues in generation pipeline without major refactors

---

## Completed Fixes (2024-12-04)

### Phase 1: Critical (P0) ✅
- [x] 1.1 Fixed `job_id` → `generation_id` in `provider_service.py`
- [x] 1.2 Fixed broken `map_to_provider()` call in `pipeline.py`

### Phase 2: High Priority (P1) ✅
- [x] 2.1 Fixed pipeline concurrency (use `select_and_reserve_account`, release on error)
- [x] 2.2 Removed 2 of 3 credit refresh calls from `job_processor.py`
- [x] 2.3 Deleted `parameter_mappers.py` (was broken/incomplete)

### Phase 3: Medium Priority (P2) ✅
- [x] 3.1 Consolidated status poller from 2 loops to 1 loop
- [x] 3.2 Extracted `_compute_generation_cache_key()` helper in `creation_service.py`
- [x] 3.3 Removed duplicate pipeline path - consolidated to single execution path

---

## Priority Levels

- **P0**: Critical - broken functionality, data corruption risk
- **P1**: High - causes bugs or significant tech debt
- **P2**: Medium - complexity/maintenance burden
- **P3**: Low - cleanup, nice-to-have

---

## Phase 1: Critical Fixes (P0)

### 1.1 Fix ProviderSubmission Column Reference
**Files**: `pixsim7/backend/main/services/provider/provider_service.py`

**Problem**: Code assigns `job_id=job.id` but model column is `generation_id`

**Fix**:
```python
# provider_service.py:73-74
# Change:
submission = ProviderSubmission(
    job_id=job.id,  # WRONG
# To:
submission = ProviderSubmission(
    generation_id=job.id,  # Correct column name
```

**Verification**:
- Check ProviderSubmission model has `generation_id` column
- Search for other `job_id` references to ProviderSubmission
- Run: `grep -r "ProviderSubmission.*job_id" pixsim7/`

---

### 1.2 Disable/Fix Broken Pipeline Path
**Files**: `pixsim7/backend/main/services/submission/pipeline.py`

**Problem**: Calls `mapper.map_to_provider()` which doesn't exist

**Option A - Quick Fix** (Recommended):
```python
# pipeline.py:114-117
# Change:
mapper = get_mapper(generation.operation_type)
provider_params = mapper.map_to_provider(generation.canonical_params)

# To:
# Skip mapper, use canonical_params directly (provider.map_parameters handles it)
provider_params = generation.canonical_params
```

**Option B - Remove Pipeline Path**:
- Delete `pipeline.py` entirely
- Remove feature flag check in `job_processor.py:116-148`
- Remove `parameter_mappers.py`

**Decision**: Option A for now - minimal change, keeps pipeline available for future.

---

## Phase 2: High Priority Fixes (P1)

### 2.1 Fix Account Concurrency in Pipeline Path
**Files**: `pixsim7/backend/main/services/submission/pipeline.py`

**Problem**:
- Increments concurrency AFTER submission (race condition)
- Never decrements on error

**Fix**:
```python
# pipeline.py:90-99 - Use atomic reservation like legacy path
async def run(self, generation: Generation) -> PipelineResult:
    ...
    # Change select_account to select_and_reserve_account
    try:
        account = await self.account_service.select_and_reserve_account(
            provider_id=generation.provider_id,
            user_id=generation.user_id,
        )
    except NoAccountAvailableError as e:
        ...

    try:
        submission = await self.provider_service.execute_job(...)
        # REMOVE: account.current_processing_jobs += 1  (already done by reserve)
        ...
    except ProviderError as e:
        # ADD: Release account on error
        await self.account_service.release_account(account.id)
        ...
```

---

### 2.2 Reduce Credit Refresh Calls
**Files**: `pixsim7/backend/main/workers/job_processor.py`

**Problem**: Refreshes credits 3 times per job (before, after success, after failure)

**Fix**:
```python
# Keep only the pre-submission refresh (line 184)
credits_data = await refresh_account_credits(account, account_service, gen_logger)

# REMOVE line 215 (after success):
# await refresh_account_credits(account, account_service, gen_logger)

# REMOVE line 237 (after failure):
# await refresh_account_credits(account, account_service, gen_logger)
```

**Rationale**:
- Pre-submission check is sufficient to verify credits
- Status poller can refresh on completion if needed
- Failure doesn't consume credits (provider rejects before billing)

---

### 2.3 Unify Parameter Flow
**Files**:
- `pixsim7/backend/main/services/submission/parameter_mappers.py`
- `pixsim7/backend/main/services/submission/pipeline.py`

**Problem**: Three layers of parameter transformation

**Fix**:
1. Delete `parameter_mappers.py` (it's incomplete and broken anyway)
2. Update pipeline to use `canonical_params` directly:
```python
# pipeline.py - simplified
submission = await self.provider_service.execute_job(
    job=generation,
    account=account,
    params=generation.canonical_params,  # Direct pass-through
)
```

3. Let `provider.map_parameters()` in `provider_service.execute_job()` handle provider-specific mapping

**Parameter Flow After Fix**:
```
raw_params → _canonicalize_params() → canonical_params → provider.map_parameters() → SDK
```

---

## Phase 3: Medium Priority (P2)

### 3.1 Consolidate Status Poller Loops
**Files**: `pixsim7/backend/main/workers/status_poller.py`

**Problem**: Two separate loops over same list

**Fix**: Merge into single loop
```python
for generation in processing_generations:
    # Check timeout first
    if generation.started_at and generation.started_at < timeout_threshold:
        # Handle timeout
        ...
        continue  # Skip to next generation

    # Check status (existing logic)
    checked += 1
    ...
```

---

### 3.2 Rename job_id References to generation_id
**Files**: Multiple

**Scope**: Variable naming only (not breaking changes)

**Search**: `grep -r "job_id" pixsim7/backend/main/`

**Strategy**:
- Keep `job_id` in log fields (backward compat with log analysis)
- Rename local variables: `job` → `generation`
- Update function params where safe: `execute_job` → `execute_generation`

**Skip for now**: This is cosmetic; defer to separate cleanup PR.

---

### 3.3 Add Missing Operation Mappers (if keeping mappers)
**Files**: `pixsim7/backend/main/services/submission/parameter_mappers.py`

**Skip if**: We delete `parameter_mappers.py` in Phase 2.3

**If keeping**, add:
- `VideoExtendMapper`
- `VideoTransitionMapper`
- `FusionMapper`
- `TextToImageMapper`
- `ImageToImageMapper`

---

## Phase 4: Low Priority (P3)

### 4.1 Extract Cache Key Helper
**Files**: `pixsim7/backend/main/services/generation/creation_service.py`

**Problem**: Cache key computed twice (lines ~209 and ~276)

**Fix**: Extract to method
```python
def _build_cache_key(self, operation_type, params, player_context) -> str:
    """Build cache key for generation deduplication."""
    ...
```

---

### 4.2 Add Database-Level Dedup Constraint
**Files**: Alembic migration

**Problem**: Race condition between hash check and insert

**Fix**: Add unique constraint
```python
# Migration
op.create_unique_constraint(
    'uq_generation_hash_provider',
    'generations',
    ['reproducible_hash', 'provider_id', 'user_id']
)
```

Then use `INSERT ... ON CONFLICT DO NOTHING` or catch IntegrityError.

---

### 4.3 Move Pipeline Feature Flag to Config
**Files**:
- `pixsim7/backend/main/services/submission/pipeline.py`
- Config/settings

**Problem**: Environment variable only, requires restart

**Fix**: Check database/Redis config at runtime
```python
async def is_enabled() -> bool:
    # Check feature flags table or Redis
    return await feature_flags.get("use_submission_pipeline", default=False)
```

---

## Implementation Order

```
Week 1: Phase 1 (Critical)
├── 1.1 Fix ProviderSubmission column (30 min)
└── 1.2 Fix/disable pipeline mapper (30 min)

Week 1: Phase 2 (High)
├── 2.1 Fix pipeline concurrency (1 hour)
├── 2.2 Reduce credit refresh (30 min)
└── 2.3 Delete parameter_mappers.py (1 hour)

Week 2: Phase 3 (Medium)
├── 3.1 Consolidate poller loops (30 min)
└── 3.2 Rename job_id (defer)

Backlog: Phase 4 (Low)
├── 4.1 Cache key helper
├── 4.2 Dedup constraint
└── 4.3 Runtime feature flag
```

---

## Testing Checklist

After each phase:

- [ ] Worker starts without errors
- [ ] `python -c "from pixsim7.backend.main.workers.job_processor import process_generation"` succeeds
- [ ] Create generation via API → status goes PENDING → PROCESSING → COMPLETED
- [ ] Check `data/logs/console/worker.log` for errors
- [ ] Verify ProviderSubmission records created correctly
- [ ] Account `current_processing_jobs` increments/decrements properly

---

## Rollback Plan

Each phase should be a separate commit/PR:

1. Phase 1: `fix/generation-critical-bugs`
2. Phase 2: `fix/generation-concurrency-params`
3. Phase 3: `refactor/generation-cleanup`
4. Phase 4: `chore/generation-improvements`

If issues arise, revert specific commit without affecting other phases.
