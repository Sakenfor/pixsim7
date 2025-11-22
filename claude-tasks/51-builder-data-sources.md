**Task 51: Builder Data Sources & Binding System**

> **For Agents (How to use this file)**
> - This task defines the data source + data binding layer used by the Panel Builder / Composer (Task 50.4).
> - It focuses on **how widgets get live data**, not on layout or widget rendering.
> - Designed to be implementable in parallel with later phases of Task 50, as long as the integration contracts below are respected.
> - Read these first:
>   - `claude-tasks/50-workspace-panel-system-enhancement.md` – Panel registry + builder context
>   - `apps/main/src/lib/panels/widgetRegistry.ts` – Widget types (once created)
>   - `apps/main/src/lib/panels/panelComposer.ts` – Panel composition engine (once created)
>   - `apps/main/src/stores/workspaceStore.ts` – Workspace state (for safe store access)

---

## Context

Task 50 introduces a **Panel Builder/Composer** (Phase 50.4) that allows users to create custom panels from widgets. That task already sketches:

- A `WidgetDefinition` / `WidgetInstance` model.
- A `PanelComposition` structure with `layout` and `widgets`.
- A `DataSource` interface (in the Task 50 doc) for potential future use.

This task (51) takes ownership of making that **data source + binding system real**:

- Define **canonical data source types** (store, static, computed; API later).
- Implement a **data source registry** with safe access into existing stores.
- Implement a **binding resolution engine** that widgets can call.
- Provide a **lean UI API** for the builder (the actual binding editor UI is part of Task 50.4, but it will use the APIs defined here).

> **Important:** No database schema changes. All state is frontend-only and persisted via existing workspace/panel configuration mechanisms (JSON fields).

---

## Goals

1. **Define data source & binding types** that are stable and serializable.
2. **Implement a registry** for data sources and transforms, with clear safety guarantees.
3. **Provide a resolution API** that widgets and the builder can use to get live data.
4. **Integrate lightly with the Panel Builder** without tightly coupling to widget implementations.

This enables:
- **Panel Builder (Task 50.4)**: Widgets can bind to live data instead of mock data.
- **Future plugins**: Plugins can contribute new data sources / transforms in a controlled way.
- **Consistent safety rules**: No ad-hoc `eval` or unbounded API calls from widgets.

---

## Non-goals

- No generic query language or GraphQL-style builder in this task.
- No remote plugin marketplace or external data source loading.
- No arbitrary user-provided JavaScript execution.
- No direct database or backend schema changes (only use existing APIs/stores).

Those can be considered for later tasks if needed.

---

## Phase Checklist

- [ ] **Phase 51.1 – Core Types & Registry**
- [ ] **Phase 51.2 – Resolution Engine & Caching**
- [ ] **Phase 51.3 – Builder Integration Hooks**
- [ ] **Phase 51.4 – Plugin Integration & Advanced Sources** (future)

**Overall Status:** Waiting – can be started in parallel with Task 50 once core builder types exist.

---

## Phase 51.1 – Core Types & Registry

**Goal:** Define canonical data source and binding types, and implement a lightweight registry to manage them.

### A. Data Source Types

Start with a constrained subset of the `DataSource` shape sketched in Task 50:

```typescript
// Core data source definition (serializable)
export type DataSourceType = 'store' | 'static' | 'computed';

export interface DataSourceDefinition {
  id: string;
  type: DataSourceType;

  // Human-friendly metadata
  label: string;
  description?: string;
  tags?: string[];

  // For 'store' sources
  storeId?: string;         // e.g. 'workspace', 'scene-builder', 'game-session'
  path?: string;            // e.g. 'scenes.length', 'currentScene.meta.stats'

  // For 'static' sources
  value?: unknown;

  // For 'computed' sources
  dependencies?: string[];  // IDs of other data sources
  transformId?: string;     // ID of a registered transform to apply

  // Caching hints (optional, can be ignored initially)
  cache?: boolean;
  refreshIntervalMs?: number;
}
```

Notes:
- API-based sources (`type: 'api'`) are explicitly deferred to Phase 51.4.
- `storeId` values should be a small, curated enum backed by helpers (not free-form strings).

### B. Data Binding Types

Define how widgets refer to data sources:

```typescript
export interface DataBinding {
  id: string;                 // unique per widget binding
  sourceId: string;           // DataSourceDefinition.id
  targetProp: string;         // Widget prop name, e.g. 'value', 'data'
  transformId?: string;       // Optional transform applied on top
  fallbackValue?: unknown;    // Used when resolution fails
}
```

Widgets in the builder composition (Task 50) will use:

```typescript
// In WidgetInstance (see Task 50)
dataBindings: Record<string, DataBinding>;
```

### C. Registry API

Create a dedicated registry module:
- `apps/main/src/lib/panels/dataSourceRegistry.ts`

Responsibilities:
- Track `DataSourceDefinition` instances.
- Track transform functions (pure, deterministic).
- Provide read-only access to the builder and widgets.

Example API:

```typescript
export interface DataTransform {
  id: string;
  label: string;
  description?: string;
  apply: (input: unknown) => unknown;
}

export const dataSourceRegistry = {
  registerSource(def: DataSourceDefinition): void,
  getSource(id: string): DataSourceDefinition | undefined,
  getAllSources(): DataSourceDefinition[],

  registerTransform(t: DataTransform): void,
  getTransform(id: string): DataTransform | undefined,
  getAllTransforms(): DataTransform[],
};
```

Implementation:
- In Phase 51.1, keep this as a simple in-memory singleton (no pluginSystem integration yet).
- Later (Phase 51.4), it can be bridged into the unified plugin catalog if desired.

### Files to Add/Modify

- [ ] `apps/main/src/lib/panels/dataSourceRegistry.ts` – Core registry and types.
- [ ] `apps/main/src/types/panelBuilder.ts` – Shared types for `DataBinding` (if not already defined; can be co-located with existing builder types).
- [ ] Update `claude-tasks/50-workspace-panel-system-enhancement.md` – Cross-link to this task for data binding specifics (optional).

### Verification

- [ ] Registry can register and retrieve sources and transforms.
- [ ] Definitions are serializable (no functions or non-JSON-safe fields).
- [ ] No references to backend schemas or DB-level constructs.

---

## Phase 51.2 – Resolution Engine & Caching

**Goal:** Implement the runtime logic that turns `DataBinding` + `DataSourceDefinition` into actual data for widgets, with safe access patterns.

### A. Resolution API

Create a pure-ish resolver module:
- `apps/main/src/lib/panels/dataResolver.ts`

Core function:

```typescript
export interface DataContext {
  // Optional: pre-resolved slices of state if needed
  // e.g. current scene, current session, etc.
}

export interface ResolvedBinding<T = unknown> {
  binding: DataBinding;
  value: T | undefined;
  error?: Error;
}

export function resolveBinding(
  binding: DataBinding,
  context?: DataContext
): ResolvedBinding;
```

Responsibilities:
- Look up the `DataSourceDefinition` by `binding.sourceId`.
- For `type: 'store'`, read from a **whitelisted set of Zustand stores**, using safe path access.
- For `type: 'static'`, return the stored value.
- For `type: 'computed'`, resolve dependencies first, then apply transform(s).
- Apply transforms from `dataSourceRegistry` if `transformId` is present.
- Use `fallbackValue` when something fails, and surface errors in `ResolvedBinding.error`.

### B. Store Access

Define a small adapter layer so the resolver doesn’t directly depend on every store:

```typescript
export type StoreId = 'workspace' | 'scene-builder' | 'game-session'; // extend as needed

export interface StoreAccessor {
  id: StoreId;
  getSnapshot: () => unknown; // read-only snapshot of store state
}
```

- Implement a registry of `StoreAccessor`s that know how to call `useWorkspaceStore.getState()` etc, but **resolver only uses the accessor API**.
- Nested path access (`path` on `DataSourceDefinition`) should be implemented with a safe helper (e.g., dot-path reader with undefined handling).

### C. Caching (Optional for MVP)

For 51.2, caching can be minimal:
- Compute on demand per render; rely on React memoization / `useMemo` at the widget level.
- Respect `refreshIntervalMs` only if easy; otherwise treat it as future work.

### Files to Add/Modify

- [ ] `apps/main/src/lib/panels/dataResolver.ts` – Binding resolution logic.
- [ ] `apps/main/src/lib/panels/storeAccessors.ts` – Registry for whitelisted stores.

### Verification

- [ ] Resolving `store` sources reads correct values from known stores.
- [ ] Resolving `static` sources returns stored values exactly.
- [ ] Resolving `computed` sources works with transforms and dependencies.
- [ ] Errors are surfaced but do not crash widgets (fallback is used).

---

## Phase 51.3 – Builder Integration Hooks

**Goal:** Provide minimal, well-defined hooks for the Panel Builder (Task 50.4) and widgets to consume resolved data without tightly coupling to implementation details.

### A. React Hooks

Provide thin hooks that Panel Builder / widgets can use:

```typescript
export function useResolvedBinding<T = unknown>(
  binding: DataBinding | undefined
): ResolvedBinding<T> | undefined;

export function useResolvedBindings<T = unknown>(
  bindings: Record<string, DataBinding> | undefined
): Record<string, ResolvedBinding<T>>;
```

Implementation:
- Internally use `resolveBinding`.
- Subscribe to relevant stores via their accessors (or via selector hooks) to update when data changes.

### B. Builder Integration Contract

The builder (Task 50.4) should treat the data layer as a black box:

- It passes `dataBindings` from `WidgetInstance` into `useResolvedBindings`.
- It passes the resulting values into the widget component props.
- It uses a simple API from this task to:
  - List available data sources (`dataSourceRegistry.getAllSources()`).
  - List available transforms for advanced binding UI.

This keeps Task 50 and Task 51 loosely coupled and safe to work on in parallel.

### Files to Add/Modify

- [ ] `apps/main/src/lib/panels/useDataBindings.ts` – React hooks for resolution.
- [ ] Panel Builder components (from Task 50.4) – Use hooks rather than reaching into resolver directly.

### Verification

- [ ] Widgets receive updated values when underlying stores change.
- [ ] Builder can list/select data sources and transforms for binding configuration.
- [ ] No direct store access from widgets; all goes through the hooks.

---

## Phase 51.4 – Plugin Integration & Advanced Sources (Future)

**Goal:** Optional future work to make data sources and transforms plugin-extensible and to introduce additional source types.

### Possible Extensions

- Integrate `DataSourceDefinition` and `DataTransform` as a new plugin family (e.g., `'data-source'`) using `pluginSystem.ts` and `registryBridge.ts`.
- Add `type: 'api'` with strict whitelisting:
  - Only use existing backend APIs.
  - Enforce rate limits and caching.
- Add more advanced transforms (grouping, aggregation) as plugin-provided `DataTransform`s.

### Non-goals (Remain out of scope)

- No arbitrary HTTP endpoints defined by users.
- No user-provided JavaScript or dynamic code evaluation.

---

## Testing

- Add unit tests for:
  - `dataSourceRegistry` (register/get/list sources and transforms).
  - `dataResolver` (correct resolution logic and error handling).
  - `storeAccessors` (correctly read from Zustand stores without mutating).
  - `useDataBindings` hooks (reactivity when underlying store state changes).
- Test edge cases:
  - Missing `sourceId`.
  - Missing transforms.
  - Invalid paths into store snapshots.
  - Circular dependencies in `computed` sources (should fail cleanly).

---

## Success Criteria

- Builder widgets can bind to basic data:
  - Store values (e.g., counts, flags, derived metrics via transforms).
  - Static config values.
  - Simple computed combinations of other sources.
- All bindings are serializable and persist with panel compositions.
- No widget reaches directly into global stores or performs ad-hoc data fetching.
- Future plugin-based extensions for data sources remain feasible without major refactors.

