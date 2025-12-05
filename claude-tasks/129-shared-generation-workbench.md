## Task 129 – Extract Shared Generation Workbench

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
