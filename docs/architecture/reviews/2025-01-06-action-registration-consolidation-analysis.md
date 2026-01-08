# Action Registration Consolidation Analysis

**Date:** 2025-01-06
**Status:** Analysis Complete
**Related:** Module system, capability registry, command palette

## Overview

Analysis of current action registration patterns in the frontend to propose consolidation where modules become the single source of truth for action metadata (id/title/description/icon/availability/handler) that feeds capabilities, command palette, docs/app map, etc.

## Context

Recent refactoring changed capability registration so module pages are the source of feature metadata. `registerCoreFeatures.ts` now only registers actions/states (no `registerCompleteFeature`). Modules call `registerXActions` to register actions. This analysis proposes consolidating action metadata the same way.

---

## 1. Findings: Where Action Registration Happens

### Pattern A: Capability Store Actions (`registerXActions`)

**Location:** `apps/main/src/lib/capabilities/registerCoreFeatures.ts`

Actions are registered imperatively via `useCapabilityStore.getState().registerAction()`:

| Function | Lines | Actions Registered |
|----------|-------|-------------------|
| `registerAssetsActions` | 17-64 | `assets.open-gallery`, `assets.upload`, `assets.search` |
| `registerGenerationActions` | 72-116 | `generation.quick-generate`, `generation.open-presets`, `generation.select-provider` |
| `registerGameActions` | 121-142 | `game.enter-world`, `game.npc-editor` |
| `registerAutomationActions` | 147-159 | `automation.open` |
| `registerPluginsActions` | 164-177 | `plugins.open` |
| `registerAppMapActions` | 182-196 | `app-map.open` |
| `registerGraphActions` | 201-214 | `graph.open-arc-graph` |
| `registerInteractionsActions` | 219-232 | `interactions.open-studio` |
| `registerGizmosActions` | 237-250 | `gizmos.open-lab` |

**Shape used:**
```typescript
{
  id: string;           // e.g., 'assets.open-gallery'
  name: string;         // e.g., 'Open Gallery'
  description?: string;
  icon?: string;        // emoji
  shortcut?: string;    // e.g., 'Ctrl+Shift+A'
  featureId: string;    // links to parent feature
  execute: () => void;
}
```

### Pattern B: Feature-Specific Actions (Workspace)

**Location:** `apps/main/src/features/workspace/lib/capabilities.ts`

Similar pattern but lives within the feature directory, allowing access to feature-internal stores.

### Pattern C: Module-Derived Features

**Location:** `apps/main/src/app/modules/types.ts:173-221`

`registerModuleCapabilities()` derives `FeatureCapability` and `RouteCapability` from module page definitions:

```typescript
// Module page definition (lines 122-170)
page: {
  route: string;
  icon: string;
  description: string;
  category: PageCategory;
  featureId?: string;       // links page to capability system
  featurePrimary?: boolean; // marks as authoritative source
  // ...
}
```

**Key insight:** Features/routes are derived from modules, but **actions are NOT**. Actions are registered separately in `registerXActions` functions.

### Pattern D: Context Menu Actions

**Location:** `apps/main/src/lib/dockview/contextMenu/`

A separate `MenuAction` interface with different shape:

```typescript
// contextMenu/types.ts:~line 94+
interface MenuAction {
  id: string;
  label: string;           // (not 'name')
  icon?: string;
  category?: string;
  variant?: 'default' | 'danger' | 'success';
  shortcut?: string;
  divider?: boolean;
  availableIn: ContextMenuContext[];  // context filtering
  visible?: (ctx) => boolean;
  disabled?: (ctx) => boolean | string;
  children?: MenuAction[] | ((ctx) => MenuAction[]);
  execute: (ctx) => void | Promise<void>;
}
```

Registered via `contextMenuRegistry.registerAll(actions)` in `apps/main/src/lib/dockview/contextMenu/actions/index.ts`.

### Pattern E: Panel Actions

**Location:** `apps/main/src/features/panels/lib/actions.ts:20-30`

Another separate registry with yet another shape:

```typescript
interface PanelAction {
  id: string;
  label: string;         // (not 'name')
  icon: string;
  description?: string;
  face?: CubeFace;       // panel-specific: cube face placement
  shortcut?: string;
  execute: () => void | Promise<void>;
  enabled?: () => boolean;
  onError?: (error: Error) => void;
}
```

Registered via `panelActionRegistry.register(config)`.

---

## 2. Duplication / Mirroring Identified

### 2.1 Module metadata <-> Action metadata mismatch

| Concept | Module Definition | Action Registration |
|---------|------------------|---------------------|
| Name | `module.name` | `action.name` (duplicated) |
| Icon | `page.icon` | `action.icon` (duplicated) |
| Description | `page.description` | `action.description` (duplicated) |
| Feature ID | `page.featureId` | `action.featureId` (duplicated) |

**Example duplication:**

```typescript
// In module.ts (assets)
export const assetsModule: Module = {
  id: 'assets',
  name: 'Gallery',
  page: {
    icon: 'package',     // one icon
    description: 'Manage assets',
    featureId: 'assets',
  }
};

// In registerCoreFeatures.ts
store.registerAction({
  id: 'assets.open-gallery',
  name: 'Open Gallery',     // different name
  icon: '📦',               // different icon (emoji vs icon name)
  featureId: 'assets',      // same featureId
});
```

### 2.2 Multiple Action Shapes (3 registries)

| Registry | Interface | `name`/`label` | Context-aware | Has `visibility` |
|----------|-----------|----------------|---------------|------------------|
| Capability Store | `ActionCapability` | `name` | No | No |
| Context Menu | `MenuAction` | `label` | Yes (`availableIn`) | Yes (`visible`) |
| Panel Actions | `PanelAction` | `label` | No | No |

### 2.3 Routes registered twice

Routes are registered both:
1. **Implicitly** via `registerModuleCapabilities()` from module page config
2. **Explicitly** in some older code paths (e.g., `registerCompleteFeature`)

---

## 3. Proposed Target Canonical Action Shape

```typescript
interface ActionDefinition {
  // === Identity ===
  id: string;                          // Namespaced: 'feature.action-name'
  featureId: string;                   // Parent feature (required)

  // === Display ===
  title: string;                       // User-facing label (replaces name/label)
  description?: string;
  icon?: string;                       // Icon library name (not emoji)

  // === Invocation ===
  shortcut?: string;                   // Keyboard shortcut (parsed at registration)
  execute: (ctx?: ActionContext) => void | Promise<void>;

  // === Availability ===
  enabled?: () => boolean;             // Dynamic enable/disable
  visibility?: ActionVisibility;       // 'always' | 'commandPalette' | 'contextMenu' | 'hidden'
  contexts?: ContextMenuContext[];     // Where in context menus (optional)

  // === Navigation (if action navigates) ===
  route?: string;                      // If action is "go to route", declare it

  // === Validation ===
  validate?: () => string | null;      // Return error message or null

  // === Metadata for docs/app map ===
  category?: string;                   // For grouping in palette
  tags?: string[];                     // Searchability
}

type ActionVisibility = 'always' | 'commandPalette' | 'contextMenu' | 'hidden';

interface ActionContext {
  source: 'commandPalette' | 'contextMenu' | 'shortcut' | 'programmatic';
  event?: MouseEvent | KeyboardEvent;
  target?: unknown;                    // Context-specific data
}
```

**Key changes from current:**
- `title` replaces inconsistent `name`/`label`
- `featureId` is **required** (enforced)
- `visibility` replaces implicit filtering
- `contexts` merges context menu's `availableIn`
- `route` is explicit (replaces navigation-only actions that just call `navigateTo`)
- `validate` for pre-execution checks

---

## 4. Phased Refactor Plan

### Phase 0: Quick Wins (No Breaking Changes)

1. **Add `actions` field to Module interface**
   - File: `apps/main/src/app/modules/types.ts:~122`
   - Add optional `actions?: ActionDefinition[]` to page config
   - Modules can declare actions inline

2. **Update `registerModuleCapabilities` to register actions**
   - File: `apps/main/src/app/modules/types.ts:173-221`
   - If `module.page.actions` exists, register them automatically
   - Keeps backward compat: `registerXActions` still works

3. **Create adapter for icon normalization**
   - Create `apps/main/src/lib/capabilities/iconUtils.ts`
   - Convert emoji icons to icon library names at registration time

#### Phase 0 Implementation Checklist (Execution-Ready)

**Goal:** Allow module-defined actions to register automatically without breaking existing registries.

1. **Define canonical action types**
   - Add `ActionDefinition`, `ActionContext`, `ActionVisibility` to `packages/shared/types/src/actions.ts`.
   - Ensure `ActionDefinition.execute` uses `ActionContext` (no `any`).
2. **Wire module actions into registration**
   - Extend module page interface in `apps/main/src/app/modules/types.ts` with `actions?: ActionDefinition[]`.
   - In `registerModuleCapabilities`, register `page.actions` via capability store (do not remove `registerXActions`).
3. **Add adapters (no consumer changes yet)**
   - Add `toMenuAction(action: ActionDefinition)` in `apps/main/src/lib/dockview/contextMenu/`.
   - Add `toPanelAction(action: ActionDefinition, config)` in `apps/main/src/features/panels/lib/`.
   - Adapters should be used only where new module actions are adopted (opt-in).
4. **Migrate 1-2 low-risk features**
   - Move a single-action feature (ex: `automation`, `plugins`) into module-defined actions.
   - Keep existing `registerXActions` in place for others.

**Acceptance Criteria:**
- Module-defined actions appear in command palette and app map.
- No existing actions disappear or change behavior.
- Action registry types no longer use `any` for execute signatures.

#### Phase 0 Design Decisions (Lock Before Migration)

- **Icon strategy:** Decide between a single icon system or a serializable `IconRef` (recommended if auto-docs are planned).
- **Context-specific fields:** Keep canonical action shape minimal; put context menu and panel-only fields behind adapters.
- **Route actions:** Decide whether to auto-generate “Open X” actions from module pages or keep them manual.
- **Registration semantics:** Ensure `registerAction` is idempotent by `id` and can update/replace existing actions (HMR safe).
- **Payload typing:** Standardize on `unknown` + validator/schema at the registry boundary; avoid `any` for action inputs.
- **Permissions:** Apply the same feature gating rules across palette, context menu, and panels.
- **Naming conventions:** Enforce `feature.action` IDs with namespacing for plugins to avoid collisions.

### Phase 1: Migrate Actions into Modules

1. **Workspace (already feature-local)**
   - Move `registerWorkspaceActions` logic into `workspaceModule.page.actions`
   - Delete `apps/main/src/features/workspace/lib/capabilities.ts`

2. **Simple features (one action each)**
   - `automation`, `plugins`, `gizmos`, `interactions`
   - Move actions inline to module definitions
   - Delete corresponding functions from `registerCoreFeatures.ts`

3. **Complex features (multiple actions)**
   - `assets`, `generation`, `game`
   - Co-locate action definitions in feature's `module.ts`
   - Keep execute functions in separate file if complex

### Phase 2: Unify Action Shapes

1. **Create shared action type**
   - File: `packages/shared/types/src/actions.ts`
   - Export `ActionDefinition`, `ActionContext`, `ActionVisibility`

2. **Adapter for context menu**
   - Create `toMenuAction(action: ActionDefinition): MenuAction`
   - Context menu registry uses adapter internally
   - No changes to existing `MenuAction` consumers

3. **Adapter for panel actions**
   - Create `toPanelAction(action: ActionDefinition, panelConfig): PanelAction`
   - Panel-specific fields (`face`, `onError`) added at adaptation time

### Phase 3: Hybrid Registry Integration (Current Direction)

Hybrid keeps the domain registries but lets capability actions flow in:

1. **Context menu hybrid**
   - Context menu auto-includes capability actions with `contexts`
   - Local `MenuAction` registrations remain for complex menu trees
   - `registerFromDefinitions` and `registerFromCapabilities` allow opt-in reuse

2. **Panel action hybrid**
   - Panel registry remains for `face` placement + panel-specific behavior
   - Panel configs can source actions by capability ID

3. **Consumers**
   - `useCommandPalette` and app map already use capability actions
   - Context menu now queries capability actions by default

### Phase 4: Documentation & Type Safety

1. **Auto-generate action docs**
   - Extend `scripts/generate-app-map.ts` to emit action metadata
   - Output to `docs/architecture/action-registry.md`

2. **Strict typing**
   - Remove `any` from `execute: (...args: any[])` -> use `ActionContext`
   - Add Zod schema for action validation at registration

---

## 5. Type-Safety Issues

### 5.1 `any` usage in ActionCapability

**File:** `apps/main/src/lib/capabilities/index.ts:114`
```typescript
execute: (...args: any[]) => void | Promise<void>;
```
**Fix:** Use typed `ActionContext` parameter.

### 5.2 `any` in StateCapability

**File:** `apps/main/src/lib/capabilities/index.ts:138`
```typescript
getValue: () => any;
```
**Fix:** Add generic type parameter: `StateCapability<T>`.

### 5.3 Weak module type in get()

**File:** `apps/main/src/app/modules/types.ts:296-298`
```typescript
get<T extends Module>(id: string): T | undefined {
  return this.modules.get(id) as T | undefined;
}
```
**Risk:** Unchecked cast. Consider runtime validation or branded types.

### 5.4 No validation on action registration

Actions are registered without schema validation:
```typescript
store.registerAction({ /* anything goes */ });
```
**Fix:** Add Zod schema:
```typescript
const ActionSchema = z.object({
  id: z.string().regex(/^[\w-]+\.[\w-]+$/),
  title: z.string().min(1),
  featureId: z.string(),
  execute: z.function(),
  // ...
});
```

### 5.5 Loose `metadata` fields

**Files:** `FeatureCapability.metadata`, `RouteCapability.params`
```typescript
metadata?: Record<string, any>;
params?: Record<string, string>;
```
**Fix:** Define explicit metadata schemas per feature.

---

## 6. Action Metadata Consumers

| Consumer | File | Usage |
|----------|------|-------|
| **Command Palette** | `apps/main/src/lib/capabilities/index.ts:638-694` | `useCommandPalette()` converts actions to commands |
| **App Map Panel** | `apps/main/src/features/panels/components/dev/AppMapPanel.tsx:139,221-227` | Displays all actions, exports JSON |
| **Capability Search** | `apps/main/src/lib/capabilities/index.ts:529-618` | `useSearchCapabilities()` searches actions by name/desc |
| **Feature Actions Hook** | `apps/main/src/lib/capabilities/index.ts:408-412` | `useFeatureActions(featureId)` |
| **Context Menu** | `apps/main/src/lib/dockview/contextMenu/` | Separate registry, NOT integrated |
| **Panel Actions** | `apps/main/src/features/panels/lib/actions.ts` | Separate registry, NOT integrated |
| **Telemetry** | `apps/main/src/lib/capabilities/index.ts:276` | `logEvent('DEBUG', 'capability_action_registered', ...)` |
| **Permission Filter** | `apps/main/src/lib/capabilities/index.ts:755-779` | `useAllowedActions()` filters by feature permissions |
| **Capability Testing Panel** | `apps/main/src/features/panels/components/dev/CapabilityTestingPanel.tsx` | Testing UI for actions |
| **Shortcut Display** | `apps/main/src/features/controlCenter/components/ShortcutsModule.tsx` | Hardcoded, should use registry |

---

## 7. Risks / Open Questions

### Risks

1. **Context menu relies on different shape** - Need adapter or migration path
2. **Panel actions have `face` field** - Domain-specific, can't fully unify
3. **Some actions have complex execute logic** - May need to keep separate handler files
4. **Hot-reload during migration** - Test idempotent registration carefully

### Open Questions

1. **Should `route` be first-class?** Many actions just navigate. Could auto-generate "Open X" actions from module routes.

2. **How to handle context-menu-only actions?** Some actions only make sense in context menus (e.g., "Close Panel"). Use `visibility: 'contextMenu'` or separate registry?

3. **Keyboard shortcuts live where?** Currently in action definition. Consider separate keybinding config for user customization.

4. **Plugin actions prefix** - `pluginAdapter.ts` adds `plugin.{id}.` prefix. Keep this pattern or let plugins choose their own namespace?

---

## 8. Summary

| Area | Current State | Target State |
|------|---------------|--------------|
| **Action source** | 3 registries + imperative functions | Module definitions |
| **Action shape** | 3 different interfaces | Single `ActionDefinition` |
| **Feature derivation** | Modules -> features | Modules -> features + actions |
| **Duplication** | name/icon/desc repeated | Single source in module |
| **Type safety** | Many `any` | Typed `ActionContext` + Zod |
| **Consumers** | Some use capability store | All use capability store |

---

## Related Documents

- [2024-12-24-panel-dockview-capabilities-review.md](./2024-12-24-panel-dockview-capabilities-review.md) - Previous capabilities review
- `docs/reference/CAPABILITY_HOOKS.md` - Hook API reference
- `apps/main/src/lib/capabilities/README.md` - Capabilities system docs
