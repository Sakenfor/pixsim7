## Provider Account Strategy & Concurrency Policy

Goal: Support heterogeneous provider behaviors (Pixverse multi-account pooling vs. Sora limited accounts) while presenting a unified abstraction for job submission, scheduling, and UI feedback.

---
## 1. Core Concepts

### Provider
Logical integration (pixverse, sora, etc.) exposing:
- operation_specs: parameter schema & enumerations.
- capability flags (supports_multi_accounts, supports_priority, supports_api_key).
- limits (max_concurrent_jobs_per_account, base_retry_policy).

### Provider Account
Credential/config unit for a provider. Examples:
- Pixverse: Each login cookie/token yields one account; user may aggregate 20–40 accounts.
- Sora: Usually 1–2 accounts (API keys or session tokens).

### Account Pool
Collection of active provider accounts for a user used to distribute jobs. Strategy differs per provider.

---
## 2. Abstraction Layer

Introduce a ProviderCapabilities interface (backend + mirrored in frontend types):
```ts
type ProviderCapabilities = {
  id: string;
  name: string;
  supportsMultiAccounts: boolean;
  maxAccountsHint?: number; // UX hint (e.g. 50 for pixverse)
  supportsApiKey: boolean;
  supportsPriority: boolean;
  accountConcurrency: {
    defaultMaxConcurrentJobs: number; // baseline per account
    proMaxConcurrentJobs?: number; // upgraded tier
  };
  operations: Record<string, { /* operation_specs entry */ }>;
};
```

Backend should enrich /providers response with above (or a subset) to allow dynamic UI decisions (show account management panel only if supportsMultiAccounts=true).

---
## 3. Concurrency & Scheduling

### Queue Placement
User Job → Provider selection logic picks an account:
1. Filter candidate accounts (status=active, not suspended, capacityRemaining>0).
2. Sort by least current_processing_jobs then by tier (pro first if we want fastest completion) then by recent usage (to avoid starvation).
3. Reserve account (increment current_processing_jobs atomically).

### Capacity Calculation
```
effectiveCapacity(account) = isPro ? proMaxConcurrentJobs : defaultMaxConcurrentJobs
remaining = effectiveCapacity - current_processing_jobs
```

### Multi-Account Pool (Pixverse)
If supportsMultiAccounts:
- Dispatch algorithm: Round-robin with opportunistic early pick for accounts with free slots.
- Optional load-smoothing: If job priority > baseline, choose account with lowest latency history.
- Retry strategy: On provider failure, next attempt rotates to different account if available.

### Limited Accounts (Sora)
If !supportsMultiAccounts:
- Single account concurrency enforced.
- If max reached, job stays pending until a slot frees (worker polls or scheduling service). Could add scheduled_at or priority preemption later.

---
## 4. Upgraded / Pro Accounts

Rationale: Higher concurrency, extra features (e.g., direct API usage, higher resolution).

Data Model Additions:
```python
class ProviderAccount(SQLModel):
    is_pro: bool
    max_concurrent_jobs: int  # derived at insert/update from tier
    supports_openapi: bool  # ability to call official API endpoints
    last_latency_ms: int | None
```

On job completion update latency (time from started_at to completed_at) for adaptive scheduling.

Account Upgrade Flow:
- User marks account as pro via devtools UI or automatic detection (token capabilities).
- Backend recalculates max_concurrent_jobs and persists.
- Frontend displays badge (e.g., PRO) and maybe a concurrency meter.

---
## 5. Frontend UI Implications

Control Center future panels:
1. Accounts Panel (visible if any provider supportsMultiAccounts):
   - List accounts grouped by provider.
   - Indicators: current_processing_jobs / max_concurrent_jobs, pro badge, last latency.
   - Actions: enable/disable account, mark pro, refresh token.
2. Provider Selector Enhancements:
   - If multiple providers, show summary: "Pixverse (8/120 capacity)".
   - Tooltip with concurrency breakdown (total slots = Σ effectiveCapacity).

Job Creation Form Adjustments:
- If provider supportsMultiAccounts, optional advanced field: preferred_account_ids[] or strategy override (e.g., 'lowest-latency', 'round-robin', 'random'). Defaults to 'auto'.

Retry Behavior Differences:
- Multi-account: automatic failover to different account if previous produced provider-level error.
- Single-account: retry may simply wait until capacity clears or escalate priority.

---
## 6. Backend Service Layer Extensions

ProviderAccountService additions:
- reserve_account(job): chooses account & increments concurrency.
- release_account(job): decrements concurrency when job finishes/fails.
- mark_latency(account_id, ms).
- mark_pro(account_id, is_pro=True).

JobService integration:
- On create_job: account selection deferred until processor worker (keeps HTTP fast, reduces race conditions).
- On process_job: call reserve_account before provider submission; on completion/failure always release_account.
- On retry_job: treat as new job; avoid choosing same account if failure reason provider-specific.

---
## 7. Configuration & User Controls

User-level provider preferences (table: user_provider_settings):
```python
preferred_strategy: str  # 'auto' | 'round_robin' | 'lowest_latency' | 'random'
max_parallel_jobs: int | None  # user override lower than sum capacity
blacklisted_account_ids: list[int]
```

Enforcement:
- When selecting account, skip blacklisted IDs.
- If max_parallel_jobs set and user already has that many processing jobs, new jobs remain pending.

---
## 8. Error Handling & Resilience

Detect account-specific failures:
- If provider returns explicit account quota error → mark account temporarily throttled (cooldown_until timestamp) and skip in next selections.
- Maintain failure rolling window per account; if > N failures in M minutes, auto-disable and surface in admin UI.

Fallback Strategies:
- On total capacity exhaustion, jobs remain pending; optionally escalate email/webhook notifications for premium tiers.
- For single-account providers, introduce scheduled_at deferral to avoid polling storms.

---
## 9. Migration & Incremental Rollout

Phase 1: Data model fields (is_pro, supports_openapi, last_latency_ms) + backend selection logic using existing simple capacity counters.

Phase 2: User preferences + latency-based picking + cooldown tracking.

Phase 3: Advanced strategies (priority preemption, predictive scheduling based on historical latency).

---
## 10. Observability

Metrics to log (structured logging + optional Prometheus):
- jobs_created_total{provider}
- jobs_processing_current{provider}
- account_capacity_remaining{provider, account_id}
- job_latency_ms{provider}
- account_failures_window{provider, account_id}

Tracing:
- Use log context with account_id & provider_id for correlation.

---
## 11. Open Questions / Future
- Should we support weighted distribution (favor pro accounts partially but not exclusively)?
- Dynamic account health scoring (latency + error rate) for selection.
- Cross-user shared pro account pools (team mode)?

---
## 12. Definition of Done (Initial Implementation)
- Backend selects accounts respecting capacity and pro tier.
- Multi-account providers distribute jobs round-robin by default.
- Failure on provider submission triggers alternate account selection on retry.
- Frontend displays basic account list with concurrency and pro badge.
- Logging contains job_id + account_id correlation for each submission.

---
End of strategy document.
