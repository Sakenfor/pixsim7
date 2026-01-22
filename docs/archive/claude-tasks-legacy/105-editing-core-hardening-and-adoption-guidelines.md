## Task 105: Editing-Core Hardening & Adoption Guidelines

**Status:** Planned

### Intent

Before wiring more UIs into the `editing-core` layer, we should:

- Make the `editing-core` API and responsibilities explicit and stable.
- Ensure overlay and HUD are using it in a consistent, non-fragile way.
- Provide clear guidance on when *not* to use `editing-core` (to avoid overfitting everything into widgets).

The goal is to turn `editing-core` into a well-documented, low-surprise foundation for configurable UI surfaces (overlay, HUD, future editors) rather than a “magic” layer that only overlay understands.

---

### Current State (Summary)

**Editing-core provides:**

- `unifiedConfig.ts`:
  - `UnifiedSurfaceConfig`, `UnifiedWidgetConfig`, `UnifiedPosition`, `UnifiedVisibility`, `UnifiedStyle`.
- `dataBinding.ts` + `dataBindingResolver.ts` + `bindingAdapters.ts`:
  - The canonical `DataBinding<T>` contract and runtime resolver.
- `registry/widgetRegistry.ts`:
  - `registerWidget`, `getWidget`, `listWidgets`, `createWidget`.
  - `WidgetDefinition`, `WidgetFactory`, `WidgetRuntimeOptions`.
- `hooks/useUndoRedo` and `utils/propertyPath` (via index.ts).

**Current consumers:**

- **Overlay system:**
  - `overlayConfig.ts` – overlay ↔ unified config converters.
  - `overlayWidgetRegistry.ts` – registers all overlay widgets (`badge`, `panel`, `upload`, `button`, `menu`, `tooltip`, `video-scrub`, `progress`, `comic-panel`).
  - All overlay widgets use `DataBinding` + resolver.
  - Overlay Editor uses `getWidget` / `createWidget`.
- **HUD editor & gameplay UI (in progress):**
  - HUD integration docs assume unified configs + widget registry.
  - `HudEditor` uses `useUndoRedo` and is moving toward unified configs.
- **Data binding layer:**
  - `apps/main/src/lib/dataBinding/index.ts` re-exports editing-core bindings.

This is a good foundation, but there is minimal centralized documentation, no small tests, and no clear “adoption checklist” for other UIs.

---

### Goals

1. Make `editing-core` self-explanatory and safe to adopt:
   - Add a concise README + API overview.
   - Clarify what belongs in `editing-core` vs in overlay/HUD/game-specific libs.

2. Harden the widget registry and unified config contracts:
   - Ensure they are generic enough for HUD and future surfaces, not overlay-specific.
   - Document how `componentType` is intended to be used (e.g. `'overlay'`, `'hud'`, `'interaction'`).

3. Provide an adoption guide + patterns:
   - When to use unified configs + registry.  
   - How to register new widget types.  
   - How to layer domain-specific logic (like HUD behavior) on top without polluting `editing-core`.

4. Optional light tests / invariants:
   - Validate that basic conversions and binding resolution behave as expected.

---

### Scope

In scope:

- `apps/main/src/lib/editing-core/*`
- Overlay/HUD integration points that depend on editing-core:
  - `apps/main/src/lib/overlay/overlayConfig.ts`
  - `apps/main/src/lib/overlay/overlayWidgetRegistry.ts`
  - `apps/main/src/components/overlay-editor/OverlayEditor.tsx`
  - `HudEditor` and HUD integration docs (read-only, to align wording).

Out of scope:

- Adding new widget types or big editor features.
- Rewriting Interaction Studio or other tools to use editing-core (that can be separate, later tasks).

---

### 105.1: Add Editing-Core README & API Overview

**Goal:** A human-readable entry point for `editing-core` that other devs (and agents) can follow.

**File:**

- `apps/main/src/lib/editing-core/README.md` (new)

**Contents (at minimum):**

- **What editing-core is:**
  - A generic, React-agnostic model for configurable widget surfaces (overlay, HUD, future editors).
- **What it is not:**
  - Not a place for domain-specific logic (no game rules, no world logic).
  - Not required for all UI; only for surfaces that benefit from portable configs/presets.
- **Key modules & responsibilities:**
  - `unifiedConfig.ts`: types and versioning.
  - `dataBinding.ts` / `dataBindingResolver.ts`: binding contract + resolution.
  - `registry/widgetRegistry.ts`: registering widget types & factories.
  - `hooks` and `utils/propertyPath`: editor helpers.
- **How overlay uses it today (short example).**
- **How HUD is expected to use it.**

---

### 105.2: Clarify & Harden Widget Registry Contracts

**Goal:** Ensure `widgetRegistry` is clearly generic and safe to use for multiple component types (overlay, hud, etc.).

**File:**

- `apps/main/src/lib/editing-core/registry/widgetRegistry.ts`

**Tasks:**

- Document `componentType` usage explicitly:

  ```ts
  interface WidgetFactoryContext {
    componentType: 'overlay' | 'hud' | string;
  }
  ```

  - Clarify that:
    - Widget definitions can be reused across component types (if appropriate).
    - Or they can be specialized by componentType when building props.

- Check for any overlay-only assumptions in registry (none currently, but document that `type` is global and `componentType` is the differentiator).
- Document recommended pattern:
  - Overlay registers widget types with `componentType: 'overlay'`.
  - HUD registers its own surface types, potentially reusing or wrapping the same `UnifiedWidgetConfig` types.

No behavior change needed; this is documentation + comments, unless a small type tweak is beneficial.

---

### 105.3: Adoption Guidelines for New UI Surfaces

**Goal:** Create a short, opinionated guide for when and how a new UI surface should use `editing-core`.

**File:**

- New section in `docs/EDITABLE_UI_ARCHITECTURE.md` or a small `docs/EDITING_CORE_INTEGRATION.md`.

**Content suggestions:**

- **When to use unified configs + registry:**
  - Surface is user-configurable (layout, widgets, presets).
  - You want presets to be portable between worlds/sessions.
  - You want an editor (like OverlayEditor, HudEditor) to manipulate configs.
- **When not to use it:**
  - Simple static UI (status bars, fixed menus).
  - Purely game-logic UIs that don’t need per-world customization.
- **Steps for adopting:**
  1. Define what “surface” you’re exposing (`componentType`).
  2. Decide which widgets are needed and whether existing overlay/HUD widgets can be reused.
  3. Register widget types (or reuse registry entries) with clear `defaultConfig`.
  4. Add converters if needed (your surface config ↔ `UnifiedSurfaceConfig`).
  5. Hook up an editor (if needed) that manipulates `UnifiedSurfaceConfig`.

This should explicitly mention overlay and HUD as first-class examples.

---

### 105.4: Light Tests / Invariants (Optional but Recommended)

**Goal:** Add a small set of tests or assertions that catch obvious misuses early.

**Candidates:**

- A handful of Jest/Vitest tests (if test runner is available for frontend code) or type-level tests that:
  - Verify `toUnifiedSurfaceConfig` / `fromUnifiedSurfaceConfig` round-trip basic overlay widget configs.
  - Validate `resolveDataBinding` on simple bindings used by overlay widgets.
  - Ensure `createWidget` returns non-null for registered widget types and logs a clear warning otherwise.

If adding tests is heavy in this repo, comments + small runtime assertions are sufficient for this task.

---

### Acceptance Criteria

- `apps/main/src/lib/editing-core/README.md` exists and accurately describes:
  - What editing-core is for.
  - The main modules and how overlay/HUD interact with it.
  - When to use it / when not to.
- `widgetRegistry.ts` is clearly documented as generic, with usage guidance for `componentType`.
- A short adoption guide exists in the docs (either in `EDITABLE_UI_ARCHITECTURE.md` or as a new doc) and references overlay + HUD as examples.
- Optional tests or assertions provide basic safety net for:
  - Unified config round-tripping.
  - DataBinding resolution.
  - Widget registration/creation.

With this in place, wiring more UIs into `editing-core` (HUD, future editors, possibly Interaction Studio surfaces) will be safer and more predictable, and other agents will have a clear contract to follow.

