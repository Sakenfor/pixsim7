**Task: UI Registry Base Class & Feature Normalization**

> **For Agents (How to use this file)**
> - This task reduces duplicated registry boilerplate in the **frontend UI** and gives all UI registries a consistent baseline of features.
> - It is deliberately **non‑breaking**: keep existing exported names and method signatures intact while moving shared behavior into a common base.
> - Read these first:
>   - `apps/main/src/lib/panels/panelRegistry.ts` – canonical “rich” UI registry (listeners, search, stats, lifecycle hooks)
>   - `apps/main/src/lib/devtools/devToolRegistry.ts` – lean dev tools registry
>   - `apps/main/src/lib/graph/editorRegistry.ts` – graph editor registry
>   - `apps/main/src/lib/gizmos/surfaceRegistry.ts` – gizmo surface registry
>   - `apps/main/src/lib/widgets/widgetRegistry.ts` – widget registry
>   - `apps/main/src/lib/control/controlCenterModuleRegistry.ts` – control center module registry
>   - `apps/main/src/lib/dataBinding/dataSourceRegistry.ts` – data source/transform registry
>   - `apps/main/src/lib/plugins/registryBridge.ts` (for context only, **do not** change in this task)

---

## Context

**Problem:** The frontend has many small, map‑based registries that all implement the same patterns:

- `register()`, `unregister()`, `get()`, `getAll()`, sometimes `has()`, `clear()`
- Optional listeners (`subscribe` / `notifyListeners`)
- Optional helpers like `getByCategory`, `search`, `getStats`

Each registry re‑implements these patterns slightly differently:

- Some have listeners, some don’t
- Some support search, some don’t
- Stats helpers are implemented ad‑hoc

This makes it harder to add new registries, and increases the chance of bugs or drift between them.

**Goal:** Introduce a shared `BaseRegistry<T>` with common behavior and migrate the UI registries to extend it, then normalize a small set of features across them where it is clearly beneficial and low‑risk.

This is **not** about unifying all UI surfaces into one mega‑registry; that would be a follow‑up design task.

---

## Phase Checklist

- [ ] **Phase 91.1 – Introduce `BaseRegistry<T>`**
- [ ] **Phase 91.2 – Migrate UI registries to `BaseRegistry`**
- [ ] **Phase 91.3 – Normalize core features (listeners/search/stats)**
- [ ] **Phase 91.4 – Tests & docs**

---

## Phase 91.1 – Introduce `BaseRegistry<T>`

**Goal**

Create a small, generic base class that captures the common “map of items + listeners” behavior used by multiple UI registries.

**Implementation Notes**

- Add a new file (suggested path):
  - `apps/main/src/lib/core/BaseRegistry.ts`
- Define:
  - `export interface Identifiable { id: string }`
  - `export class BaseRegistry<T extends Identifiable> { … }`
- `BaseRegistry<T>` should provide:
  - Internal `Map<string, T>` storage
  - `protected items: Map<string, T>`
  - `protected listeners: Set<() => void>` (optional, can be no‑op if unused)
  - Methods:
    - `register(item: T): void`
    - `unregister(id: string): boolean`
    - `get(id: string): T | undefined`
    - `getAll(): T[]`
    - `has(id: string): boolean`
    - `clear(): void`
    - `subscribe(listener: () => void): () => void`
    - `protected notifyListeners(): void`
- Behavior:
  - Overwrite on duplicate IDs with a `console.warn` hook (either built‑in or left to subclasses).
  - `subscribe` returns an unsubscribe function.
  - `clear()` removes all items and notifies listeners exactly once.

**Non‑Goals**

- Do **not** add any pluginCatalog or activation metadata here.
- Do **not** bake in categories, search, or stats – those stay in concrete registries.

---

## Phase 91.2 – Migrate UI Registries to `BaseRegistry`

**Goal**

Refactor targeted UI registries to extend `BaseRegistry`, while keeping their public API surface unchanged.

**Registries in scope**

- `apps/main/src/lib/panels/panelRegistry.ts` (`PanelRegistry`)
- `apps/main/src/lib/devtools/devToolRegistry.ts` (`DevToolRegistry`)
- `apps/main/src/lib/graph/editorRegistry.ts` (`GraphEditorRegistry`)
- `apps/main/src/lib/gizmos/surfaceRegistry.ts` (`GizmoSurfaceRegistry`)
- `apps/main/src/lib/widgets/widgetRegistry.ts` (`WidgetRegistry`)
- `apps/main/src/lib/control/controlCenterModuleRegistry.ts` (`ControlCenterModuleRegistry`)
- `apps/main/src/lib/dataBinding/dataSourceRegistry.ts` (`DataSourceRegistry`)

**Key Steps**

1. Change each class to `extends BaseRegistry<...>` and remove redundant `Map`/listener boilerplate, reusing `BaseRegistry` APIs instead.
2. Preserve all **public** methods and behavior:
   - `getByCategory`, `getVisible`, `getSorted`, `getDefault`, `getStats`, etc.
   - Lifecycle hooks (`onMount`/`onUnmount` in `PanelRegistry`, `onEnter`/`onExit` for gallery surfaces, etc.) must behave exactly as before.
3. Where registries previously had no listeners or search, keep that behavior unless Phase 91.3 explicitly expands it.
4. Keep existing singleton exports:
   - `export const panelRegistry = new PanelRegistry();`
   - `export const devToolRegistry = new DevToolRegistry();`
   - …etc.

**Constraints**

- Do **not** change import paths or names used by callers (except for internal imports from the new `BaseRegistry`).
- Do **not** modify `apps/main/src/lib/plugins/registryBridge.ts` in this phase.
- Avoid cross‑module circular dependencies when introducing `BaseRegistry`. If necessary, put it in a very low‑level `lib/core` module.

---

## Phase 91.3 – Normalize Core Features

**Goal**

Make a small set of features consistent across registries where the use‑cases are clear and the risk is low: primarily listeners and search.

**Targets**

- **Listeners**
  - Ensure these registries support `subscribe` and call `notifyListeners` on changes:
    - `PanelRegistry` (already does)
    - `WidgetRegistry` (already does)
    - `GraphEditorRegistry` (already does)
    - `DataSourceRegistry` (already does)
  - Evaluate adding listeners to:
    - `DevToolRegistry` (dev tools surface could react to new tools at runtime)
    - `GizmoSurfaceRegistry` (dev panel may eventually mutate surfaces at runtime)
  - If you add listeners to a registry that didn’t have them before, keep the new API **additive** (no behavior removal).

- **Search**
  - Maintain current search behavior in:
    - `PanelRegistry.search(query)`
    - `WidgetRegistry.search(query)`
    - `DataSourceRegistry.searchSources`, `searchTransforms`
  - Add `search(query)` where clearly beneficial:
    - `DevToolRegistry.search(query)` already exists – align behavior with panel/widget search (id/label/description/tags).
    - Consider adding `GraphEditorRegistry.search(query)` (id/label/description/tags) if there’s a plausible UX consumer (e.g., dev tools picker).

- **Stats**
  - Keep existing `getStats()` methods working:
    - `PanelRegistry.getStats()`
    - `GraphEditorRegistry.getStats()`
    - `WidgetRegistry.getStats()`
    - `DataSourceRegistry.getStats()`
  - Optionally factor out tiny helpers if they become repetitive, but do **not** over‑abstract.

**Constraints**

- No breaking changes to call sites; anything new must be additive.
- When adding new methods, document them with JSDoc and keep naming consistent with existing patterns.

---

## Phase 91.4 – Tests & Docs

**Goal**

Ensure the new base class and refactors are safe and understandable.

**Tests**

- Add focused unit tests for `BaseRegistry`:
  - Basic CRUD (`register`, `get`, `getAll`, `unregister`, `clear`).
  - Listener semantics (`subscribe` + `notifyListeners`).
  - Duplicate registration behavior (warn + overwrite).
- Where tests already exist for individual registries (e.g., `dataSourceRegistry`), adjust them minimally to reflect the new inheritance while keeping behavioral expectations the same.

**Docs**

- Add a short section to `apps/main/src/lib/README.md` (or an appropriate existing frontend dev doc) describing:
  - The purpose of `BaseRegistry<T>`
  - The list of registries that use it
  - Guidance for adding new registries (prefer extending `BaseRegistry`)

**Verification**

- TypeScript build succeeds with no new errors.
- Frontend runs without runtime errors related to registry usage.
- `registryBridge` continues to work as before (even though it is not refactored in this task).

---

## Out of Scope / Follow‑Ups

- Unifying all UI surfaces into a single `UISurfaceRegistry` (panels + dev tools + graph editors + gizmo surfaces + widgets + control center modules) is **explicitly out of scope** for this task.
- Any changes to pluginCatalog behavior or plugin activation state are out of scope.
- A future task can build on this work to:
  - Explore unified `UISurfaceDefinition` types.
  - Simplify `registryBridge` and plugin data modeling once the base behavior is stable.

