# Test Overview Graphs + Shadow Guard

## What Changed

- Added generic analytics aggregators in `apps/main/src/features/devtools/services/testOverviewService.ts`:
  - `getRunStatusSeries(snapshots, options)`
  - `getPassRateByProfile(snapshots, options)`
  - `getRunVolumeSeries(snapshots, options)`
- Added options-based analytics filtering (`window`, optional `profileId`, optional `now`) to keep graph logic generic and profile/snapshot scoped.
- Extended service tests in `apps/main/src/features/devtools/services/testOverviewService.test.ts` to cover:
  - time filtering
  - profile filtering
  - pass-rate computation
  - empty input behavior
- Updated `apps/main/src/features/panels/components/dev/TestAnalyticsGraphs.tsx` to:
  - consume service-layer aggregators
  - keep time window controls (`7d | 14d | 30d | all`)
  - keep optional profile filter
  - render three analytics blocks:
    - run status trend
    - pass rate by profile
    - run volume by day
- Added additive shadow-only ambiguity suppression in `pixsim7/backend/main/services/prompt/parser/primitive_projection.py`:
  - if top scored candidates across different primitive domains are near-tied (small delta), suppress `primitive_match` (return no match)
  - no role/confidence mutation and no non-shadow parser behavior changes
- Added edge-case tests in `pixsim7/backend/tests/test_primitive_projection_edge_cases.py` for cross-domain ambiguity suppression.

## Metrics Delta

Reference baseline (prior report):
- Overall P@1: `60.6%`
- Overall Coverage: `63.5%`
- Overall FPR: `40.6%`
- Overall counts: `TP=80, FP=52, Miss=27, TN=95`

After ambiguity guard (`python -m pixsim7.backend.scripts.eval_primitive_projection`):
- Overall P@1: `61.3%` (`+0.7pp`)
- Overall Coverage: `60.3%` (`-3.2pp`)
- Overall FPR: `37.5%` (`-3.1pp`)
- Overall counts: `TP=76, FP=48, Miss=32, TN=98`

Interpretation:
- Guard reduced false positives, especially in ambiguous prompts.
- Coverage dropped due to intentional suppression of close cross-domain matches.
- Recommendation remains `stay shadow`.

## Remaining Risks

- Frontend coverage here is limited to the targeted `testOverviewService.test.ts`; full frontend suite behavior was not re-run in this task.
- Ambiguity suppression improves safety but can increase misses on mixed prompts where a correct dominant domain still exists.
- High FPR on ambiguous prompts remains above promotion threshold; shadow mode should remain metadata-only until further scoring refinement.
