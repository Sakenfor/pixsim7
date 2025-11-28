**Task: Registry Bridge Simplification (Plugin Catalog Integration)**

> **For Agents (How to use this file)**
> - This task cleans up `registryBridge` so that “register item in registry + register metadata in plugin catalog” follows a single clear pattern.
> - Behavior must remain **backwards compatible**: same exported functions, same metadata families, same IDs.
> - Read these first:
>   - `apps/main/src/lib/plugins/pluginSystem.ts` – plugin catalog, metadata types, families
>   - `apps/main/src/lib/plugins/registryBridge.ts` – current bridge helpers
>   - `apps/main/src/lib/registries.ts` – centralized exports for core registries
>   - `apps/main/src/lib/panels/panelRegistry.ts` – panel registry
>   - `apps/main/src/lib/devtools/devToolRegistry.ts` – dev tool registry
>   - `apps/main/src/lib/graph/editorRegistry.ts` – graph editor registry
>   - `apps/main/src/lib/gizmos/surfaceRegistry.ts` – gizmo surface registry
>   - `apps/main/src/lib/worldTools/types.ts` – world tool registry
>   - `apps/main/src/lib/gallery/types.ts` – gallery tool registry (for context)

---

## Context

**Problem:** `apps/main/src/lib/plugins/registryBridge.ts` manually duplicates a pattern for many plugin families:

- Register in the “legacy” registry (`sessionHelperRegistry`, `interactionRegistry`, `nodeTypeRegistry`, `worldToolRegistry`, `graphEditorRegistry`, `devToolRegistry`, `panelRegistry`, `gizmoSurfaceRegistry`, etc.)
- Then register a parallel entry in `pluginCatalog` with `family`, `origin`, `activationState`, and other metadata.

Each family has its own pair of functions (`registerX`, `registerBuiltinX`, `unregisterX`), and they mostly perform the same steps with slightly different metadata mapping. This leads to:

- Boilerplate and drift between families
- Harder maintenance when adding fields or adjusting activation behavior
- A higher cognitive load for contributors

**Goal:** Introduce a small, internal abstraction inside `registryBridge.ts` that captures the shared pattern, while preserving all existing exports and behaviors.

This task focuses **only** on `registryBridge` + pluginCatalog integration; it does not change the underlying registries themselves (that is handled by Task 91).

---

## Phase Checklist

- [ ] **Phase 92.1 – Catalog family inventory & behavior audit**
- [ ] **Phase 92.2 – Introduce shared registration helper(s)**
- [ ] **Phase 92.3 – Refactor per‑family register/unregister functions**
- [ ] **Phase 92.4 – Sync & comparison helpers verification**

---

## Phase 92.1 – Catalog Family Inventory & Behavior Audit

**Goal**

Understand exactly how each plugin family is currently mapped into the catalog, so that refactoring does not change behavior.

**Families and registries (as of now)**

- `helper` – `sessionHelperRegistry` (`@pixsim7/game.engine`)
- `interaction` – `interactionRegistry` (`apps/main/src/lib/game/interactions/types.ts`)
- `node-type` – `nodeTypeRegistry` (`@pixsim7/shared.types`)
- `renderer` – `nodeRendererRegistry` (`apps/main/src/lib/graph/nodeRendererRegistry.ts`)
- `world-tool` – `worldToolRegistry` (`apps/main/src/lib/worldTools/types.ts`)
- `graph-editor` – `graphEditorRegistry` (`apps/main/src/lib/graph/editorRegistry.ts`)
- `dev-tool` – `devToolRegistry` (`apps/main/src/lib/devtools`)
- `workspace-panel` – `panelRegistry` (`apps/main/src/lib/panels/panelRegistry.ts`)
- `gizmo-surface` – `gizmoSurfaceRegistry` (`apps/main/src/lib/gizmos/surfaceRegistry.ts`)
- (Gallery tools have their own plumbing via `catalog.ts`; they are context for patterns but not primary targets here.)

**Key Steps**

1. For each exported helper in `registryBridge.ts`:
   - `registerHelper`, `registerBuiltinHelper`, `unregisterHelper`
   - `registerInteraction`, `registerBuiltinInteraction`, `unregisterInteraction`
   - `registerNodeType`, `registerBuiltinNodeType`, `unregisterNodeType`
   - `registerRenderer`, `registerBuiltinRenderer`, `unregisterRenderer`
   - `registerWorldTool`, `registerBuiltinWorldTool`, `unregisterWorldTool`
   - `registerGraphEditor`, `registerBuiltinGraphEditor`, `unregisterGraphEditor`
   - `registerDevTool`, `registerBuiltinDevTool`, `unregisterDevTool`
   - `registerPanelWithPlugin`, `registerBuiltinPanel`, `unregisterPanelWithPlugin`
   - `registerGizmoSurface`, `registerBuiltinGizmoSurface`, `unregisterGizmoSurface`
2. Document, in code comments or a short internal table, for each family:
   - Which fields from the source object are copied into catalog metadata (id, name, description, category, icon, capabilities, etc.).
   - Default `origin` (`'builtin'` vs `'plugin-dir'`).
   - Default `activationState` (`'active'`).
   - `canDisable` default.

**Output**

- A clear mental (or inline comment) map of how each family is treated, to be preserved in later phases.

---

## Phase 92.2 – Introduce Shared Registration Helper(s)

**Goal**

Create a small set of internal helpers that capture the common pattern of:

1. Registering the item in its “legacy” registry.
2. Building catalog metadata from the item + options.
3. Registering the metadata in `pluginCatalog`.

**Implementation Notes**

- Keep helpers **local** to `registryBridge.ts` – no new public exports.
- Suggested shape:

```ts
interface RegistryAdapter<T> {
  registryRegister: (item: T) => void;
  registryUnregister?: (id: string) => boolean | void;
}

interface CatalogAdapter<T, F extends string> {
  family: F;
  buildMetadata: (item: T, options: RegisterWithMetadataOptions) => ExtendedPluginMetadata<F>;
}

function registerWithCatalog<T, F extends string>(
  item: T,
  registry: RegistryAdapter<T>,
  catalog: CatalogAdapter<T, F>,
  options: RegisterWithMetadataOptions = {},
): void {
  registry.registryRegister(item);
  const metadata = catalog.buildMetadata(item, options);
  pluginCatalog.register(metadata);
}
```

- You may choose a slightly different structure if it makes TypeScript types simpler, but:
  - `RegisterWithMetadataOptions` should remain the single options type.
  - `extractCommonMetadata` should continue to be used where helpful.

**Constraints**

- Do **not** export the generic helper(s); they are implementation details.
- Avoid over‑generalizing; it’s fine if some families still have small special‑case code.

---

## Phase 92.3 – Refactor Per‑Family Functions

**Goal**

Rewrite the existing per‑family `registerX` / `registerBuiltinX` / `unregisterX` functions to call the shared helper(s) without changing their public API.

**Key Steps**

1. For each family:
   - Replace the manual “register in registry + pluginCatalog.register” steps with a call to `registerWithCatalog` (or equivalent).
   - Keep family‑specific metadata mapping inside `buildMetadata`.
   - Ensure `registerBuiltinX` still sets `origin: 'builtin'` and `canDisable: false`.
2. Ensure `unregisterX`:
   - Still unregisters from the underlying registry using the appropriate ID (some families use `id`, some use a derived ID like `renderer:${nodeType}`).
   - Still call `pluginCatalog.unregister` with the **same** ID used before.
3. Keep logging and warnings consistent (e.g., duplicate registration warnings, “cannot unregister” logs).

**Constraints**

- Do **not** change function names or signatures:
  - Callers of `registerPanelWithPlugin(panel, options?)` must not need to change.
- Do **not** change ID schemes:
  - E.g., renderer entries must still use `renderer:${nodeType}` as catalog ID.
- Do **not** introduce ordering changes that could affect `syncCatalogFromRegistries()`.

---

## Phase 92.4 – Sync & Comparison Helpers Verification

**Goal**

Confirm that catalog/registry synchronization utilities still behave correctly after the refactor.

**Relevant functions**

- `syncCatalogFromRegistries()`
  - Iterates over:
    - `sessionHelperRegistry.getAll()`
    - `interactionRegistry.getAll()`
    - `nodeTypeRegistry.getAll()`
    - `nodeRendererRegistry.getAll()`
    - `worldToolRegistry.getAll()`
    - `graphEditorRegistry.getAll()`
    - `panelRegistry.getAll()`
    - `gizmoSurfaceRegistry.getAll()`
  - Calls the appropriate `registerX` helper if the item is missing in the catalog.
- `printRegistryComparison()`
  - Logs counts for each family from both the registry and `pluginCatalog.getByFamily(...)`.

**Key Steps**

1. Re‑run `syncCatalogFromRegistries()` and confirm (via logs or small debug harness) that:
   - The same number of entries appears in the catalog for each family as before the refactor.
   - No duplicate entries are introduced on repeated syncs.
2. Re‑run (or lightly exercise) `printRegistryComparison()` and ensure:
   - Counts for each family are consistent.
   - Logging remains readable and useful.

**Tests**

- Add or update a minimal test harness (can be a small TS test or dev script) that:
  - Clears pluginCatalog.
  - Calls `syncCatalogFromRegistries()`.
  - Asserts that for a few known families (e.g., `workspace-panel`, `graph-editor`, `world-tool`), catalog entries exist for known IDs.

---

## Out of Scope / Follow‑Ups

- Do **not** change how underlying registries store or represent items (that is covered by Task 91).
- Do **not** introduce a Proxy‑based decorator or dynamic wrapping of registries unless there is a clear benefit and no type safety regression; this task can be solved with plain functions.
- A follow‑up task can:
  - Consider unifying UI surface family types (`workspace-panel`, `dev-tool`, `graph-editor`, `gizmo-surface`, etc.) under a higher‑level `UISurfaceDefinition`/`UISurfaceRegistry` abstraction.
  - Explore whether gallery tools should be brought fully under the pluginCatalog + registryBridge pattern for consistency.

