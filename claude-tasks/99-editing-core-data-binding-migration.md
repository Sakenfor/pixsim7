# Task 99 – Editing Core Data Binding Migration

## Goal

Align all editable UI systems (Overlay, HUD, Panel Builder) on the new
`editing-core` data binding types, while **reusing** the existing
`apps/main/src/lib/dataBinding` implementation instead of creating a third
binding system.

This is **architectural** work: behavior should remain the same, but the
types and wiring should reflect the "Editable UI Core" direction defined in
`docs/EDITABLE_UI_ARCHITECTURE.md`.

---

## Context

Current situation:

- New core skeleton added:
  - `apps/main/src/lib/editing-core/unifiedConfig.ts`
  - `apps/main/src/lib/editing-core/dataBinding.ts`
  - `apps/main/src/lib/editing-core/hooks/useUndoRedo.ts`
  - `apps/main/src/lib/editing-core/registry/widgetRegistry.ts`

- Existing, feature-complete data binding system:
  - `apps/main/src/lib/dataBinding/index.ts`
  - `apps/main/src/lib/dataBinding/dataSourceRegistry.ts`
  - `apps/main/src/lib/dataBinding/dataResolver.ts`
  - `apps/main/src/lib/dataBinding/storeAccessors.ts`
  - `apps/main/src/lib/dataBinding/coreDataSources.ts`
  - `apps/main/src/lib/dataBinding/useDataBindings.ts`
  - `apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md`

- Panel builder uses Task 51 binding system:
  - `apps/main/src/components/panels/ComposedPanel.tsx`

- Overlay overlay-specific property-path bindings live separately:
  - `apps/main/src/lib/overlay/utils/propertyPath.ts`

We want **one** conceptual data binding system with:

- Shared types in `editing-core/dataBinding.ts`
- Shared serializable shape in `editing-core/unifiedConfig.ts` (`UnifiedDataBinding`)
- Implementation (sources, resolver, hooks) reused from `lib/dataBinding`
- Overlay/HUD using the same binding story over time

---

## Deliverables

### 1. Align lib/dataBinding types with editing-core/dataBinding

**Files:**
- `apps/main/src/lib/editing-core/dataBinding.ts`
- `apps/main/src/lib/dataBinding/index.ts`
- `apps/main/src/lib/dataBinding/dataResolver.ts`

**Tasks:**

- Update `lib/dataBinding/index.ts` to re-export the `DataBinding` type from
  `editing-core/dataBinding` (or create a thin compat alias), so there is
  **one canonical `DataBinding` shape** in the codebase.

- Ensure the binding objects used by Task 51 (`createBinding`, etc.) conform
  to `DataBinding<T>` from `editing-core`:
  - `kind: 'static' | 'path' | 'fn'`
  - `target: string`
  - `path?`, `staticValue?`, `fn?`

- Update `dataResolver.ts` (and any helpers) to accept/return
  `DataBinding<T>` (the core type) rather than ad-hoc or local types.

**Acceptance criteria:**
- `apps/main/src/lib/editing-core/dataBinding.ts` is the single source of
  truth for the `DataBinding` interface.
- `lib/dataBinding` functions operate on that type and compile with it.

---

### 2. Bridge runtime bindings to UnifiedDataBinding

**Files:**
- `apps/main/src/lib/editing-core/unifiedConfig.ts`
- `apps/main/src/lib/dataBinding/*`

**Tasks:**

- Implement small helper(s) to convert between:
  - `UnifiedDataBinding` (serializable shape used in configs)
  - `DataBinding` (runtime shape used by resolvers/hooks)

Examples (can live in either `editing-core/dataBinding.ts` or a new
`editing-core/bindingAdapters.ts`):

```ts
import type { UnifiedDataBinding } from './unifiedConfig';
import type { DataBinding } from './dataBinding';

export function fromUnifiedBinding(b: UnifiedDataBinding): DataBinding {
  return {
    kind: b.kind,
    target: b.target,
    path: b.path,
    staticValue: b.staticValue,
  };
}

export function toUnifiedBinding(b: DataBinding): UnifiedDataBinding {
  return {
    kind: b.kind,
    target: b.target,
    path: b.path,
    staticValue: b.staticValue,
  };
}
```

**Acceptance criteria:**
- There is a clear, typed adapter between `UnifiedDataBinding` and
  `DataBinding`.
- No editor directly invents its own binding shape; they go through these
  types.

---

### 3. Start using core DataBinding in at least one consumer

**Files (candidate):**
- `apps/main/src/components/panels/ComposedPanel.tsx`
- `apps/main/src/lib/widgets/panelComposer` (if binding types are defined)

**Tasks:**

- Update Panel Builder/ComposedPanel to type its `widget.dataBindings` as
  `DataBinding[]` (from `editing-core`) instead of `any` or a local shape.

- Ensure `useBindingValues` and related hooks from `lib/dataBinding` accept
  this `DataBinding[]` type directly.

**Acceptance criteria:**
- At least one real consumer (ComposedPanel) is using the shared core type.
- No runtime behavior change: panels still render and resolve bindings.

---

### 4. Wire Overlay widgets to core DataBinding

**Files:**
- `apps/main/src/lib/overlay/utils/propertyPath.ts`
- `apps/main/src/lib/overlay/widgets/ProgressWidget.tsx`
- `apps/main/src/lib/overlay/widgets/UploadWidget.tsx`
- Any other overlay widgets that accept `value`, `label`, or similar bindings

**Tasks:**

- Refactor overlay widgets that currently accept `number | string | ((data) => T)`
  props (e.g. `value`, `label`, `state`) to instead use the shared
  `DataBinding<T>` abstraction where practical.

- Keep `propertyPath.ts` as the implementation detail for `kind: 'path'`:
  - Map string paths coming from existing overlay configs to
    `DataBinding<T>` with `kind: 'path'`.
  - Use `resolvePath` internally when resolving bindings at runtime.

- Ensure overlay-facing types for widget configs are updated to accept
  `DataBinding<T> | number | string | ((data) => T)` during the transition,
  but prefer the `DataBinding<T>` path for new code.

**Acceptance criteria:**
- Overlay property-path bindings conceptually flow through the shared
  `DataBinding<T>` type.
- `propertyPath.ts` is clearly documented as the resolver for `kind: 'path'`
  in overlay, not as a separate binding system.

---

### 5. Documentation alignment

**Files:**
- `docs/EDITABLE_UI_ARCHITECTURE.md`
- `apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md`

**Tasks:**

- In `DATA_BINDING_GUIDE.md`, add a short note that:
  - `DataBinding` is now defined in `apps/main/src/lib/editing-core/dataBinding.ts`
  - `lib/dataBinding` provides the implementation (sources, resolvers, hooks)
  - Future editors (Overlay/HUD) should use the core types.

- In `EDITABLE_UI_ARCHITECTURE.md`, adjust the "Data Binding" section to
  reflect that the **implementation** currently lives in `lib/dataBinding`
  but the **type contract** is owned by `editing-core`.

**Acceptance criteria:**
- Docs no longer suggest that `editing-core/dataBinding` is unused or purely
  future; it is clearly the type anchor for binding.

---

## Out of Scope (for this task)

- Refactoring HUD to use bindings; this can be a follow-up task.
- Removing `lib/dataBinding` entirely. The goal is alignment and reuse, not
  deletion, in this task.

---

## Notes / Tips

- Keep this migration **type-first**: get everything compiling against the
  shared `DataBinding` interface before changing behavior.
- Prefer small adapter helpers instead of deeply rewriting existing
  dataBinding code in one go.
- Once Panel Builder and Overlay are both on the core types, HUD can be
  migrated in a separate task without blocking this one.

