# Lib Directory Consolidation Plan

## Overview

Reorganize the 38+ scattered `lib/` directories into:
1. **Feature-owned libs** - Move feature-specific code to `@features/*/lib/`
2. **Shared infrastructure** - Keep truly shared libs in `@lib/*` with barrels
3. **Utilities consolidation** - Merge scattered utilities into `@lib/utils/`

**Goals**:
- Clear ownership (features own their libs)
- Better encapsulation (internals hidden behind barrels)
- Easier navigation (one place to look per feature)
- Consistent with import hygiene plan

---

## Migration Inventory

### 🎯 Category 1: Feature-Specific (Move to features/)

These belong inside their corresponding feature's `lib/` directory:

| Current Location | Move To | Reason | Usage Count |
|-----------------|---------|--------|-------------|
| `lib/graph/` | `features/graph/lib/` | Graph editor internals | ~20 files |
| `lib/graphs/` | `features/graph/lib/` | Duplicate/related to graph | N/A |
| `lib/gallery/` | `features/gallery/lib/` | Gallery-specific logic | ~10 files |
| `lib/gizmos/` | `features/scene/lib/gizmos/` | 3D scene gizmos | TBD |
| `lib/hud/` | `features/hud/lib/` | HUD builder internals | ~8 files |
| `lib/generation/` | `features/generation/lib/` | Generation logic | ~5 files |
| `lib/simulation/` | `features/simulation/lib/` | Simulation internals | ~10 files |
| `lib/automation/` | `features/automation/lib/` | Automation internals | ~8 files |
| `lib/game/` | `features/game/` | Game runtime (new feature?) | ~5 files |
| `lib/gameplay-ui-core/` | `features/hud/lib/` or `features/game/lib/` | Game UI primitives | TBD |

**Scattered Files (move to features)**:
- `lib/cubeExpansionRegistry.ts` → `features/scene/lib/cubes/`
- `lib/cubeFormations.ts` → `features/scene/lib/cubes/`
- `lib/registerCubeExpansions.ts` → `features/scene/lib/cubes/`
- `lib/nodeEditorRegistry.ts` → `features/graph/lib/`

---

### ✅ Category 2: Core Registries (Keep in lib/, already have barrels)

These are UI registries following the BaseRegistry pattern:

| Module | Status | Exports |
|--------|--------|---------|
| `lib/core/` | ✅ Has barrel | BaseRegistry, types, mockCore |
| `lib/panels/` | ✅ Has barrel | panelRegistry, PANEL_CATEGORIES |
| `lib/widgets/` | ✅ Has barrel | widgetRegistry, ComposedPanel |
| `lib/shapes/` | ✅ Has barrel | shapeRegistry, BrainShapeRenderer |

---

### ⚠️ Category 3: Shared Infrastructure (Keep in lib/, needs barrels)

These are genuinely cross-cutting concerns:

| Module | Purpose | Needs Barrel | Priority |
|--------|---------|--------------|----------|
| `lib/api/` | API client | ✅ Has barrel | - |
| `lib/auth/` | Authentication | ⚠️ Yes | High |
| `lib/devtools/` | DevToolRegistry | ⚠️ Yes | High |
| `lib/control/` | ControlCenterModuleRegistry | ⚠️ Yes | Medium |
| `lib/dataBinding/` | DataSourceRegistry | ⚠️ Yes | Medium |
| `lib/providers/` | React contexts | ⚠️ Yes | Medium |
| `lib/hooks/` | Shared React hooks | ⚠️ Yes | High |
| `lib/theming/` | Theme system | ⚠️ Yes | Medium |
| `lib/icons.tsx` | Icon components | Move to utils | Low |
| `lib/plugins/` | Plugin system | ⚠️ Yes | Medium |
| `lib/settings/` | Settings management | ⚠️ Yes | Medium |

---

### 📦 Category 4: Utilities (Consolidate into @lib/utils/)

Scattered utility files that should be organized:

**Files to Move**:
- `lib/logging.ts` → `lib/utils/logging.ts`
- `lib/uuid.ts` → `lib/utils/uuid.ts`
- `lib/debugFlags.ts` → `lib/utils/debugFlags.ts`
- `lib/zustandPersistWorkaround.ts` → `lib/utils/zustandPersist.ts`
- `lib/backendStorage.ts` → `lib/utils/storage.ts`
- `lib/pluginLoader.ts` → `lib/plugins/loader.ts`
- `lib/settingsRegistry.ts` → `lib/settings/registry.ts`
- `lib/panelActions.ts` → `lib/panels/actions.ts`
- `lib/googleAuth.ts` → `lib/auth/googleAuth.ts`

**Directories to Include**:
- `lib/time/` → Keep as `lib/utils/time/`
- `lib/validation/` → Keep as `lib/utils/validation/`
- `lib/polling/` → Move to `lib/utils/polling/` or `lib/hooks/usePolling.ts`

---

### 🤔 Category 5: Domain-Specific (Needs Investigation)

These require analysis to determine ownership:

| Module | Possible Destination | Notes |
|--------|---------------------|-------|
| `lib/assets/` | `lib/assets/` (keep) OR `features/gallery/lib/` | Asset management - check usage |
| `lib/models/` | `lib/core/` OR distribute to features | Data models - may be shared |
| `lib/analyzers/` | `features/devtools/` OR `lib/devtools/` | Code/data analyzers |
| `lib/capabilities/` | `lib/utils/` OR `lib/core/` | Feature flags system |
| `lib/gating/` | `lib/auth/` OR `lib/utils/` | Access control |
| `lib/context/` | `lib/providers/` | React contexts (merge?) |
| `lib/display/` | `lib/ui/` (new?) OR distribute | Display utilities |
| `lib/editing-core/` | `lib/ui/` OR `features/*/lib/` | Editor primitives - check usage |
| `lib/overlay/` | `lib/ui/` OR `features/hud/lib/` | Overlay system |
| `lib/preview-bridge/` | `features/generation/lib/` | Preview functionality |
| `lib/console/` | `lib/devtools/` | Debug console |
| `lib/registries.ts` | Keep or consolidate | Central exports |

---

### 🗑️ Category 6: Duplicates/Merge Candidates

These should be merged or investigated for overlap:

| Duplicate | Merge Target | Action |
|-----------|-------------|--------|
| `lib/theme/` + `lib/theming/` | `lib/theming/` | Merge theme → theming |
| `lib/graph/` + `lib/graphs/` | `features/graph/lib/` | Investigate overlap, merge |
| `lib/context/` + `lib/providers/` | `lib/providers/` | Merge context → providers |

---

## Phase 1: Quick Wins

**Goal**: Clean up obvious scattered files and duplicates first

### 1.1 Consolidate Utilities
```bash
# Create utils barrel
mkdir apps/main/src/lib/utils
mv apps/main/src/lib/logging.ts apps/main/src/lib/utils/
mv apps/main/src/lib/uuid.ts apps/main/src/lib/utils/
mv apps/main/src/lib/debugFlags.ts apps/main/src/lib/utils/
mv apps/main/src/lib/zustandPersistWorkaround.ts apps/main/src/lib/utils/zustandPersist.ts
mv apps/main/src/lib/backendStorage.ts apps/main/src/lib/utils/storage.ts
mv apps/main/src/lib/time apps/main/src/lib/utils/
mv apps/main/src/lib/validation apps/main/src/lib/utils/

# Create barrel
cat > apps/main/src/lib/utils/index.ts << 'EOF'
/**
 * Shared utilities and helpers
 */

export * from './logging';
export * from './uuid';
export * from './debugFlags';
export * from './zustandPersist';
export * from './storage';
export * from './time';
export * from './validation';
EOF
```

**Update imports**: Replace `@/lib/logging` with `@lib/utils`

---

### 1.2 Merge Theme Directories
```bash
# Merge theme → theming
cp -r apps/main/src/lib/theme/* apps/main/src/lib/theming/
rm -rf apps/main/src/lib/theme

# Create/update theming barrel
cat > apps/main/src/lib/theming/index.ts << 'EOF'
/**
 * Theme system
 */

export * from './themeProvider';
export * from './themeContext';
// ... other exports
EOF
```

**Update imports**: Replace `@/lib/theme/...` with `@lib/theming`

---

### 1.3 Move Cube Files to Scene Feature
```bash
# Create cubes lib in scene feature
mkdir -p apps/main/src/features/scene/lib/cubes
mv apps/main/src/lib/cubeExpansionRegistry.ts apps/main/src/features/scene/lib/cubes/
mv apps/main/src/lib/cubeFormations.ts apps/main/src/features/scene/lib/cubes/
mv apps/main/src/lib/registerCubeExpansions.ts apps/main/src/features/scene/lib/cubes/

# Update scene feature barrel
# Add to apps/main/src/features/scene/index.ts:
export * from './lib/cubes/cubeExpansionRegistry';
export * from './lib/cubes/cubeFormations';
```

**Update imports**: Replace `@/lib/cubeExpansionRegistry` with `@features/scene`

---

### 1.4 Move Loose Files to Proper Homes
```bash
# Move plugin loader
mv apps/main/src/lib/pluginLoader.ts apps/main/src/lib/plugins/loader.ts

# Move settings registry
mv apps/main/src/lib/settingsRegistry.ts apps/main/src/lib/settings/registry.ts

# Move panel actions
mv apps/main/src/lib/panelActions.ts apps/main/src/lib/panels/actions.ts

# Move googleAuth
mv apps/main/src/lib/googleAuth.ts apps/main/src/lib/auth/googleAuth.ts
```

**Update barrels**: Add exports to respective `index.ts` files

---

## Phase 2: Move Feature-Specific Libs

**Goal**: Migrate large feature-specific directories to their features

### 2.1 Graph Library Migration

```bash
# Create graph lib directory
mkdir -p apps/main/src/features/graph/lib

# Move graph directories
mv apps/main/src/lib/graph apps/main/src/features/graph/lib/editor
mv apps/main/src/lib/graphs apps/main/src/features/graph/lib/data
mv apps/main/src/lib/nodeEditorRegistry.ts apps/main/src/features/graph/lib/

# Update feature barrel (apps/main/src/features/graph/index.ts)
# Add exports:
export * from './lib/editor';
export * from './lib/data';
export { nodeEditorRegistry } from './lib/nodeEditorRegistry';
```

**Update imports**:
- `@/lib/graph/...` → `@features/graph` (use barrel)
- Advanced tooling can use `@features/graph/lib/editor/...`

**Files to update**: ~20 files (mostly graph components)

---

### 2.2 Gallery Library Migration

```bash
# Move gallery lib
mkdir -p apps/main/src/features/gallery/lib
mv apps/main/src/lib/gallery apps/main/src/features/gallery/lib/surfaces

# Update feature barrel
# Add to apps/main/src/features/gallery/index.ts:
export * from './lib/surfaces';
```

**Update imports**: `@/lib/gallery/...` → `@features/gallery`

**Files to update**: ~10 files

---

### 2.3 HUD Library Migration

```bash
# HUD lib already exists, just move lib/hud content there
mv apps/main/src/lib/hud/* apps/main/src/features/hud/lib/

# Update feature barrel if needed
```

**Update imports**: `@/lib/hud/...` → `@features/hud`

**Files to update**: ~8 files

---

### 2.4 Generation Library Migration

```bash
# Move generation lib
mv apps/main/src/lib/generation apps/main/src/features/generation/lib/core

# Update feature barrel
```

**Update imports**: `@/lib/generation/...` → `@features/generation`

**Files to update**: ~5 files

---

### 2.5 Simulation Library Migration

```bash
# Move simulation lib
mv apps/main/src/lib/simulation apps/main/src/features/simulation/lib/runner

# Update feature barrel
```

**Update imports**: `@/lib/simulation/...` → `@features/simulation`

**Files to update**: ~10 files

---

### 2.6 Automation Library Migration

```bash
# Move automation lib
mv apps/main/src/lib/automation apps/main/src/features/automation/lib/runtime

# Update feature barrel
```

**Update imports**: `@/lib/automation/...` → `@features/automation`

**Files to update**: ~8 files

---

### 2.7 Gizmos Migration (Scene Feature)

```bash
# Move gizmos to scene feature
mv apps/main/src/lib/gizmos apps/main/src/features/scene/lib/

# Update scene feature barrel
```

**Update imports**: `@/lib/gizmos/...` → `@features/scene`

---

### 2.8 Game Library (Create New Feature?)

**Decision needed**: Is `lib/game/` substantial enough for a feature?

**Option A**: Create `@features/game`
```bash
mkdir -p apps/main/src/features/game
mv apps/main/src/lib/game apps/main/src/features/game/lib
mv apps/main/src/lib/gameplay-ui-core apps/main/src/features/game/lib/ui
# Create feature structure
```

**Option B**: Move to existing feature
```bash
# If game runtime belongs to simulation
mv apps/main/src/lib/game apps/main/src/features/simulation/lib/game
```

**Decision**: Review `lib/game/` contents first

---

## Phase 3: Add Barrels to Remaining Libs

**Goal**: Every lib directory has a barrel export

### 3.1 High Priority Barrels

#### lib/auth
```typescript
// apps/main/src/lib/auth/index.ts
export { authProvider } from './authProvider';
export { useAuth } from './useAuth';
export * from './googleAuth';
export type { AuthState, AuthConfig } from './types';
```

#### lib/devtools
```typescript
// apps/main/src/lib/devtools/index.ts
export {
  DevToolRegistry,
  devToolRegistry,
  type DevToolDefinition,
} from './devToolRegistry';
export { DevToolsPanel } from './DevToolsPanel';
```

#### lib/hooks
```typescript
// apps/main/src/lib/hooks/index.ts
export { usePolling } from './usePolling';
export { useDebounce } from './useDebounce';
export { useLocalStorage } from './useLocalStorage';
// ... other hooks
```

#### lib/control
```typescript
// apps/main/src/lib/control/index.ts
export {
  ControlCenterModuleRegistry,
  controlCenterModuleRegistry,
  type ControlCenterModule,
} from './controlCenterModuleRegistry';
```

#### lib/dataBinding
```typescript
// apps/main/src/lib/dataBinding/index.ts
export {
  DataSourceRegistry,
  dataSourceRegistry,
  type DataSource,
  type DataTransform,
} from './dataSourceRegistry';
```

---

### 3.2 Medium Priority Barrels

Create barrels for:
- `lib/providers/`
- `lib/theming/` (if not done in Phase 1)
- `lib/plugins/`
- `lib/settings/`

---

## Phase 4: Update Aliases and ESLint Config

### 4.1 Add New Path Aliases

**apps/main/tsconfig.app.json**:
```json
{
  "compilerOptions": {
    "paths": {
      // New lib barrels
      "@lib/utils": ["./src/lib/utils/index.ts"],
      "@lib/auth": ["./src/lib/auth/index.ts"],
      "@lib/devtools": ["./src/lib/devtools/index.ts"],
      "@lib/control": ["./src/lib/control/index.ts"],
      "@lib/dataBinding": ["./src/lib/dataBinding/index.ts"],
      "@lib/hooks": ["./src/lib/hooks/index.ts"],
      "@lib/providers": ["./src/lib/providers/index.ts"],
      "@lib/theming": ["./src/lib/theming/index.ts"],
      "@lib/plugins": ["./src/lib/plugins/index.ts"],
      "@lib/settings": ["./src/lib/settings/index.ts"],

      // Feature updates (if game becomes a feature)
      "@features/game": ["./src/features/game/index.ts"],
      "@features/game/*": ["./src/features/game/*"]
    }
  }
}
```

**apps/main/vite.config.ts**: Mirror the aliases

---

### 4.2 Update ESLint Allowlist

**apps/main/eslint.config.js**:

Remove from allowlist (now have barrels):
```javascript
// REMOVE these after barrels created:
// '@/lib/graph/**',
// '@/lib/gallery/**',
// '@/lib/gizmos/**',
// '@/lib/hud/**',
// '@/lib/generation/**',
// '@/lib/simulation/**',
// '@/lib/automation/**',
```

Add new allowlist items if needed:
```javascript
allow: [
  // ... existing

  // Investigation phase - remove after decisions made
  '@/lib/assets/**',
  '@/lib/models/**',
  '@/lib/analyzers/**',
  '@/lib/capabilities/**',
  '@/lib/gating/**',
  '@/lib/display/**',
  '@/lib/editing-core/**',
  '@/lib/overlay/**',
  '@/lib/preview-bridge/**',
  '@/lib/console/**',
]
```

---

## Phase 5: Update Documentation

### 5.1 Update docs/repo-map.md

Add section after import hygiene:

```markdown
### Lib Directory Organization

PixSim7 uses a **feature-first** approach for lib code organization:

**Feature-Owned Libs** (`@features/*/lib/`):
- Each feature owns its internal lib code
- Examples: `@features/graph/lib/`, `@features/scene/lib/cubes/`
- Advanced tooling can access: `@features/*/lib/*` (allowed)

**Shared Infrastructure** (`@lib/*`):
All lib modules now have barrel exports:
- `@lib/core` - BaseRegistry, types, mockCore
- `@lib/panels` - Panel registry
- `@lib/widgets` - Widget system
- `@lib/shapes` - Shape rendering
- `@lib/api` - API client
- `@lib/auth` - Authentication
- `@lib/devtools` - Dev tools registry
- `@lib/control` - Control center modules
- `@lib/dataBinding` - Data binding registry
- `@lib/hooks` - Shared React hooks
- `@lib/utils` - Utilities and helpers
- `@lib/providers` - React context providers
- `@lib/theming` - Theme system
- `@lib/plugins` - Plugin system
- `@lib/settings` - Settings management

**Migration Notes**:
- Cube code moved from `lib/` to `@features/scene/lib/cubes/`
- Graph editor moved from `lib/graph/` to `@features/graph/lib/`
- Gallery surfaces moved from `lib/gallery/` to `@features/gallery/lib/`
```

---

### 5.2 Update docs/guidelines/IMPORT_HYGIENE.md

Add migration notes section:

```markdown
## Recent Lib Consolidation

The `lib/` directory was reorganized to follow feature-first principles:

**What moved**:
- Feature-specific code moved to `@features/*/lib/`
- Scattered utilities consolidated to `@lib/utils/`
- Duplicate directories merged (theme → theming)

**Import changes**:
```typescript
// OLD (deep import)
import { cubeRegistry } from '@/lib/cubeExpansionRegistry';
import { editorRegistry } from '@/lib/graph/editorRegistry';

// NEW (barrel import)
import { cubeRegistry } from '@features/scene';
import { editorRegistry } from '@features/graph';
```
```

---

## Validation Checklist

After each phase:
- [ ] TypeScript compiles: `pnpm exec tsc --noEmit`
- [ ] ESLint passes: `pnpm exec eslint src/`
- [ ] Dev server runs: `pnpm run dev`
- [ ] No broken imports
- [ ] Git status clean (no unintended changes)

---

## Implementation Order

1. ✅ **Phase 1** - Quick wins (1-2 hours)
   - Consolidate utils
   - Merge theme/theming
   - Move cube files
   - Move loose files

2. ⏳ **Phase 2** - Feature migrations (3-4 hours)
   - Graph (20 files)
   - Gallery (10 files)
   - HUD (8 files)
   - Simulation (10 files)
   - Automation (8 files)
   - Generation (5 files)
   - Gizmos
   - Game (investigate first)

3. ⏳ **Phase 3** - Add barrels (2-3 hours)
   - auth, devtools, hooks (high priority)
   - control, dataBinding, providers (medium)
   - theming, plugins, settings (medium)

4. ⏳ **Phase 4** - Config updates (30 mins)
   - tsconfig path aliases
   - vite.config.ts
   - ESLint allowlist

5. ⏳ **Phase 5** - Documentation (1 hour)
   - repo-map.md updates
   - IMPORT_HYGIENE.md migration notes

**Total estimated effort**: 8-12 hours spread over multiple sessions

---

## Success Criteria

✅ All feature-specific code lives in `@features/*/lib/`
✅ All shared libs have barrel exports
✅ No scattered utility files in `lib/` root
✅ ESLint allowlist reduced by ~8 entries
✅ Documentation updated
✅ TypeScript + ESLint + build all pass
✅ Clear ownership for all lib code

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| TBD | lib/game → ? | Need to audit usage |
| TBD | lib/models → ? | May be shared types |
| TBD | lib/assets → ? | Asset management scope |
| TBD | lib/analyzers → ? | Check if dev-only |

---

## Notes

- **Migration is incremental** - Can pause after any phase
- **Feature barrels already exist** - Just need to add lib exports
- **Advanced tooling exception** - `@features/*/lib/*` remains allowed for editors
- **Backwards compatibility** - Old paths work during migration (ESLint warns)
- **Team coordination** - Communicate before big moves to avoid conflicts
