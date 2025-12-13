# PixSim7 Frontend Architecture Analysis

**Snapshot Date:** 2025-12-13
**Status:** 📊 **Architecture Audit** - Import patterns and module structure analysis
**Context:** Comprehensive refactoring of import paths revealed architectural patterns

---

## 🎯 Executive Summary

Following a comprehensive import path refactoring that fixed **80+ broken imports** across **80+ files**, this document captures the architectural state of the frontend codebase. The analysis reveals a **well-structured modular architecture** with 100% barrel export coverage, but identifies opportunities for better import consistency and feature boundary improvements.

**Key Metrics:**
- ✅ 17 features with full barrel exports
- ✅ 25 lib modules with full barrel exports
- ⚠️ 598 generic `@/` imports (should use specific aliases)
- ⚠️ 100+ deep imports bypassing barrel exports
- ⚠️ 28+ registries with inconsistent patterns

---

## 📁 Module Structure Overview

### Feature Modules (`apps/main/src/features/`)

**All 17 features have standardized structure:**

```
@features/<name>/
  components/        # React components
  hooks/            # React hooks (optional)
  stores/           # Zustand stores (optional)
  lib/              # Business logic
    core/           # Core types & utilities
      types.ts
      registry.ts   # Feature-specific registry (if applicable)
      index.ts      # Barrel export
    api/            # API wrappers (optional)
  index.ts          # Feature barrel export
```

**Features with lib/core structure (15/17):**
- automation, brainTools, controlCenter, gallery, generation
- gizmos, graph, hud, intimacy, prompts, providers
- settings, simulation, worldTools, assets

**Features without lib directories (2/17):**
- ❌ interactions (only components)
- ❌ scene (only components)

### Lib Modules (`apps/main/src/lib/`)

**25 lib modules, all with barrel exports:**

**Core Infrastructure:**
- `@lib/core` - BaseRegistry, core types
- `@lib/api` - Backend API client & endpoints
- `@lib/utils` - Shared utilities (logging, time, polling, validation)
- `@lib/hooks` - Shared React hooks

**Domain-Specific:**
- `@lib/panels` - Panel registry & management
- `@lib/plugins` - Plugin system & discovery
- `@lib/game` - Game runtime & interactions
- `@lib/widgets` - Widget registry
- `@lib/shapes` - Shape definitions
- `@lib/theming` - Theme system

**Plus 15 more specialized modules:** analyzers, auth, capabilities, console, context, dataBinding, devtools, display, editing-core, gating, gameplay-ui-core, models, overlay, preview-bridge, registries

---

## 🔗 Import Alias System

### ⚠️ Import Rules (Enforced via ESLint)

**Three cardinal rules for all imports:**

1. **✅ Use `@features/*` for ALL feature imports**
   - ❌ Never: `import { X } from '@/features/controlCenter'`
   - ✅ Always: `import { X } from '@features/controlCenter'`

2. **✅ Use `@lib/*` for ALL lib module imports**
   - ❌ Never: `import { apiClient } from '@/lib/api'`
   - ✅ Always: `import { apiClient } from '@lib/api'`

3. **✅ Use `@/` ONLY for root-level directories**
   - ✅ Allowed: `@/components/*`, `@/stores/*`, `@/types/*`, `@/utils/*`
   - ❌ Forbidden: `@/features/*`, `@/lib/*`

**Relative imports (`../`) are acceptable ONLY within the same feature/lib module.**

---

### Defined Aliases (vite.config.ts)

**Domain-Specific Aliases:**
```typescript
@/gizmos     → ./src/features/gizmos/lib/core
@/types      → ./src/types
@/narrative  → ../../packages/game/engine/src/narrative
@/scene      → ../../packages/game/engine/src/narrative
@shared/types → ../../packages/shared/types/src
```

**Lib Module Aliases (25 defined):**
```typescript
@lib/core, @lib/api, @lib/utils, @lib/hooks, @lib/panels
@lib/plugins, @lib/game, @lib/shapes, @lib/widgets, ...
```

**Feature Module Aliases (17 defined):**
```typescript
@features/automation, @features/controlCenter, @features/gallery
@features/generation, @features/gizmos, @features/graph
@features/hud, @features/providers, @features/settings, ...
```

**Generic Fallback:**
```typescript
@ → ./src (catch-all, should be least used)
```

### Actual Usage Statistics

| Alias Pattern | Files | Occurrences | Should Be |
|--------------|-------|-------------|-----------|
| `@/` (generic) | 316 | 598 | Minimize - use specific aliases |
| `../` (relative) | 436 | 942 | ✅ OK for internal imports |
| `@features/` | 154 | 272 | ✅ Good - should increase |
| `@lib/` | 38 | 44 | ✅ Good for lib→lib |

**Problem:** Despite having 42+ specific aliases, the generic `@/` is overused (598 occurrences).

---

## 🎨 Import Pattern Issues & Recommendations

### Issue 1: Inconsistent Alias Usage

**Current Problem:**
```typescript
// ❌ Both patterns exist in codebase
import { ControlCenterDock } from '@/features/controlCenter/components/ControlCenterDock';
import { HudEditor } from '@features/hud/components/editor/HudEditor';

// Even worse - mix in same file
import { settingsRegistry } from '@features/settings';
import { GenerationStatusDisplay } from '@/features/controlCenter/components/GenerationStatusDisplay';
```

**Recommendation:**
```typescript
// ✅ Enforce @features/* for all feature imports
import { ControlCenterDock } from '@features/controlCenter';
import { HudEditor } from '@features/hud';
import { settingsRegistry } from '@features/settings';

// ✅ Enforce @lib/* for all lib imports
import { apiClient } from '@lib/api';
import { useKeyboardShortcuts } from '@lib/hooks';

// ✅ Reserve @/ only for: components/, stores/, types/, utils/ at root
import { MediaCard } from '@/components/media/MediaCard';
import { authStore } from '@/stores/authStore';
```

**Implementation:**
```javascript
// Add to .eslintrc.js
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["@/features/*"],
          "message": "Use @features/* instead of @/features/*"
        },
        {
          "group": ["@/lib/*"],
          "message": "Use @lib/* instead of @/lib/*"
        }
      ]
    }]
  }
}
```

### Issue 2: Deep Imports Bypass Barrel Exports

**Problem:** 100+ occurrences of deep imports despite 100% barrel export coverage

```typescript
// ❌ Bypassing barrel exports
import { buildHudLayout } from '@features/worldTools/lib/hudLayout';
import { getStatusConfig } from '@features/generation/lib/core/generationStatusConfig';
import { automationService } from '@features/automation/lib/core/automationService';
import { gizmoSurfaceRegistry } from '@features/gizmos/lib/core/surfaceRegistry';
```

**Two Solutions:**

**Option A: Expand barrel exports for commonly imported modules**
```typescript
// features/worldTools/index.ts
export { buildHudLayout, getHudConfig } from './lib/hudLayout';
export { hudProfiles, hudPresets } from './lib/hudProfiles';

// Now can import:
import { buildHudLayout } from '@features/worldTools';
```

**Option B: Mark as internal (private API)**
```typescript
// Move to _internal/ to signal not part of public API
features/worldTools/
  lib/
    _internal/
      hudLayout.ts  // Not exported from barrel
    index.ts
```

**Recommendation:** Use Option A for commonly imported modules, Option B for feature internals.

#### Must-Fix Deep Imports (Priority List)

These 10 deep imports occur most frequently and should be fixed in Phase 2:

| Deep Import Path | Occurrences | Fix Strategy | New Import |
|------------------|-------------|--------------|------------|
| `@features/worldTools/lib/hudLayout` | 8 files | Expand barrel | `@features/worldTools` |
| `@features/generation/lib/core/generationStatusConfig` | 6 files | Expand barrel | `@features/generation` |
| `@features/automation/lib/core/automationService` | 5 files | Expand barrel or mark internal | `@features/automation` |
| `@features/gizmos/lib/core/surfaceRegistry` | 4 files | Expand barrel | `@features/gizmos` |
| `@features/gallery/lib/core/assetRoles` | 3 files | Expand barrel | `@features/gallery` |
| `@features/graph/lib/editor/nodeRendererRegistry` | 3 files | Mark as internal | Keep deep (editor internals) |
| `@features/providers/lib/core/capabilityRegistry` | 3 files | Already in barrel | Use `@features/providers` |
| `@features/simulation/lib/core/constraints` | 2 files | Expand barrel | `@features/simulation` |
| `@features/hud/lib/core/types` | 2 files | Expand barrel | `@features/hud` |
| `@features/settings/lib/core/settingsSchemaRegistry` | 2 files | Already in barrel | Use `@features/settings` |

**Total files affected:** ~40 files (estimate based on frequency)

**Action Items:**
1. Add 7 exports to feature barrel files (15 min)
2. Update ~40 import statements (30 min with find-replace)
3. Mark 1 module as internal (`_internal/nodeRendererRegistry`)

### Issue 3: Feature Coupling

**Identified coupling patterns:**

**1. controlCenter ↔ generation**
```typescript
// generation feature imports UI from controlCenter
import { GenerationSettingsBar } from '@features/controlCenter/components/GenerationSettingsBar';
import { GenerationStatusDisplay } from '@features/controlCenter/components/GenerationStatusDisplay';

// These are generation-specific but live in controlCenter
```

**Recommendation:** Extract to `@lib/generation-ui`
```typescript
// Create new lib module
@lib/generation-ui/
  components/
    GenerationSettingsBar.tsx
    GenerationStatusDisplay.tsx
  index.ts

// Both features import from shared lib
import { GenerationSettingsBar } from '@lib/generation-ui';
```

**2. hud ↔ worldTools**
```typescript
// HUD feature depends heavily on worldTools
import { buildHudLayout, getHudConfig } from '@features/worldTools/lib/hudLayout';
import { hudProfiles, hudPresets } from '@features/worldTools/lib/...';
```

**Recommendation:** Merge into single `@features/hud` feature
- HUD system should be unified under one feature
- worldTools can remain for non-HUD world management tools

**3. gallery ↔ assets**
```typescript
// Asset management responsibilities overlap
import { assetRoles } from '@features/gallery/lib/core/assetRoles';
import { assetSelectionStore } from '@features/assets/stores/assetSelectionStore';
```

**Recommendation:** Clarify ownership
- `@features/assets` - Asset CRUD, storage, upload
- `@features/gallery` - Gallery UI, filtering, display
- Or consider merging if boundaries remain unclear

### Feature Ownership Clarity

**Clear ownership prevents future coupling.** For the three blurry areas identified above:

| Feature Area | Primary Owner | Responsibilities | Secondary Owner | Responsibilities |
|--------------|---------------|------------------|-----------------|------------------|
| **Generation UI** | `@lib/generation-ui` (new) | Shared UI components (SettingsBar, StatusDisplay) | `@features/generation` | Generation logic & workflows |
| **HUD System** | `@features/hud` | HUD layouts, profiles, presets, rendering | `@features/worldTools` | Non-HUD world management tools |
| **Asset Management** | `@features/assets` | Asset CRUD, storage, upload, API integration | `@features/gallery` | Gallery UI, filtering, display, badges |

**Decision Rules for Future Code:**

**Q: Where does generation UI code go?**
- ✅ Shared UI components → `@lib/generation-ui`
- ✅ Generation-specific logic → `@features/generation`
- ❌ Never put generation logic in `@features/controlCenter`

**Q: Where does HUD code go?**
- ✅ HUD layouts, profiles, configs → `@features/hud/lib/hudLayout`
- ✅ World context (non-HUD) → `@features/worldTools`
- ❌ Never split HUD concerns across features

**Q: Where does asset code go?**
- ✅ Asset CRUD, backend API → `@features/assets`
- ✅ Gallery presentation, filters → `@features/gallery`
- ✅ Asset roles & types → `@features/gallery/lib/core/assetRoles` (domain model)
- ❌ Never duplicate asset logic across features

---

## 📊 Registry Pattern Analysis

### Current State: 28+ Registries

**Three different implementation patterns:**

**Pattern 1: BaseRegistry Extension** (Most consistent)
```typescript
// Example: controlCenterModuleRegistry.ts
class ControlCenterModuleRegistry extends BaseRegistry<ControlCenterModule> {
  // Feature-specific methods
}
export const controlCenterModuleRegistry = new ControlCenterModuleRegistry();
```

**Pattern 2: Auto-Registration**
```typescript
// Example: brainTools/lib/registry.ts
import { brainToolRegistry } from './types';
import { builtInBrainTools } from '../plugins';

builtInBrainTools.forEach(tool => {
  brainToolRegistry.register(tool);
});
```

**Pattern 3: Manual Singleton**
```typescript
// Example: shapes/registry.ts
class ShapeRegistryClass {
  private shapes: Map<string, SemanticShape> = new Map();
  constructor() {
    this.register(brainShape);
    this.register(portalShape);
  }
}
export const ShapeRegistry = new ShapeRegistryClass();
```

**Registry Distribution:**

**Centralized** (`@/lib/registries.ts`):
- sessionHelperRegistry
- interactionRegistry
- nodeTypeRegistry

**Distributed** (feature-owned): 25+ registries
- gizmos: 6 registries (surfaceRegistry + 5 specialized)
- graph: 2 registries (editorRegistry, nodeRendererRegistry)
- automation: automationService (service pattern)
- settings: 2 registries (settingsRegistry, settingsSchemaRegistry)
- And 15+ more across other features

**Recommendation:** Standardize on BaseRegistry pattern

**📖 Reference:** See `apps/main/src/lib/core/BaseRegistry.ts` for the standard registry base class.

BaseRegistry provides:
- ✅ CRUD operations (`register`, `unregister`, `get`, `getAll`, `has`, `clear`)
- ✅ Listener/subscription support (`subscribe`, `notifyListeners`)
- ✅ Duplicate ID handling with configurable policies
- ✅ Consistent interface across all registries

**Migration Example:**
```typescript
// Before: Custom implementation
class ShapeRegistryClass {
  private shapes: Map<string, SemanticShape> = new Map();
  register(shape: SemanticShape) { /* custom logic */ }
  get(id: string) { /* custom logic */ }
}

// After: Extend BaseRegistry
import { BaseRegistry } from '@lib/core';

class ShapeRegistry extends BaseRegistry<SemanticShape> {
  // Inherits: register(), get(), getAll(), has(), clear(), subscribe()
  // Add only feature-specific methods:
  getByCategory(category: string): SemanticShape[] {
    return this.getAll().filter(s => s.category === category);
  }
}

export const shapeRegistry = new ShapeRegistry();
```

**Action:** Migrate all 28+ registries to extend `BaseRegistry` for consistency (see Phase 4 below).

---

## 🏗️ Module Structure Standards

### Standard Feature Structure

```typescript
@features/<name>/
  components/           # React components (can have subdirs)
    panels/            # Panel components
    editor/            # Editor components
    <ComponentName>.tsx

  hooks/               # React hooks (optional)
    use<Name>.ts

  stores/              # Zustand stores (optional)
    <name>Store.ts

  lib/                 # Business logic, registries, types
    core/              # Core types & utilities
      types.ts         # Type definitions
      registry.ts      # Registry (if applicable)
      <utilities>.ts   # Business logic
      index.ts         # Barrel export

    api/               # API wrappers (optional)
      <endpoints>.ts

    plugins/           # Plugin definitions (optional)

  types.ts             # Public types (optional, can be in lib/core)
  index.ts             # Feature barrel export (REQUIRED)
```

### Standard Lib Module Structure

```typescript
@lib/<name>/
  types.ts             # Type definitions
  <implementation>.ts  # Implementation files
  index.ts             # Barrel export (REQUIRED)
```

### Barrel Export Best Practices

**Explicit Named Exports** (recommended for public API):
```typescript
// features/settings/index.ts
export { SettingsPanel } from './components/SettingsPanel';
export { MediaCardConfigPage } from './components/MediaCardConfigPage';
export { useSettingsStore } from './stores/settingsStore';
export { settingsRegistry } from './lib/core/registry';
export { settingsSchemaRegistry } from './lib/core/settingsSchemaRegistry';
export type { SettingTab, SettingField } from './lib/core/types';
```

**Wildcard Re-exports** (acceptable for simple modules):
```typescript
// features/gizmos/index.ts
export * from './lib/core';
```

**Hybrid Approach** (balance):
```typescript
// features/automation/index.ts
export { AutomationPanel } from './components/AutomationPanel';
export * from './lib/core';
export { automationService } from './lib/core/automationService';
```

---

## 🔄 Migration Action Plan

### Phase 1: Import Standardization (Low Risk)
**Goal:** Enforce consistent import aliases
**Time:** 1-2 hours

**Tasks:**
1. ✅ Add ESLint rules to enforce `@features/*` and `@lib/*` patterns
2. ✅ Create codemod script: `@/features/*` → `@features/*`
3. ✅ Create codemod script: `@/lib/*` → `@lib/*`
4. ✅ Run codemods across codebase
5. ✅ Verify with `npm run lint`

**ESLint Configuration:**
```javascript
// .eslintrc.js
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["@/features/*"],
          "message": "Use @features/* instead of @/features/*"
        },
        {
          "group": ["@/lib/*"],
          "message": "Use @lib/* instead of @/lib/*"
        }
      ]
    }]
  }
}
```

### Phase 2: Barrel Export Enhancement (Low Risk)
**Goal:** Reduce deep imports to 0
**Time:** 2-4 hours

**Tasks:**
1. ✅ Audit all 100+ deep imports
2. ✅ Identify commonly imported modules
3. ✅ Expand barrel exports for these modules
4. ✅ Update imports to use barrel exports
5. ✅ Move truly internal modules to `_internal/`

**Example:**
```typescript
// Before
import { buildHudLayout } from '@features/worldTools/lib/hudLayout';

// After (expand barrel)
// features/worldTools/index.ts
export { buildHudLayout, getHudConfig } from './lib/hudLayout';

// Import
import { buildHudLayout } from '@features/worldTools';
```

### Phase 3: Feature Restructuring (Medium Risk)
**Goal:** Improve feature boundaries
**Time:** 1-2 days

**Tasks:**
1. ✅ Extract `@lib/generation-ui` from controlCenter
2. ✅ Evaluate hud + worldTools merger
3. ✅ Clarify gallery vs assets ownership
4. ✅ Add lib/core to interactions & scene features

**Example: Extract generation-ui**
```bash
# Create new lib module
mkdir -p apps/main/src/lib/generation-ui/components

# Move generation-specific UI from controlCenter
mv apps/main/src/features/controlCenter/components/GenerationSettingsBar.tsx \
   apps/main/src/lib/generation-ui/components/

mv apps/main/src/features/controlCenter/components/GenerationStatusDisplay.tsx \
   apps/main/src/lib/generation-ui/components/

# Create barrel export
cat > apps/main/src/lib/generation-ui/index.ts << 'EOF'
export { GenerationSettingsBar } from './components/GenerationSettingsBar';
export { GenerationStatusDisplay } from './components/GenerationStatusDisplay';
EOF

# Update imports in both features
# controlCenter: import { GenerationSettingsBar } from '@lib/generation-ui';
# generation: import { GenerationStatusDisplay } from '@lib/generation-ui';
```

### Phase 4: Registry Standardization (Medium Risk)
**Goal:** All registries extend BaseRegistry
**Time:** 1 day

**Tasks:**
1. ✅ Identify all 28+ registries
2. ✅ Migrate custom registries to extend BaseRegistry
3. ✅ Centralize common registries in `@lib/core/registries`
4. ✅ Update all imports
5. ✅ Remove registry bridge if no longer needed

**Example Migration:**
```typescript
// Before: Custom implementation
class ShapeRegistryClass {
  private shapes: Map<string, SemanticShape> = new Map();
  register(shape: SemanticShape) { /* custom logic */ }
  get(id: string) { /* custom logic */ }
}

// After: Extend BaseRegistry
import { BaseRegistry } from '@lib/core';

class ShapeRegistry extends BaseRegistry<SemanticShape> {
  // Inherits register(), get(), getAll(), etc.
  // Add only feature-specific methods
  getByCategory(category: string) {
    return this.getAll().filter(s => s.category === category);
  }
}
```

### Phase 5: Documentation (Low Risk)
**Goal:** Document architecture decisions
**Time:** 2-3 hours

**Tasks:**
1. ✅ Create ARCHITECTURE.md with import patterns
2. ✅ Document feature module structure standards
3. ✅ Add README.md to each feature with public API
4. ✅ Create migration guide for future features

---

## 📈 Success Metrics

### Import Quality Metrics

| Metric | Before | Target | Status |
|--------|--------|--------|--------|
| Generic `@/` imports | 598 | < 100 | 🟡 In Progress |
| `@features/*` imports | 272 | > 500 | 🟡 In Progress |
| Deep imports | 100+ | 0 | 🔴 Not Started |
| Relative imports | 942 | < 800 | 🟡 Acceptable |
| Import errors | 0 | 0 | ✅ Complete |

### Module Quality Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Features with barrel exports | 17/17 | 17/17 | ✅ Complete |
| Lib modules with barrel exports | 25/25 | 25/25 | ✅ Complete |
| Features with lib/core | 15/17 | 17/17 | 🟡 85% |
| Registries using BaseRegistry | ~10/28 | 28/28 | 🔴 36% |
| Feature coupling score | Medium | Low | 🟡 In Progress |

---

## 🎯 Key Recommendations Summary

### Immediate Actions (Quick Wins)

1. **Add ESLint rules** for import pattern enforcement
2. **Run codemod** to fix `@/features/*` → `@features/*` (598 occurrences)
3. **Document standards** in ARCHITECTURE.md

### Short-term Actions (1-2 weeks)

4. **Expand barrel exports** for top 20 most deep-imported modules
5. **Extract `@lib/generation-ui`** to decouple controlCenter/generation
6. **Add lib/core** to interactions & scene features

### Long-term Actions (1-2 months)

7. **Migrate all registries** to BaseRegistry pattern
8. **Evaluate feature mergers** (hud + worldTools)
9. **Standardize feature boundaries** with clear ownership
10. **Create feature templates** for consistent structure

---

## 📝 Lessons Learned

### What Worked Well

✅ **100% Barrel Export Coverage** - All features and lib modules have index.ts
✅ **Comprehensive Alias System** - 42+ aliases defined for clean imports
✅ **Feature-based Architecture** - Clear separation of concerns
✅ **Registry Pattern** - Consistent plugin/extension system

### What Needs Improvement

⚠️ **Alias Usage Discipline** - Need enforcement via tooling
⚠️ **Deep Import Prevention** - Barrel exports exist but are bypassed
⚠️ **Feature Boundaries** - Some features have unclear ownership
⚠️ **Registry Consistency** - 3 different patterns need standardization

### Key Insights

1. **Good Architecture ≠ Good Usage**: Having the right structure doesn't guarantee it will be used correctly without enforcement
2. **Barrel Exports Need Expansion**: Simply having index.ts isn't enough - they must export commonly used modules
3. **Feature Coupling is Subtle**: Cross-feature imports seem innocent but indicate boundary issues
4. **Tooling is Critical**: ESLint rules and codemods are necessary to maintain standards

---

## 🔗 Related Documentation

- [Frontend-Backend Boundaries](./frontend-backend-boundaries.md)
- [Clean Coupling Strategy](./clean-coupling-strategy.md)
- [November 2025 Architecture Snapshot](./ARCHITECTURE-2025-11.md)
- [Gizmo Architecture ADR](../ADR-GIZMO-ARCHITECTURE.md)

---

**Document History:**
- 2025-12-13: Initial snapshot created following import refactoring
- Analysis based on fixing 80+ import errors across 80+ files
- Comprehensive audit of 17 features, 25 lib modules, 28+ registries
