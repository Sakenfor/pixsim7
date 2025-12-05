## Task 129 – Extract Shared Generation Workbench ✅

### Goal
Refactor the Control Center’s Quick Generate UI into a reusable “generation workbench” component/hooks so other surfaces (Intimacy Composer, dev tools, future editors) can embed the same experience without duplicating logic.

### Motivation
- `useQuickGenerateController` already encapsulates store bindings and API calls, but QuickGenerateModule still hardcodes the prompt UI, settings bar wiring, queue controls, and status display.
- Intimacy Composer reimplements parts of this (prompt field, settings toggle, generate button) just to reuse the settings bar.
- A reusable workbench would surface the proven generation flow as drop-in UI with extensibility points, reducing divergence and easing future features (Pixverse cost hints, session badges, etc.).

### Deliverables
1. **GenerationWorkbench component**
   - Lives under `apps/main/src/components/generation/GenerationWorkbench.tsx` (or similar).
   - Encapsulates prompt input/history, status display, queue controls, `GenerationSettingsBar`, and the `generate` button.
   - Uses `useQuickGenerateController` internally but exposes hooks/props for customization (slots for prompt UI, ability to hide queue controls, callbacks for generation events).
2. **Configurable slots**
   - Allow callers to inject custom prompt editor (e.g., Intimacy social context) via render props.
   - Optional panels (before/after settings bar) to host custom controls.
   - Prop-driven toggles for queue handling, “Use active asset” button, etc.
3. **Adoption**
   - Update `QuickGenerateModule` to be a thin wrapper around the new workbench, passing its existing layout as slots.
   - Update Intimacy Composer (and any other UI currently wiring the settings bar manually) to mount the workbench instead of duplicating prompt + generate button logic.
4. **Documentation**
   - Add a short README or JSDoc in `generation/` describing how to use the workbench and hooks.
5. **Tests / verification**
   - Smoke test that `buildGenerationRequest` still receives expected params when using the workbench.
   - Manual verification in Quick Generate and Intimacy Composer to ensure behavior matches pre-refactor.

### Out of scope
- Changes to backend APIs.
- Major UX redesigns; this task focuses on reuse/composability.

---

### Implementation Summary

**Completed 2025-12-05**

Created the following files:
- `apps/main/src/components/generation/GenerationWorkbench.tsx` - Main workbench component with render props
- `apps/main/src/hooks/useGenerationWorkbench.ts` - Shared settings initialization hook
- `apps/main/src/components/generation/README.md` - Documentation
- `apps/main/src/components/generation/index.ts` - Exports

Updated:
- `apps/main/src/components/control/QuickGenerateModule.tsx` - Now wraps GenerationWorkbench
- `apps/main/src/components/intimacy/IntimacySceneComposer.tsx` - Uses useGenerationWorkbench hook

**Key design decisions:**
1. Used render props pattern for maximum flexibility in content customization
2. Created separate hook (`useGenerationWorkbench`) to handle settings initialization/sync
3. QuickGenerateModule keeps operation-specific layout logic but delegates common UI to workbench
4. IntimacySceneComposer uses only the hook (not full workbench) since it has custom generation flow
