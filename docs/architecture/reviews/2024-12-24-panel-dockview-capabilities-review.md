# Panel/Dockview & Capabilities System Architecture Review

**Date:** 2024-12-24
**Reviewers:** Claude (Opus 4.5), GPT-4 (secondary review)
**Scope:** Panel system, Dockview integration, and cross-panel capabilities

## Files Reviewed

- `apps/main/src/lib/dockview/SmartDockview.tsx`
- `apps/main/src/features/workspace/components/DockviewWorkspace.tsx`
- `apps/main/src/features/panels/lib/panelSettingsScopes.ts`
- `apps/main/src/features/panels/lib/panelRegistry.ts`
- `apps/main/src/features/panels/lib/helperPanelsPlugin.tsx`
- `apps/main/src/features/generation/lib/registerGenerationScopes.tsx`
- `apps/main/src/features/panels/components/helpers/QuickGeneratePanel.tsx`
- `apps/main/src/components/media/ViewerQuickGenerate.tsx`
- `apps/main/src/features/controlCenter/components/QuickGeneratePanels.tsx`
- `apps/main/src/lib/dockview/contextMenu/PanelPropertiesPopup.tsx`
- `apps/main/src/features/settings/components/PanelCentricSettings.tsx`
- `apps/main/src/features/contextHub/*` (registry, hooks, types, components)

---

## 1. Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  SmartDockview.tsx                                                               │
│  ├── Panel resolution (scope/panels props → PanelDefinition[])                  │
│  ├── Context menu integration                                                   │
│  ├── Layout persistence (localStorage)                                          │
│  ├── Tab visibility management                                                  │
│  └── ScopeHost (automatic scope provider wrapping)                              │
└─────────────────────────────────────────────────────────────────────────────────┘
         │                              │                              │
         ▼                              ▼                              ▼
┌─────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐
│  panelRegistry  │    │  panelSettingsScopeRegistry │  │     ContextHub           │
│  (definitions)  │    │  (scope definitions)       │  │  (capability bus)        │
├─────────────────┤    ├──────────────────────────┤    ├──────────────────────────┤
│ - id, title,    │    │ - id, label, defaultMode │    │ - CapabilityProvider<T>  │
│   component     │    │ - shouldApply(ctx)       │    │ - useProvideCapability   │
│ - category, tags│    │ - renderProvider(id, ch) │    │ - useCapability          │
│ - availableIn[] │    │ - resolveScopeId(...)    │    │ - ContextHubHost         │
│ - scopes[]      │    └──────────────────────────┘    └──────────────────────────┘
│ - settingsForm  │                │                              │
│ - defaultSettings│               │ wraps panels                 │ cross-panel
└─────────────────┘                ▼                              │ communication
         │                ┌──────────────────┐                    │
         │                │ GenerationScope  │◄───────────────────┘
         ▼                │ Provider         │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PANEL COMPONENTS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  QuickGeneratePanel, AssetPanel, PromptPanel, SettingsPanel, BlocksPanel, etc. │
│  ├── Receive context via props or useCapability()                               │
│  └── Provide capabilities via useProvideCapability()                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Core Responsibilities

| Component | Primary Responsibility | Secondary |
|-----------|----------------------|-----------|
| **SmartDockview** | Dockview lifecycle, layout, scope wrapping | Context menu, panel resolution |
| **panelRegistry** | Panel definition storage & lookup | Category/tag queries, search |
| **panelSettingsScopeRegistry** | Scope definition (global/dock/local) | Provider wrapping logic |
| **ContextHub** | Cross-panel capability bus | Provider prioritization, consumption tracking |
| **PanelCentricSettings** | Settings UI for panels & instances | Scope mode selection |

---

## 2. Top 5 Risks/Issues (Ordered by Severity)

### 🔴 **1. Three Competing Context Systems**
**Severity: High** | **Files:** Multiple

Currently there are three ways panels communicate:
1. **SmartDockview `context` prop** - Props drilled via `contextRef.current`
2. **ContextHub capabilities** - `useProvideCapability` / `useCapability`
3. **Legacy capabilityStore** - `@lib/capabilities` bridged via `ContextHubCapabilityBridge`

QuickGeneratePanels.tsx:347-386 shows the awkward fallback chain:
```typescript
const { prompt = controller.prompt } = ctx || {};  // Falls back to controller
```

**Impact:** Panel authors must understand all three systems. New panels often wire up redundant data paths.

---

### 🟠 **2. "scope" Overloaded Terminology**
**Severity: Medium** | **Files:** `SmartDockview.tsx`, `panelSettingsScopes.ts`, `panelRegistry.ts`

The word "scope" means three different things:
- `SmartDockview.scope` → Dockview *availability* filter (which panels appear)
- `PanelDefinition.scopes[]` → Which *setting scopes* apply (generation, etc.)
- `PanelSettingsScopeMode` → The *isolation level* (global/dock/local)

This causes confusion when debugging and when onboarding new developers.

---

### 🟠 **3. LocalPanelRegistry vs Global panelRegistry Duality**
**Severity: Medium** | **Files:** `SmartDockview.tsx:174-196`, `ViewerQuickGenerate.tsx:328`

Some dockviews (e.g., ViewerQuickGenerate) use `createLocalPanelRegistry()` with custom panel definitions, while others use the global `panelRegistry`. SmartDockview handles both via type guards but the API is confusing:

```typescript
// Local registry (legacy)
<SmartDockview registry={viewerQuickGenRegistry} defaultLayout={...} />

// Global registry (new)
<SmartDockview scope="control-center" panels={['quickgen-asset']} />
```

**Impact:** Two mental models for panel registration; local registries don't participate in PanelCentricSettings.

**Note (GPT):** Local registries are still valuable for small, embedded dockviews. Full deprecation may be too aggressive.

---

### 🟡 **4. Panel Instance ID Resolution Lives Only in SmartDockview**
**Severity: Medium-Low** | **Files:** `SmartDockview.tsx:221-223`, `QuickGeneratePanels.tsx:354-355`

The `resolvePanelInstanceId(dockviewId, panelId)` function is defined inline in SmartDockview. Panels that need instance IDs must manually compose them or use `getInstanceId` from various places.

Note: `resolveScopeInstanceId` is correctly centralized in `panelSettingsScopes.ts` and SmartDockview calls into it—no duplication there.

**Impact:** Inconsistent instance IDs when panels compose them differently.

---

### 🟡 **5. ScopeHost Embedded in SmartDockview (~100 lines)**
**Severity: Low** | **Files:** `SmartDockview.tsx:440-506`

The `ScopeHost` callback component is defined inside `SmartDockview`. While this looks like tight coupling, new scopes are already registry-driven via `panelSettingsScopeRegistry`—SmartDockview doesn't need edits to add a new scope.

**Note (GPT):** This is more about code organization than actual coupling. Extracting it is good cleanup but not high-severity.

**Impact:** SmartDockview is large (~1000 lines); extraction would improve readability.

---

## 3. Concrete Improvements

### **Improvement 1: Auto-Provide Panel Context Capability**

**Goal:** Converge `context` prop and ContextHub without forcing everything onto capabilities.

The `context` prop is valuable for cheap, local, ephemeral data. Rather than deprecating it, SmartDockview should auto-provide a `CAP_PANEL_CONTEXT` capability that wraps whatever `context` prop is passed.

**Contract:**
```typescript
// SmartDockview automatically does:
useProvideCapability(CAP_PANEL_CONTEXT, {
  id: `panel-context:${instanceId}`,
  getValue: () => contextRef.current,
}, [context]);

// Panels can consume either way:
const ctx = props.context;                           // Direct prop
const { value } = useCapability(CAP_PANEL_CONTEXT);  // Via capability
```

**Touch points:**
- `SmartDockview.tsx` - Add auto-provide logic in panel wrapper
- Define `CAP_PANEL_CONTEXT` in `contextHub/capabilities.ts`
- Gradually migrate panels to prefer capability access

---

### **Improvement 2: Rename/Clarify Scope Terminology**

| Current | Proposed | Meaning |
|---------|----------|---------|
| `SmartDockview.scope` | `dockId` or `availabilityScope` | Which dockview this is |
| `PanelDefinition.scopes[]` | `settingScopes[]` | Which setting scopes panel uses |
| `PanelSettingsScopeMode` | `SettingsIsolationLevel` | global/dock/local |

**Touch points:**
- `panelRegistry.ts` - Add alias `settingScopes` with deprecation on `scopes`
- `SmartDockview.tsx` - Add alias `dockId` with deprecation on `scope`
- `panelSettingsScopes.ts` - Rename types
- TypeScript types updated with `@deprecated` JSDoc

---

### **Improvement 3: Extract resolvePanelInstanceId to Shared Module**

Create a single source of truth for panel instance ID resolution:

**File:** `apps/main/src/features/panels/lib/instanceId.ts`

```typescript
export interface InstanceIdContext {
  dockviewId: string;
  panelId: string;
  dockviewPanelApiId?: string;
}

export function resolvePanelInstanceId(ctx: InstanceIdContext): string {
  return `${ctx.dockviewId}:${ctx.dockviewPanelApiId ?? ctx.panelId}`;
}
```

**Touch points:**
- Extract from `SmartDockview.tsx:221-223`
- Update all consumers (grep for manual `${dockviewId}:${panelId}` compositions)
- Export from `@features/panels`

Note: `resolveScopeInstanceId` already lives in `panelSettingsScopes.ts` and should stay there.

---

### **Improvement 4: Local Registry + Global Metadata Adapter**

**Goal:** Keep local registries for small embedded dockviews, but allow them to optionally expose metadata to PanelCentricSettings.

**Option A - Adapter pattern:**
```typescript
// Local registry with global metadata bridge
const viewerQuickGenRegistry = createLocalPanelRegistry<ViewerQuickGenPanelId>({
  exposeToGlobalSettings: true,  // Registers metadata (not components) globally
});
```

**Option B - Migrate selectively:**
Only migrate local registries that need settings/capabilities integration. Keep simple embedded dockviews as-is.

**Touch points:**
- `LocalPanelRegistry.ts` - Add optional `exposeToGlobalSettings` flag
- `PanelCentricSettings.tsx` - Query both global and exposed local panels

---

### **Improvement 5: Extract ScopeHost to Standalone Component**

**Goal:** Improve SmartDockview readability (organization, not coupling fix).

**Touch points:**
- Create `apps/main/src/features/panels/lib/ScopeHost.tsx`
- Move lines 440-506 from SmartDockview.tsx
- Export from `@features/panels`
- Update SmartDockview to import and use `<ScopeHost />`

**Contract:**
```typescript
interface ScopeHostProps {
  panelId: string;
  instanceId: string;
  dockviewId?: string;
  declaredScopes?: string[];
  fallbackScopes?: string[];
  tags?: string[];
  category?: string;
  children: ReactNode;
}
```

---

## 4. Phased Refactor Plan

### **Phase 1: Terminology & Organization (Low Risk)**
*Reduces confusion without breaking changes*

1. Add `dockId` as alias for `scope` on SmartDockview (deprecate `scope`)
2. Add `settingScopes` as alias for `scopes` on PanelDefinition (deprecate `scopes`)
3. Extract `resolvePanelInstanceId` to `instanceId.ts`
4. Extract `ScopeHost` to separate file (no behavior change)
5. Add JSDoc deprecation warnings

**Files touched:** 4-5 | **Risk:** Minimal (aliases preserve compatibility)

---

### **Phase 2: Context Convergence (Medium Risk)**
*Unifies context prop and ContextHub*

1. Define `CAP_PANEL_CONTEXT` capability
2. SmartDockview auto-provides panel context as capability
3. Update panels to prefer `useCapability(CAP_PANEL_CONTEXT)` over `props.context`
4. Keep `context` prop for backwards compatibility (don't remove)
5. Remove `ContextHubCapabilityBridge` once legacy `@lib/capabilities` is fully migrated

**Files touched:** 8-12 | **Risk:** Medium (requires testing all dockviews)

---

### **Phase 3: Selective Local Registry Migration (Medium Risk)**
*Improves settings integration without breaking embedded dockviews*

1. Add `exposeToGlobalSettings` option to `createLocalPanelRegistry()`
2. Migrate ViewerQuickGenerate panels to global registry (they need settings)
3. Keep truly-local dockviews (no settings needs) using local registries
4. Update PanelCentricSettings to show exposed local panels

**Files touched:** 5-8 | **Risk:** Medium (layout persistence may need migration)

---

## 5. Naming Inconsistencies

| Location | Issue | Fix |
|----------|-------|-----|
| `panelSettingsScopes.ts` | `PanelSettingsScopeMode` vs `SettingGroup` | Unify to `SettingsIsolationLevel` |
| `panelRegistry.ts:119` | `PanelDefinition<TSettings>` generic often unused | Consider removing generic or enforcing |
| `QuickGeneratePanels.tsx` | `ctx || {}` patterns | Use nullish coalescing `??` |
| `SmartDockview.tsx` | `panelManagerId` vs `dockviewHostId` | Consolidate to `dockId` |
| API responses | `snake_case` backend vs `camelCase` frontend | Already addressed by `GenerationModel` |

---

## Summary

The architecture is functional but suffers from:
1. **Overloaded terminology** ("scope" means 3 things)
2. **Triple context systems** (props, ContextHub, legacy capabilities)
3. **Dual registration paths** (local vs global registries)
4. **Minor fragmentation** (instance ID resolution, ScopeHost placement)

The proposed improvements prioritize:
- **Phase 1:** Safe renames and extractions (no behavior change)
- **Phase 2:** Converge context prop and ContextHub (auto-provide capability)
- **Phase 3:** Selective local registry migration (preserve valid use cases)

This positions the codebase for cleaner addition of new panels (workspaces, asset views) without bespoke hacks, while respecting the value of simpler patterns for embedded dockviews.

---

## Appendix: Current SmartDockview Usage

| Component | API Style | Key Props | Status |
|-----------|-----------|-----------|--------|
| `DockviewWorkspace` | ✅ New (scope) | `scope="workspace"` | Already aligned |
| `ControlCenterDock` | ✅ New (panels) | `panels={panelIds}` | Already aligned |
| `QuickGenerateDockview` | ✅ New (panels) | `panels={panelIds}` | Already aligned |
| `AssetViewerDockview` | ✅ New (panels) | `panels={...}`, `context={...}` | Phase 2 target (auto-provide context) |
| `ViewerQuickGenerate` | ❌ Legacy | `registry={...}`, `context={...}` | Phase 3 target (migrate to global) |

### Workspace Alignment

The main workspace (`DockviewWorkspace`) is **already aligned** with all recommendations:
- Uses `scope="workspace"` (new API)
- No `context` prop (panels use ContextHub capabilities)
- All workspace panels register globally via `panelRegistry`
- ScopeHost, instance ID, and terminology changes are non-breaking

**Primary migration targets:**
1. `ViewerQuickGenerate` - Only remaining legacy `registry` user
2. `AssetViewerDockview` - Uses `context` prop (but new panel-based API)

---

## Implementation Status

### Phase 1: Terminology & Organization ✅ COMPLETE

| Task | Status | Files Changed |
|------|--------|---------------|
| Extract `resolvePanelInstanceId` | ✅ | `SmartDockview.tsx` - now uses `getInstanceId` from `@features/panels` |
| Extract `ScopeHost` | ✅ | New `ScopeHost.tsx` in `@features/panels/lib/` |
| Add `dockId` alias for `scope` | ✅ | `SmartDockview.tsx` - `scope` marked `@deprecated` |
| Add `settingScopes` alias for `scopes` | ✅ | `panelTypes.ts` - `scopes` marked `@deprecated` |

### Phase 2: Context Convergence ✅ COMPLETE

| Task | Status | Files Changed |
|------|--------|---------------|
| Define `CAP_PANEL_CONTEXT` | ✅ | `capabilityKeys.ts`, `capabilities.ts` |
| Auto-provide context capability | ✅ | `SmartDockview.tsx` - `PanelContextProvider` component |
| Create `usePanelContext` hook | ✅ | `hooks.ts` - convenience hook for consumption |

**Usage:**

```typescript
// SmartDockview automatically provides context as capability
<SmartDockview context={quickGenContext} ... />

// Panels can now consume via hook (preferred)
import { usePanelContext } from '@features/contextHub';
const context = usePanelContext<QuickGenPanelContext>();

// Or via props (still supported)
const context = props.context;
```

---

## Revision History

| Date | Reviewer | Changes |
|------|----------|---------|
| 2024-12-24 | Claude (Opus 4.5) | Initial review |
| 2024-12-24 | GPT-4 | Corrections: ScopeHost severity downgraded; instance ID duplication clarified; context prop preserved; local registry deprecation softened |
| 2024-12-24 | Claude (Opus 4.5) | Added appendix with SmartDockview usage audit; confirmed workspace alignment |
| 2024-12-24 | Claude (Opus 4.5) | Implemented Phase 1 & Phase 2; added implementation status section |
