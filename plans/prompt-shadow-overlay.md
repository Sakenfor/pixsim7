# Prompt Shadow Overlay

## Summary

Connects a shadow overlay to the raw prompt text flow (text mode, not block mode).
Uses the existing `/prompts/analyze` endpoint and surfaces `metadata.primitive_match`
from candidates enriched by the backend's primitive projection system.

## What was implemented

### New files

| File | Purpose |
|------|---------|
| `features/prompts/lib/parsePrimitiveMatch.ts` | Strict runtime parser for `metadata.primitive_match` payload |
| `features/prompts/hooks/useShadowAnalysis.ts` | Debounced background analysis hook (600ms, stale-request protection) |
| `features/prompts/components/ShadowOverlay.tsx` | Compact overlay component rendered under the prompt input |
| `features/prompts/lib/__tests__/parsePrimitiveMatch.test.ts` | Unit tests for parser + extraction + position detection |

### Modified files

| File | Change |
|------|--------|
| `features/prompts/components/PromptComposer.tsx` | Integrated `useShadowAnalysis` hook + `ShadowOverlay` in text mode |
| `features/prompts/components/PromptInlineViewer.tsx` | Fixed `PromptCandidateList` missing `promptRoleColors` store binding |

## Behavior

1. **Trigger**: Text mode only, when `autoAnalyze` setting is `true` (default).
2. **Debounce**: 600ms after last keystroke, minimum 8 chars.
3. **API call**: `POST /prompts/analyze` with `{ text, analyzer_id }`.
4. **Display**: Compact collapsible section below the prompt textarea.
   - Inline highlighted prompt via `PromptInlineViewer` (when position data exists).
   - Grouped candidate list fallback (when no position data).
   - Primitive match list: `block_id`, score %, optional `op_id`/`signature_id`, category.
   - "No primitive matches detected" when candidates exist but none have primitive matches.
5. **Controls**: Collapse/expand toggle (default expanded), manual refresh button.
6. **Non-destructive**: No text rewriting, no block insertion, no side effects.

## Edge cases handled

- Metadata can be `null`, non-object, or missing `primitive_match` — parser returns `null`.
- `block_id` must be non-empty string; `score`/`confidence` must be finite numbers.
- `overlap_tokens` and `op.modalities` arrays filter out non-string items.
- Stale requests are discarded via request ID counter.
- API errors fail silently (previous result preserved).
- Empty/short prompts skip analysis entirely.
- Overlay hides when no result and not loading.
- `PromptCandidateList` had a pre-existing bug (unbound `promptRoleColors`) — fixed.

## Known limitations

- No caching of analysis results — each prompt change triggers a new API call after debounce.
  Could add TTL cache keyed on normalized text (like `useSemanticActionBlocks`).
- Shadow overlay is always below the textarea — no floating/repositioning option.
- No click-to-insert from primitive matches (read-only display only).
- The `analyzer_id` param is passed to the API but whether the backend uses it for
  primitive projection depends on the analyzer pipeline configuration.
