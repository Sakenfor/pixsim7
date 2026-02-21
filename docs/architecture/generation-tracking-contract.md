# Generation Tracking Facade

Unified read-only API for generation provenance across three source models.

## Source-of-Truth Matrix

| Concern | Canonical Owner | Notes |
|---------|----------------|-------|
| Job lifecycle (status, timing, errors) | `Generation` | Runtime state; rows may be cleaned up |
| Operation & provider config | `Generation.raw_params`, `canonical_params` | Immutable after creation |
| Provider attempt telemetry | `ProviderSubmission` | One row per attempt; audit trail |
| Provider payload/response details | `ProviderSubmission.payload`, `.response` | Full request/response (not exposed by default) |
| Durable asset provenance | `GenerationBatchItemManifest` | Survives generation cleanup; keyed by asset_id |
| Batch/run grouping | `GenerationBatchItemManifest.batch_id` | Groups items from a single QuickGen run |
| Template roll details | `GenerationBatchItemManifest` (slot_results, selected_block_ids, roll_seed) | Snapshot at generation time |
| Asset ownership | `Asset.user_id` | Auth boundary for all tracking queries |

## Endpoint Contract

All endpoints are mounted under `/api/v1/generation-tracking/`.

### GET /generation-tracking/assets/{asset_id}

Returns unified tracking for a single asset.

**Auth:** Asset must be owned by current user (or user is admin).

```json
{
  "asset_id": 10,
  "generation": {
    "id": 100,
    "status": "completed",
    "operation_type": "text_to_video",
    "provider_id": "pixverse",
    "asset_id": 10,
    "priority": 5,
    "retry_count": 0,
    "error_message": null,
    "error_code": null,
    "final_prompt": "a sunset over mountains",
    "prompt_source_type": "inline",
    "created_at": "2026-02-21T12:00:00+00:00",
    "started_at": "2026-02-21T12:00:01+00:00",
    "completed_at": "2026-02-21T12:00:30+00:00",
    "duration_seconds": 29.0
  },
  "manifest": {
    "asset_id": 10,
    "batch_id": "a1b2c3d4-...",
    "item_index": 0,
    "generation_id": 100,
    "block_template_id": null,
    "template_slug": null,
    "roll_seed": null,
    "selected_block_ids": ["blk-1"],
    "slot_results": [{"slot_key": "subject", "selected": true}],
    "assembled_prompt": "a sunset over mountains",
    "prompt_version_id": null,
    "mode": "quickgen_each",
    "strategy": "each",
    "input_asset_ids": [1, 2],
    "created_at": "2026-02-21T12:00:00+00:00"
  },
  "latest_submission": {
    "submission_id": 500,
    "provider_id": "pixverse",
    "provider_job_id": "pv-job-abc",
    "retry_attempt": 0,
    "status": "success",
    "submitted_at": "2026-02-21T12:00:01+00:00",
    "responded_at": "2026-02-21T12:00:30+00:00",
    "duration_ms": 29000
  },
  "consistency_warnings": []
}
```

### GET /generation-tracking/runs/{run_id}

Returns unified tracking for an entire generation run (batch).

**Auth:** All manifest items must belong to assets owned by current user.

```json
{
  "run": {
    "run_id": "a1b2c3d4-...",
    "item_count": 3,
    "created_at": "2026-02-21T12:00:02+00:00",
    "first_item_index": 0,
    "last_item_index": 2
  },
  "items": [
    {
      "asset_id": 10,
      "batch_id": "a1b2c3d4-...",
      "item_index": 0,
      "generation_id": 100,
      "selected_block_ids": ["blk-1"],
      "assembled_prompt": "first prompt",
      "mode": "quickgen_each",
      "strategy": "each",
      "input_asset_ids": [1, 2],
      "generation_status": "completed",
      "generation_provider_id": "pixverse",
      "generation_operation_type": "text_to_video",
      "latest_submission": {
        "submission_id": 500,
        "provider_id": "pixverse",
        "provider_job_id": "pv-job-abc",
        "retry_attempt": 0,
        "status": "success",
        "submitted_at": "2026-02-21T12:00:01+00:00",
        "responded_at": "2026-02-21T12:00:30+00:00",
        "duration_ms": 29000
      },
      "item_warnings": []
    }
  ],
  "consistency_warnings": []
}
```

### GET /generation-tracking/generations/{generation_id}

Returns unified tracking for a single generation (debugging endpoint).

**Auth:** Generation must be owned by current user (or user is admin).

```json
{
  "generation": {
    "id": 100,
    "status": "completed",
    "operation_type": "text_to_video",
    "provider_id": "pixverse",
    "asset_id": 10,
    "final_prompt": "a sunset over mountains",
    "created_at": "2026-02-21T12:00:00+00:00",
    "completed_at": "2026-02-21T12:00:30+00:00",
    "duration_seconds": 29.0
  },
  "manifest": {
    "asset_id": 10,
    "batch_id": "a1b2c3d4-...",
    "item_index": 0,
    "generation_id": 100,
    "mode": "quickgen_each"
  },
  "latest_submission": {
    "submission_id": 500,
    "provider_id": "pixverse",
    "status": "success",
    "duration_ms": 29000
  },
  "consistency_warnings": []
}
```

## Drift-Prevention Rules

1. **Writes to manifest only through the tracking/write pipeline.**
   `GenerationBatchItemManifest` rows are created exclusively in
   `services/asset/_creation.py::_upsert_generation_batch_manifest()`.
   No other code path should insert or update manifest rows.

2. **No direct consumer joins outside the facade for product code.**
   Application code (API endpoints, frontend data fetching) should use
   `GenerationTrackingService` methods rather than writing raw SQL joins
   across `generations`, `provider_submissions`, and
   `generation_batch_item_manifests`.

3. **Schema evolution goes through the service.**
   If a new field needs to be projected, add it to the service's DTO
   projection methods (`_generation_summary`, `_manifest_summary`,
   `_submission_summary`) and the corresponding Pydantic response schema.

4. **Consistency warnings are non-fatal.**
   The tracking endpoints always return available data even when cross-model
   references are broken. Warnings are informational for debugging, not
   error conditions.

## Retention Policy

| Model | Retention | Notes |
|-------|-----------|-------|
| `GenerationBatchItemManifest` | Durable | Survives generation cleanup; tied to asset lifecycle |
| `Generation` | Operational | May be pruned after configurable retention window (not implemented yet) |
| `ProviderSubmission` | Operational | Shorter-term audit trail; pruning policy TBD |

When generation rows are pruned, the manifest retains `generation_id` as a
historical reference. The tracking facade handles this gracefully by returning
`generation: null` with a consistency warning.

## Implementation Files

| File | Purpose |
|------|---------|
| `services/generation/tracking.py` | `GenerationTrackingService` — read-only facade |
| `api/v1/generations.py` | Tracking response schemas + endpoint handlers |
| `api/dependencies.py` | `get_generation_tracking_service` factory + `GenerationTrackingSvc` alias |
| `services/generation/__init__.py` | Export `GenerationTrackingService` |
| `tests/api/test_generation_tracking_endpoints.py` | Endpoint integration tests |
