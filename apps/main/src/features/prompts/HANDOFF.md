# Prompt analysis layer — handoff

> Picking up from commit `3d359ce52` (`feat(prompts): unify analysis rendering between composer and inspector`).

## Where things landed

The asset-viewer prompt-box inspector and the QuickGen composer now share their **rendering+analysis layout**. Editing chrome stays composer-only. See the architecture memory at `~/.claude/projects/G--code-pixsim7/memory/prompt-analysis-layer-architecture.md` for the full table of what's shared vs. what isn't.

### Shared primitives (all under `apps/main/src/features/prompts/components/`)

| Component | Role |
|---|---|
| `PromptHighlightedSpans` | Span renderer. `mode: 'visible' \| 'backdrop'`. Confidence opacity, hex underline, hover ring, **`emphasizedRole`** dim factor. |
| `PromptSpanTooltip` | Per-candidate hover tooltip (role, category, confidence, primitive_match, keywords). |
| `PromptRoleLegend` | Interactive chip-row. Hover→preview emphasis + summary tooltip. Click→toggle pin. Active chip gets a ring. |
| `PromptCodeMirrorViewer` | Read-only `PromptEditor` + shadow/operator extensions. `emphasizedRole` prop dims non-matching candidates in CM. |
| `PromptInlineViewer` | DOM read-only renderer. `emphasizedRole` prop. (Inspector-only consumer.) |
| `PromptAnalysisLayout` | **The seam.** Owns hover/pin emphasis state, `ShadowSidePanel` placement, legend placement. Caller passes editor via `renderEditor: ({emphasizedRole}) => ReactNode`. |

Plus utilities:
- `lib/shiftAnalysisPositions.ts` — `shiftCandidates()` / `shiftTokenLines()` for leading-whitespace offsets. **Important:** backend candidates are positioned in `value.trim()` frame; tokens.lines are in *original* `value` frame. Shift candidates only. Documented inline.
- `hooks/useShadowAnalysis.ts` — already shared, drives both surfaces with the 90s `promptAnalysisCache`.

### Settings split

```ts
// promptSettingsStore.ts
editorEngine: 'textarea' | 'codemirror'  // composer
viewerEngine: 'inline' | 'codemirror'    // inspector
```

Independent. Default for inspector is `'inline'` (lighter); composer defaults to `'codemirror'`.

## What's done

✅ Inspector (`PromptBoxPanel`) uses `PromptAnalysisLayout` directly.
✅ Inspector engine toggle (Inline | CM) in panel header.
✅ Inspector legend is interactive (hover preview + click pin) and threads emphasis to both engines.
✅ Inspector routes through `useShadowAnalysis` (cache-shared with composer; honours `defaultAnalyzer`).
✅ Backend tokens.lines drives chain/header/operator decorations in CM mode for both surfaces.
✅ Freshness gate fixed in `PromptComposer.tsx:893` — no longer bails on leading whitespace; shifts positions instead.
✅ Operators (`<`, `=`, `===>`, `:`) have a persistent visible style (purple text + faint bg), not just on hover.

## What's pending — composer adoption of `PromptAnalysisLayout`

The composer's text-mode rendering still has its own side-by-side flex glue that mounts `ShadowSidePanel` directly. We didn't refactor it because it's tangled with editing chrome (reference picker, popovers, ghost-diff overlay, tag pills) and a careful refactor is a focused follow-up rather than a tag-along.

**The seam is in place** — when you tackle this, the change should *delete* code in `PromptComposer.tsx` rather than add. Look at lines ~1613–1727 (the `mode === 'text'` block):

```tsx
// Three branches today:
//   1. CodeMirror engine: editor + optional ShadowSidePanel side-by-side
//   2. Textarea engine + shadow on: ShadowTextarea + ShadowSidePanel
//   3. Plain textarea (no shadow): just PromptInput
```

Target shape, branches 1 and 2 collapse into:

```tsx
<PromptAnalysisLayout
  analysis={shadowAnalysis}
  layout="side-by-side"
  showLegend={false}  // composer has rich tooltips + side panel; legend is redundant here
  renderEditor={({ emphasizedRole }) => useCodemirror ? (
    <PromptEditor
      value={value}
      onChange={onChange}
      extensions={cmExtensionsWithEmphasis}  // see below
      ...
    />
  ) : (
    <ShadowTextarea
      value={value}
      onChange={onChange}
      candidates={shiftedCandidates}
      // ShadowTextarea also needs emphasizedRole plumbing — currently it
      // doesn't have the prop. Add it (passes through to PromptHighlightedSpans).
      emphasizedRole={emphasizedRole}
      ...
    />
  )}
/>
```

### Sub-tasks for the composer refactor

1. **Add `emphasizedRole` prop to `ShadowTextarea`**, pass through to its `<PromptHighlightedSpans mode="backdrop">`. Already supported on the renderer; just plumb it in.
2. **Thread `emphasizedRole` into `cmExtensions`** — include it in `shadowAnalysisExtension(...)` config. The extension already accepts `emphasizedRole`; just include it in the useMemo deps + config object alongside `cmShadowCandidates`/`cmShadowTokenLines`.
3. **Decide on legend in composer**:
   - Option A: keep `showLegend={false}` — `ShadowSidePanel` covers it (current behaviour after the round-trip we did).
   - Option B: keep legend visible but only when sidepanel is collapsed/hidden (future feature: collapsible side panel).
4. **Hoist editor refs/popover state** — popovers (`cmShadowPopover`, `cmOperatorPopover`, `cmRefInput`, `referencePickerRef`) currently sit inside the editor wrapper div. They need to either move outside `renderEditor` or stay inside it (they should stay inside; just be careful with refs).
5. **Plain-textarea-no-shadow branch** — leave as-is. No analysis means no `PromptAnalysisLayout`; just render `PromptInput` directly.

Estimated impact: net-negative LOC in `PromptComposer.tsx` (~80–100 lines removed, ~20 added).

## Known issues / open questions

### Residual scroll drift "near end" with Latin block
The user reported drift near a block of Latin sentences (from the prompt example `ACTOR1_TOOLS_TONGUE < Lingua ūmida flōrem carnis...` referenced in `tools/cue/recipes/relation_recipes.cue:22`). After my freshness-gate fix, drift is "almost gone" but still visible near the end.

**Verified not the cause:**
- JS `.length` matches Python `len()` for the example chars (all BMP precomposed) — confirmed via test.
- CRLF lengths match between JS and Python — confirmed.
- Freshness gate now correctly handles leading whitespace.
- Candidates vs. tokens position-frame mismatch fixed.

**Possible remaining causes** (not yet investigated):
1. **CSS line padding affecting CM `lineWrapping` measurement**: the structural decorations (`.cm-shadow-header-line`, `.cm-shadow-chain-line-*`) add `paddingLeft: 6px` inside `.cm-line` elements. CM measures rendered widths via DOM, but if a decoration is added asynchronously after initial measurement, wrap points may drift on re-measure. Try replacing `paddingLeft` with a `box-shadow inset` for the indent visual.
2. **Combining diacritics**: if any of the user's actual prompt content uses decomposed Unicode (`u` + U+0304 macron rather than precomposed `ū`), JS and Python both count those as 2 code units — no mismatch, but visual width may differ from CM's metric cache.
3. **`TagPillWidget`** (`tagPillExtension.ts:49`) uses `font-size: 0.85em` + custom padding + `max-width: 280px` with `overflow: hidden text-overflow: ellipsis`. CM measures via `getBoundingClientRect()` so should be accurate, but if the user's prompt has `[primitive_tags: ...]` style brackets, the pill widget could be a measurement source if its width changes after font load.
4. **Supplementary-plane chars** (emoji etc.): not seen in user's example but worth ruling out by asking for the actual characters near where drift starts.

**Suggested first probe for next session:** ask the user to disable shadow (`autoAnalyze` off) and confirm whether drift persists. If it goes away → it's an extension-side issue (most likely TagPill or line padding). If it stays → it's something deeper in the editor or page CSS.

### Composer `lint-staged` errors

The pre-commit hook reported two pre-existing lint errors when I committed — both unrelated to this work:
- `PromptComposer.tsx:335`: `setAssistantError` unused
- `PromptComposer.tsx:1143`: `handleInsertBlock` unused

They didn't block the commit (commit went through). Either fix them in passing, or skip — they pre-date this branch.

## Files touched in this commit (3d359ce52)

```
apps/main/src/features/panels/domain/definitions/prompt-box/PromptBoxPanel.tsx  M
apps/main/src/features/prompts/components/PromptAnalysisLayout.tsx              A
apps/main/src/features/prompts/components/PromptCodeMirrorViewer.tsx            A
apps/main/src/features/prompts/components/PromptComposer.tsx                    M
apps/main/src/features/prompts/components/PromptHighlightedSpans.tsx            A
apps/main/src/features/prompts/components/PromptInlineViewer.tsx                M
apps/main/src/features/prompts/components/PromptRoleLegend.tsx                  A
apps/main/src/features/prompts/components/PromptSpanTooltip.tsx                 A
apps/main/src/features/prompts/components/ShadowTextarea.tsx                    M
apps/main/src/features/prompts/index.ts                                         M
apps/main/src/features/prompts/lib/operatorEditExtension.ts                     M
apps/main/src/features/prompts/lib/shadowAnalysisExtension.ts                   M
apps/main/src/features/prompts/lib/shiftAnalysisPositions.ts                    A
apps/main/src/features/prompts/stores/promptSettingsStore.ts                    M
```

## Quick orientation for the next session

If the user opens a fresh thread and references "the prompt panel work" or similar:

1. Read this handoff and the architecture memory.
2. Skim `PromptAnalysisLayout.tsx` (small, ~115 lines) — that's the seam.
3. Check `PromptComposer.tsx:893` for the freshness gate (already fixed) and lines 1613–1727 for the un-refactored text-mode rendering.
4. The user values: **avoiding mirrored code between surfaces**, **structure visibility at rest** (not just on hover), **inspector consistency with composer's shadow analysis**.

Their typical prompt patterns include capital-first labels (`SCENE:`, `ACTOR_PERSONALITY<`, `====>NIGHT`) — chain-style structure with operators. Lowercase like `setting:` is *intentionally* not detected as a header by the tokenizer (always required uppercase first char). Their actual content includes Latin sentences as chain prose elements.
