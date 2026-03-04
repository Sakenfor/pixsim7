# Generation Pipeline Audit — 2026-02-23

## Scope

Backend worker/pipeline code for pinned-generation queueing, retry, poller, and account slot accounting.
Focus on stranded jobs, throughput underfill, duplicate enqueues, and counter drift.

## Severity Legend

- **S1 (Critical)** — Can strand jobs permanently or corrupt slot counters
- **S2 (High)** — Can cause throughput underfill or duplicate work
- **S3 (Medium)** — Edge cases that compound under load
- **S4 (Low)** — Correctness nits / stale state

---

## Finding 1 — S1: Double-release of account slot on content-filter retry failure

**Files:** `job_processor.py:1087` + `job_processor.py:1213`

When a retryable `ProviderContentFilteredError` is caught:

1. Account is released at line 1087
2. The code attempts content-filter retry logic (lines 1095–1191)
3. If `enqueue_generation_retry_job` or `_defer_pinned_generation` **throws** (caught at line 1192), execution falls through to line 1213 where `_release_account_reservation()` is called **again**

`release_account()` uses `max(0, n-1)` (account_service.py:342), so the counter won't go negative. However, each call also triggers **wake logic** (account_service.py:347+), meaning a single job failure can wake **two waves** of pinned waiters — potentially dispatching more generations than the account has capacity for.

**Impact:** Over-dispatch of pinned generations, transient capacity overshoot.

**Patch:**
```python
# At line 1085 — track release state
account_released = False
try:
    await account_service.release_account(account.id)
    account_released = True
except ...

# At line 1212 — guard the fallthrough release
if not account_released:
    await _release_account_reservation(...)
```

---

## Finding 2 — S1: Double-release on concurrent-limit + failed defer

**Files:** `job_processor.py:951` + `job_processor.py:1213`

In the `ProviderConcurrentLimitError` handler:

1. Line 951: Account is released (correct)
2. Line 987: `_defer_pinned_generation()` is called for pinned accounts
3. Line 998: If defer **fails**, execution falls through to line 1213 — second release

Same double-wake issue as Finding 1.

**Impact:** Double wake dispatch after concurrent-limit error + failed defer.

**Patch:** Same `account_released` flag pattern as Finding 1.

---

## Finding 3 — S1: Deferred pinned generation has no fallback enqueue — stranding risk

**File:** `job_processor.py:443–518`

`_defer_pinned_generation()`:

1. Sets `generation.status = PENDING`, `account_id = None`, `scheduled_at = now + defer_seconds` (lines 470–473)
2. Commits to DB (line 475)
3. Sets wait metadata in Redis (best-effort, lines 483–490)
4. Does **NOT** enqueue any ARQ job — relies entirely on `release_account()` wake logic to re-dispatch

**Stranding scenario:**

1. Generation is deferred with `scheduled_at = now + 30s`, reason `"pinned_account_capacity_wait"`
2. The account releases a slot 5 seconds later — wake logic runs
3. Due to Postgres read-committed isolation, the wake query might not yet see the generation committed by a different session
4. After 30 seconds, `scheduled_at` expires, but there is **no ARQ job** and **no periodic sweep** that re-dispatches it
5. The generation is stranded until another release happens to find it, or a cron runs

**Impact:** Pinned generations can sit idle for the full cron interval (minutes) even when the account has capacity. Primary source of "stuck-looking" jobs.

**Patch:** After `_defer_pinned_generation()` succeeds, also enqueue a deferred ARQ job as a safety net:
```python
# After line 476 (db commit + refresh):
try:
    arq_pool = await get_arq_pool()
    await enqueue_generation_retry_job(arq_pool, generation.id, defer_seconds=defer_seconds)
except Exception:
    gen_logger.debug("deferred_safety_enqueue_failed", ...)
```

The worker's admission checks (status != PENDING → skip, scheduled_at > now → skip) ensure the safety-net job is harmless if wake already dispatched it.

---

## Finding 4 — S2: Poller doesn't release account slot on persistent ProviderError

**File:** `status_poller.py:634–640`

```python
except ProviderError as e:
    _poll_log(...)
    still_processing += 1   # stays PROCESSING, no release
```

When `check_status()` raises a `ProviderError` (API timeout, auth error), the generation stays PROCESSING and the account slot is **not released**. The generation will eventually hit the 2-hour general timeout (line 443), but until then the slot is held.

If the provider error is persistent (broken auth on one account), this account will hold all its PROCESSING slots for up to 2 hours, severely reducing throughput.

**Impact:** Account slots held for up to 2 hours on persistent provider errors; throughput underfill.

**Patch:** Track consecutive provider errors per generation. After N failures (e.g., 3), fail the generation and release the slot:
```python
except ProviderError as e:
    _poll_log(...)
    consecutive_errors = _increment_poll_error_count(generation.id)
    if consecutive_errors >= MAX_CONSECUTIVE_POLL_ERRORS:
        # Fail and release
        await generation_service.mark_failed(generation_id, f"Persistent poll error: {e}")
        await account_service.release_account(account.id)
        failed += 1
    else:
        still_processing += 1
```

---

## Finding 5 — S2: Worker-initiated retry and auto-retry event handler can race

**Files:** `job_processor.py:1164–1177` + `event_handlers/auto_retry/manifest.py:203`

Two independent retry paths for content-filter errors:

- **Path A (worker):** Lines 1169–1177 — resets to PENDING, commits, enqueues retry job, returns `"requeued"`
- **Path B (auto-retry event):** After ARQ exhausts its `max_tries`, `job:failed` event fires, handler checks `should_auto_retry()`, increments retry_count, commits, enqueues retry job

Since Path A returns a dict (doesn't raise), ARQ considers the job successful and won't fire `job:failed`. So the race only occurs when:

1. Worker does content-filter retry (Path A) — acquires lease, enqueues, returns
2. The **retried** job itself fails on a subsequent ARQ attempt and raises
3. ARQ fires `job:failed` — auto-retry handler fires (Path B)
4. The previous lease has expired (short TTL), so Path B acquires a new lease

Both paths increment `retry_count`, so a generation can burn through its retry budget ~2x faster than intended.

**Impact:** Duplicate retries, retry budget consumed faster than expected.

**Mitigation:** The dedupe lease covers the immediate window. The real risk is at the boundary between worker-managed and event-driven retries. Consider having the worker set a short-lived Redis flag when it handles a content-filter retry, and have the auto-retry handler check it.

---

## Finding 6 — S2: Wake dispatch deduped → metadata cleared but no job enqueued

**Files:** `generation_jobs.py:173–184` + `account_service.py:410–412`

```python
# generation_jobs.py
async def enqueue_generation_fresh_job(arq_pool, generation_id: int) -> None:
    if not await acquire_generation_enqueue_lease(arq_pool, generation_id):
        logger.info("generation_enqueue_deduped", ...)
        return   # returns None, no error indication

# account_service.py (wake logic)
await enqueue_generation_fresh_job(arq_pool, ready_pinned.id)   # line 410
await clear_generation_wait_metadata(arq_pool, ready_pinned.id) # line 411
woke_count += 1                                                  # line 412
```

If the dedupe lease fires (e.g., stale lease from a crashed worker), the enqueue silently returns without error. But:

- `scheduled_at` was already cleared (line 405)
- Wait metadata is cleared (line 411)
- `woke_count` is incremented (line 412)

The generation is now PENDING with no `scheduled_at`, no wait metadata, and **no ARQ job** — stranded.

**Impact:** Pinned generation permanently stuck after wake dispatch is silently deduped.

**Patch:** Make `enqueue_generation_fresh_job` return a boolean:
```python
async def enqueue_generation_fresh_job(arq_pool, generation_id: int) -> bool:
    if not await acquire_generation_enqueue_lease(arq_pool, generation_id):
        logger.info("generation_enqueue_deduped", ...)
        return False
    await arq_pool.enqueue_job("process_generation", generation_id=generation_id)
    return True
```

Then in wake logic:
```python
enqueued = await enqueue_generation_fresh_job(arq_pool, ready_pinned.id)
if enqueued:
    await clear_generation_wait_metadata(arq_pool, ready_pinned.id)
    woke_count += 1
else:
    # Restore scheduled_at or leave for next wake cycle
    logger.warning("wake_enqueue_deduped", generation_id=ready_pinned.id)
```

---

## Finding 7 — S2: Dedupe lease fail-open on Redis errors defeats deduplication

**File:** `generation_jobs.py:74–81`

```python
except Exception:
    logger.debug(...)   # only debug level!
    return True          # pretend lease was acquired
```

When Redis is flaky, every enqueue attempt succeeds, creating duplicates. The intent is fail-open to avoid blocking the pipeline, but the consequence is silent duplicate generation submissions during Redis instability.

**Impact:** Duplicate provider submissions (wasted credits) during Redis instability. No alerting.

**Patch:** Log at WARNING level so monitoring can detect it. Consider fail-closed for the retry path (where duplicates are more harmful) and fail-open only for fresh enqueues:
```python
except Exception:
    logger.warning(   # <-- upgrade from debug
        "generation_enqueue_lease_acquire_failed",
        extra={"generation_id": generation_id},
        exc_info=True,
    )
    return True
```

---

## Finding 8 — S3: Wake logic doesn't re-check capacity per dispatch iteration

**File:** `account_service.py:358–412`

`free_slots` is calculated once (line 358–361), then used as the hard cap in the loop (line 389). Between the calculation and each `enqueue_generation_fresh_job` call:

- Another worker could `reserve_account_if_available()`, consuming a slot
- Another concurrent `release_account()` could trigger a separate wake cycle

The row-level lock (SELECT FOR UPDATE at line 332–334) only covers the counter decrement. The wake logic runs **after** the commit (line 344), so the lock is already released.

**Impact:** Under high concurrency, more generations can be dispatched than the account has capacity for. Workers' admission checks will reject excess dispatches, but those generations must be re-deferred, adding latency churn.

---

## Finding 9 — S3: No error count tracking for persistent poll failures

**File:** `status_poller.py:634–640`

There's no per-generation error counter for consecutive `ProviderError`s during polling. A generation with a permanently broken provider_job_id (e.g., deleted on provider side, returning 404 forever) will be polled every cycle for 2 hours before the general timeout catches it.

With a 30-second poll interval and 2-hour timeout, that's ~240 wasted API calls per stuck generation.

**Impact:** API rate limit waste, log noise, delayed recovery.

---

## Finding 10 — S3: Yield counter not rolled back on failed account rotation in auto-retry

**File:** `event_handlers/auto_retry/manifest.py:173–198`

```python
await reset_content_filter_yield_counter(generation.id)  # line 173 — Redis write
generation.account_id = None                               # line 175 — in-memory
# ...
generation.retry_count += 1                                # line 191
await db.commit()                                          # line 198
```

If an exception occurs between line 173 and line 198, the SQLAlchemy session rollback discards the DB changes, but the Redis `reset_content_filter_yield_counter` at line 173 is **not rolled back** — leaving the yield counter at 0 even though the account rotation didn't persist.

**Impact:** Stale yield counter in Redis after failed account rotation — could cause an extra content-filter retry before the counter naturally resets.

---

## Finding 11 — S3: `enqueue_generation_retry_job` returns `actual_defer_seconds` even when deduped

**File:** `generation_jobs.py:228`

```python
return actual_defer_seconds   # same value whether enqueued or deduped
```

Callers (auto-retry handler, worker) log the returned defer_seconds as if the job was enqueued. When the lease dedupe fires, the logged value is misleading — it suggests a retry was scheduled when it wasn't.

**Impact:** Misleading logs make debugging stranded jobs harder.

---

## Finding 12 — S4: Wait metadata silently fails to set, but defer reports success

**File:** `job_processor.py:491–498`

```python
except Exception:
    gen_logger.debug("generation_wait_meta_set_failed", ...)
```

`_defer_pinned_generation()` returns a success dict (line 512) even when wait metadata failed to persist. The wake logic in `release_account()` uses wait metadata to decide whether to wake early (line 400). Without metadata, the generation won't be woken early — it will only be picked up after `scheduled_at` expires.

**Impact:** Slightly delayed wake for pinned generations when Redis metadata set fails. Usually recoverable but adds latency.

---

## Open Questions / Assumptions

1. **Is there a `requeue_pending_generations` cron sweep?** `_defer_pinned_generation` relies entirely on wake logic + scheduled_at for re-dispatch. If there's a periodic cron that sweeps old PENDING generations with expired `scheduled_at` and re-enqueues them, it mitigates Findings 3 and 6 significantly. If not, those findings are critical.

2. **`reconcile_account_counters` frequency:** If the cron runs every ~60 seconds, the impact of double-release (Findings 1/2) on counter drift is limited. If it runs every 10+ minutes, throughput underfill from counter corruption lasts longer.

3. **Does `mark_failed()` publish a `job:failed` event?** If so, the auto-retry handler could partially recover stranded jobs from Finding 6. Need to verify the event is published for all failure paths.

4. **ARQ `max_tries` interaction:** The worker returns a dict (doesn't raise) on content-filter retry, so ARQ considers the job successful and won't fire `job:failed`. This is correct, but if the return is lost (worker crash mid-return), ARQ would retry. The dedupe lease covers this window.

---

## Summary by Priority

| #  | Sev | Category        | Finding                                                    | Fix Effort |
|----|-----|-----------------|------------------------------------------------------------|------------|
| 3  | S1  | Stranded jobs   | Deferred pinned generation has no fallback enqueue         | Low        |
| 6  | S2  | Stranded jobs   | Wake dispatch deduped → metadata cleared but no job        | Low        |
| 1  | S1  | Slot accounting | Double-release on content-filter retry failure             | Low        |
| 2  | S1  | Slot accounting | Double-release on concurrent-limit + failed defer          | Low        |
| 4  | S2  | Throughput      | Poller holds slot on persistent ProviderError              | Medium     |
| 5  | S2  | Duplicate work  | Worker retry + auto-retry race condition                   | Medium     |
| 7  | S2  | Duplicate work  | Dedupe lease fail-open on Redis errors                     | Low        |
| 8  | S3  | Throughput      | Wake logic doesn't re-check capacity per dispatch          | Medium     |
| 9  | S3  | Throughput      | No error count tracking for persistent poll failures       | Low        |
| 10 | S3  | Correctness     | Yield counter not rolled back on failed account rotation   | Low        |
| 11 | S3  | Observability   | Deduped enqueue returns misleading defer_seconds           | Low        |
| 12 | S4  | Latency         | Silent wait metadata failure delays wake                   | Low        |

The highest-impact fixes are **Finding 3** (add a deferred ARQ job as safety net in `_defer_pinned_generation`) and **Finding 6** (make `enqueue_generation_fresh_job` return success boolean and gate metadata clearing on it). These two together would eliminate the primary stranded-job vector. Findings 1/2 (double-release) are a straightforward `account_released` flag fix.

---

## Live Database Confirmation — 2026-02-23 ~14:19 UTC

Queried the local Postgres database during active generation workload (all pinned to account 2, Pixverse i2i, 5-slot max).

### Counter drift (Findings 1/2) — confirmed

Observed at two points in time during the session:

| Time   | `counter` | `actual_proc` | drift |
|--------|-----------|---------------|-------|
| ~14:09 | 4         | 5             | -1    |
| ~14:10 | 5         | 6             | -1    |
| ~14:19 | 5         | 5             | 0     |

Counter was under-counting by 1, allowing one extra generation to be dispatched beyond the 5-slot cap (`actual_proc=6`). Self-healed once the reconcile cron ran. The drift is consistent with a double-release wake dispatching one extra generation.

### Stranded PENDING jobs (Finding 3) — confirmed as primary stuck-job vector

Multiple generations observed PENDING with `scheduled_at` in the past and no ARQ job to re-dispatch:

| gen  | overdue  | `account_id` | `preferred_account_id` | notes |
|------|----------|--------------|------------------------|-------|
| 8816 | **143s** | None         | 2                      | Classic defer stranding |
| 8809 | **94s**  | 2            | 2                      | Content-filter retry defer |
| 8815 | **65s**  | None         | 2                      | Same pattern |
| 8818 | **100s** (earlier snapshot) | None | 2             | Eventually recovered after ~2min |
| 8819 | **5s**   | None         | 2                      | Just expired |

All are content-filtered pinned retries deferred via `_defer_pinned_generation`. They have expired `scheduled_at` but no ARQ safety-net job. Recovery depends entirely on a `release_account()` wake happening to find them — and when the account is at max capacity (5/5 PROCESSING), wakes only fire when a job completes. If the completing job's wake misses a stranded generation (Postgres visibility, dedupe lease, etc.), the generation waits until the *next* completion.

### Stale `scheduled_at` on PROCESSING generations

`gen=8814` and `gen=8817` were actively PROCESSING but still had old `scheduled_at` values (overdue 94s and 55s respectively). The worker admitted them past the `scheduled_at` check (because it was in the past) but never cleared the field. Not harmful, but confuses diagnostic queries and leaves stale state.

### Content-filter churn is the dominant throughput bottleneck

Every active generation had `error_code=content_filtered`. The cycle is:
1. Submit → provider filters → retry deferred
2. Deferred generation sits idle (Finding 3 stranding window)
3. Eventually re-dispatched → filters again → repeat

With a high filter rate and 1–3 minute stranding windows per retry, the 5-slot account is significantly underutilized. Finding 3 is the main multiplier — each content-filter retry burns an extra 1–2 minutes of idle time waiting for a wake that may not come promptly.

### Large batch stranding (~100 queued, 45 stuck for 85min) — Finding 3 at scale

A batch of ~100 pinned i2i generations was queued to account 2 (5-slot max). After 85 minutes:

| Category | Count | Notes |
|----------|-------|-------|
| Completed | 106 | Includes earlier work |
| Failed | 49 | avg 4.8 retries |
| **Stranded fresh (never attempted)** | **45** | PENDING, scheduled_at 85min overdue, retry_count=0 |
| Stranded retry | 7 | Content-filter retries stuck same way |
| Legitimately waiting | 4 | |
| Ready to dispatch | 2 | |

**Throughput (completed jobs):**

| Metric | Median | Mean | P90 | Max |
|--------|--------|------|-----|-----|
| Total (create→complete) | 19min | 22min | 57min | 84min |
| Queue wait (create→start) | 18min | 21min | 57min | 84min |
| Processing (start→done) | **41s** | 45s | 53s | 99s |
| Retries | 1 | 2.0 | — | 13 |

Actual Pixverse i2i processing is fast (median 41s). **Queue wait dominates** — median 18 minutes, caused by:

1. `_defer_pinned_generation` sets `scheduled_at` but enqueues no ARQ job (Finding 3)
2. `release_account()` wake can dispatch at most `free_slots` (5) per wake cycle
3. Content-filter retries (74% of completions needed retries) compete for wake slots
4. Fresh batch jobs starved: 45 have waited 85+ minutes with zero attempts

**Retry distribution (completed):**
```
retries= 0:  28  ############################
retries= 1:  40  ########################################
retries= 2:  11  ###########
retries= 3:   9  #########
retries= 4+: 18  ##################
```

**Queue time by retry bucket:**
- 0 retries: avg 310s (5min) — fast when they get a slot
- 1+ retries: avg 1657s (28min) — each retry cycle adds another stranding window
