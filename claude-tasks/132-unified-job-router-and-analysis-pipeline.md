# 132 – Asset Analysis Pipeline

## Why
Media analysis (face detection, scene tagging, content moderation, etc.) needs the same lifecycle as generations: enqueue → reserve provider account → submit → poll → persist results. Rather than building a parallel queue system, analysis should plug into the existing generation infrastructure — same `ProviderSubmission` tracking, same account concurrency controls, same polling loop.

Automation is intentionally **out of scope**. It uses a fundamentally different execution model (synchronous device control vs async provider polling) and doesn't benefit from sharing this infrastructure.

## Goals

1. **Analysis domain model**
   - Add `asset_analyses` table storing `{asset_id, analyzer_type, analyzer_version, prompt, params, result, status, created_at, completed_at}`.
   - Add `OperationType.ASSET_ANALYSIS` (or similar) so provider submissions can distinguish analysis from generation jobs.

2. **Extend existing polling**
   - Add `process_analysis` ARQ task mirroring `process_generation`: select account → submit to provider → create `ProviderSubmission`.
   - Extend `poll_job_statuses` to also query `asset_analyses` with `status=PROCESSING` and poll their submissions. No new cron job — just widen the existing one.
   - Add `requeue_pending_analyses` logic (can be folded into `requeue_pending_generations` or kept separate).

3. **Provider support**
   - Extend `ProviderService` with `execute_analysis(analysis, account)` and corresponding `check_analysis_status()`.
   - Reuse `ProviderSubmission` for audit trail — analysis submissions get their own rows linked via `analysis_id` (nullable FK, parallel to `generation_id`).
   - Account selection respects `current_processing_jobs` the same way generations do.

4. **API endpoints**
   - `POST /api/v1/assets/{id}/analyze` — enqueue analysis job (analyzer type, prompt, params).
   - `GET /api/v1/assets/{id}/analyses` — list past analyses for an asset.
   - `GET /api/v1/analyses/{id}` — fetch single analysis result.

## Deliverables

1. **Schema migration** for `asset_analyses` table + nullable `analysis_id` FK on `provider_submissions`.
2. **ARQ task** `process_analysis(analysis_id)` in `job_processor.py` (or new `analysis_processor.py`).
3. **Polling extension** — updated `poll_job_statuses` that handles both generations and analyses.
4. **ProviderService updates** — `execute_analysis`, `check_analysis_status` methods.
5. **API routes** — three endpoints above with request/response schemas.

## Non-Goals (Explicitly Out of Scope)

- **Unifying automation** — automation uses devices, not provider APIs. Different execution model, leave it alone.
- **Generic job router abstraction** — premature. If we later need a third async job type, we can extract a pattern then.
- **Frontend UI** — backend plumbing only. UI comes in a follow-up task.
- **Migrating existing generation code** — no refactoring of `process_generation`. Analysis is additive.

## Constraints

- Account concurrency: analyses count against `current_processing_jobs` just like generations.
- Respect `auth_method`/`is_google_account` flags — don't accidentally overuse Google-authenticated accounts.
- Analysis results should link back to source asset for lineage tracking.
- Keep it simple: this is ~500 lines of new code, not an architecture rewrite.
