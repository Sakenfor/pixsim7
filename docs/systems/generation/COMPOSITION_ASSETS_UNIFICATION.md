# Composition Assets Unification Plan

Goal: use `composition_assets` as the single canonical input list for all operations that accept media inputs, and derive provider-specific fields from it in one place.

## Why This Change

- Today the same input can be represented as `image_url`, `image_urls`, `video_url`, `source_asset_id(s)`, and `composition_assets`.
- That duplication creates drift and makes failures harder to debug.
- `composition_assets` already exists and is the best place to carry structured intent.

## Key Decisions

1. Treat `composition_assets` as the canonical input list for all operations.
2. Keep legacy fields as input aliases only, and convert them into `composition_assets` early.
3. Providers should derive `image_url(s)` and `video_url` from `composition_assets` only.
4. Add optional `media_type` to `CompositionAsset` to disambiguate image vs video inputs.
5. Keep `prompts` and `durations` top-level for transitions for now, aligned by index.

## Phase 1: Backend Canonicalization (Compatibility Preserved)

1. Schema update
   - Add `media_type: Optional[str]` to `CompositionAsset` with allowed values `image` and `video`.
   - Keep backward-compatible extra fields via `provider_params`.

2. Canonical params
   - In `pixsim7/backend/main/services/generation/creation.py`, convert legacy fields into `composition_assets` if not already provided.
   - Stop writing derived `image_url(s)` and `source_asset_id(s)` into canonical params for image operations.
   - Keep `prompts` and `durations` for transitions as top-level fields.

3. Shared extraction helper
   - Add a helper to turn `composition_assets` into a list of refs and URLs with optional media filtering.
   - Use this helper in provider adapters instead of ad-hoc parsing.

4. Provider adapters
   - Pixverse, Remaker, Sora: derive their required `image_url(s)` or `video_url` from `composition_assets`.
   - Remove fallback logic that rebuilds inputs from `composition_assets` inside provider ops.

## Phase 2: Frontend Alignment

1. Generation panel
   - Always send `composition_assets` for any operation that accepts inputs.
   - Ensure `media_type` is set when the input is a video asset.

2. Transition UI
   - Keep `prompts` and `durations` but align them to the `composition_assets` order.

## Phase 3: Deprecation Cleanup

1. Remove legacy fields from generation schemas and input handling.
2. Remove provider code paths that accept legacy fields.
3. Delete migration shims once all clients are updated.

## Tests to Add

1. Conversion tests for legacy fields to `composition_assets`.
2. Provider adapter tests that accept only `composition_assets`.
3. Transition input alignment test: `composition_assets[i]` maps to `prompts[i]`.

## Open Questions

1. Should transition prompts be moved into `composition_assets.provider_params` in a later phase?
2. Do we want a single `input_role` field separate from the composition `role`?
3. Should `media_type` be inferred from asset metadata when missing?
