# World and Sessions System — Reviewed Issues & Fix Plans

**Analysis Date**: 2025-12-02 (refreshed)
**Scope**: World management, session handling, relationship normalization, time tracking, and UI helpers.

This revision validates the prior issue list, adds missing constraints, and converts each item into an action-oriented fix. Severity reflects user impact and data integrity risk.

---

## 🔴 High Severity

### Issue #1: Race condition in world time advancement
**Verdict**: Confirmed. Concurrent increments can overwrite each other.
**Fix**: Use an atomic `UPDATE … RETURNING` (or `SELECT … FOR UPDATE`) and initialize missing `GameWorldState` within the same transaction to avoid double-creation. Include a guard to reject negative deltas by clamping to `0`.

### Issue #2: Orphaned world state on world creation
**Verdict**: Confirmed. Two commits risk a world without state when failures occur between them.
**Fix**: Create world and state inside one transaction with `flush()` to obtain the ID before committing. Ensure rollback on exceptions.

### Issue #3: Missing world-ownership validation in session creation
**Verdict**: Confirmed. Users can attach sessions to someone else’s world.
**Fix**: When `world_id` is provided, fetch the world and verify `owner_user_id == user_id`; return `world_not_found` or `world_access_denied` errors accordingly. Apply the check in the service layer so API and internal callers share protection.

### Issue #4: Overlapping relationship tiers produce nondeterministic results
**Verdict**: Confirmed. Order-dependent matches cause unstable outcomes.
**Fix**: Validate tiers for overlap during world meta updates; reject invalid schemas. When computing, sort tiers by `min` and return the first valid match for determinism.

---

## 🟡 Medium Severity

### Issue #5: Session events grow without bounds
**Verdict**: Confirmed. Event tables will bloat.
**Fix**: Add retention (e.g., keep last N per session) or a scheduled cleanup by age. Run cleanup after event creation paths.

### Issue #6: Frontend time wrapping vs backend monotonic time
**Verdict**: Confirmed mismatch. Behavior must be unified or clearly documented.
**Fix**: Decide on a single policy. Prefer documenting that the backend stores monotonic seconds while the frontend wraps for display; alternatively, wrap on the backend at the same interval and update clients accordingly.

### Issue #7: Scheduler config lacks business-rule validation
**Verdict**: Confirmed. Invalid values (e.g., `timeScale <= 0`) slip through.
**Fix**: Layer business checks (positive/ non-negative thresholds) before persisting updates; surface errors via HTTP 400 with clear details. Revalidate with `WorldSchedulerConfigSchema` after applying patches.

### Issue #8: Relationship normalization runs even when data unchanged
**Verdict**: Confirmed. Wastes CPU/cache work on empty or unchanged relationships.
**Fix**: Normalize only when relationships exist and were modified. Skipping normalization on no-op updates avoids unnecessary cache churn.

### Issue #9: Session version increments on no-op updates
**Verdict**: Confirmed. Causes needless optimistic-lock conflicts.
**Fix**: Track whether any field changed; bump `version` only when mutations occur.

### Issue #10: GET responses differ from POST/PATCH normalization
**Verdict**: Confirmed. Clients receive raw vs normalized relationships inconsistently.
**Fix**: Either normalize in `get_session` (default) with an opt-out flag, or document clearly that GET returns raw data so clients can request normalization explicitly.

### Issue #11: list_worlds lacks pagination
**Verdict**: Confirmed. Large result sets degrade performance.
**Fix**: Add `offset`/`limit` with sane caps and return total counts. Keep ordering stable (e.g., by `id`).

### Issue #12: Redis failures are silent
**Verdict**: Confirmed. Cache problems become invisible.
**Fix**: Log warnings on cache read/write failures with session/world context; avoid raising unless cache is critical.

### Issue #13: Session adapter retry loop causes UI flicker
**Verdict**: Confirmed. Multiple optimistic updates per retry create oscillations.
**Fix**: Apply optimistic update only on first attempt; suppress additional interim updates during retries and use backoff with a terminal retry limit.

### Issue #14: Session adapter lacks cleanup for async callbacks
**Verdict**: Confirmed. Late callbacks can hit unmounted components.
**Fix**: Track `isActive` with a cleanup function; gate callbacks/updates on that flag and expose `cleanup()` to callers.

### Issue #15: Affinity/intimacy inputs are not clamped
**Verdict**: Confirmed. Out-of-range values can select invalid tiers.
**Fix**: Clamp relationship axes to `0–100` before computing tiers or intimacy levels; keep fallbacks for malformed schemas.

### Issue #16: Turn-based validation tolerance is arbitrary
**Verdict**: Confirmed. Floating-point comparisons with 1s tolerance are too loose.
**Fix**: Compare deltas using `Decimal` with millisecond tolerance and reject unexpected advancements in turn-based mode.

### Issue #17: Schema validation only happens in API layer
**Verdict**: Confirmed. Direct service calls can bypass validation.
**Fix**: Validate world meta schemas inside service methods (create/update) and surface structured errors; adjust APIs to translate those errors to HTTP responses.

### Issue #18: Multi-step operations lack explicit transactions
**Verdict**: Confirmed. Partial writes can leak on exceptions.
**Fix**: Introduce an `atomic_transaction` async context manager and wrap multi-entity mutations (e.g., world + state creation, session advances with event writes) to ensure commit/rollback symmetry.

### Issue #19: Cache invalidation happens before normalization
**Verdict**: Confirmed risk. Stale caches can be reintroduced by concurrent workers.
**Fix**: Normalize relationships first, then cache; avoid invalidating right before normalization. Optionally, add a short-lived cache lock per session to prevent concurrent recomputation.

---

## 🟢 Low Severity

### Issue #20: No rate limiting on expensive endpoints
**Verdict**: Confirmed. System is open to abuse.
**Fix**: Add rate limiting middleware/decorators. Prefer Redis-backed tokens for production; provide conservative defaults (e.g., world advance 60/min, session update 120/min) and return HTTP 429 on excess.

---

## Summary Statistics

| Severity | Count | Key Concerns |
|----------|-------|--------------|
| High     | 4     | Concurrency and data integrity |
| Medium   | 15    | Consistency, validation, scalability, UX |
| Low      | 1     | Abuse protection |
| **Total**| **20**| |

## Recommended Implementation Order

1. **Integrity & Access Control**: Issues #1–4.
2. **Core Health & Validation**: Issues #5–10, #15–18.
3. **UX / Observability**: Issues #11–14, #19.
4. **Traffic Safety**: Issue #20.

**Document Version**: 1.1
**Last Updated**: 2025-12-02
