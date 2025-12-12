# Import Hygiene Pass - Implementation Plan

## Overview
Tighten import boundaries across frontend (primary) and backend (limited scope) to prevent deep imports and establish clear public API surfaces.

**Scope**: Frontend barrel exports + ESLint enforcement + pre-commit hooks + backend stats.migration sub-barrel

**Impact**: ~23 frontend files, new barrels for 5 lib directories, automated enforcement

## Phase 1: Create Frontend Barrel Exports

### 1.1 lib/core - Foundation Types & BrainState Helpers
**File**: `apps/main/src/lib/core/index.ts` (new)

**Why**: Most critical - 10+ files import from types.ts and mockCore.ts directly

**Content**:
```typescript
/**
 * Core headless game engine types and interfaces
 * Re-exports core types from @shared/types and local core definitions
 */

// Core types (re-exported from @shared/types via types.ts)
export type {
  CoreEventMap,
  ApiClient, StorageProvider, AuthProvider,
  GameSession, GameNPC,
  NpcRelationshipState, RelationshipTier, IntimacyLevel,
  PixSim7Core,
  BrainState, BrainStatSnapshot, BrainMemory,
  DerivedBehaviorUrgency, BehaviorUrge,
} from './types';

// BrainState helpers (re-exported from @shared/types)
export {
  hasStat, hasDerived, getDerived, getAxisValue,
  getMood, getBehaviorUrgency, getTopBehaviorUrges,
  hasBehaviorUrgency, getConversationStyle,
  getLogicStrategies, getInstincts, getMemories,
  getPersonaTags, getIntimacyLevel, getRelationshipFlags,
} from './types';

export { createMockCore } from './mockCore';
export { BaseRegistry } from './BaseRegistry';
```

---

### 1.2 lib/panels - Panel Registry System
**File**: `apps/main/src/lib/panels/index.ts` (new)

**Why**: 10+ files import panelRegistry and panelConstants directly

**Content**:
```typescript
/**
 * Panel Registry System
 * Dynamic panel registration for workspace panels
 */

export {
  PanelRegistry, panelRegistry,
  type PanelDefinition, type WorkspaceContext,
  type CoreEditorRole, type ContextLabelStrategy,
} from './panelRegistry';

export {
  PANEL_CATEGORIES, CATEGORY_LABELS, CATEGORY_ORDER,
  type PanelCategory,
} from './panelConstants';

export { type PanelPlugin, createPanelPlugin } from './panelPlugin';
export { corePanelsPlugin } from './corePanelsPlugin';
export { initializePanels } from './initializePanels';
```

---

### 1.3 lib/shapes - Shape Rendering
**File**: `apps/main/src/lib/shapes/index.ts` (new)

**Content**:
```typescript
export {
  ShapeRegistry, shapeRegistry,
  type ShapeRenderer, type ShapeRenderContext,
} from './registry';

export { BrainShapeRenderer, type BrainShapeData } from './brain';
```

---

### 1.4 lib/widgets - Widget Registry
**File**: `apps/main/src/lib/widgets/index.ts` (new)

**Content**:
```typescript
export {
  WidgetRegistry, widgetRegistry,
  type WidgetDefinition,
} from './widgetRegistry';

export {
  PanelComposer,
  type PanelComposition, type WidgetSlot,
} from './panelComposer';

export { ComposedPanel } from './ComposedPanel';
export { builtInWidgets } from './builtInWidgets';
export { initializeWidgets } from './initializeWidgets';
export { demoCompositions } from './demoCompositions';
```

---

### 1.5 lib/api - API Client
**File**: `apps/main/src/lib/api/index.ts` (new)

**Why**: API client used throughout app (20+ files)

**Content**:
```typescript
/**
 * API Client - Frontend API for backend services
 */

export { apiClient, setApiBaseUrl, getApiBaseUrl } from './client';
export { ApiError, handleApiError, isApiError } from './errorHandling';

// Domain clients
export * from './game';
export * from './accounts';
export * from './assets';
export * from './interactions';
export * from './generations';
export * from './generationOperations';
export * from './analyzers';
export * from './userPreferences';
export * from './controlCenter';
export * from './pixverseSync';
export * from './pixverseCost';

// Note: __simulate_extend.ts NOT exported (test utility)
```

---

## Phase 2: Update Path Aliases

### 2.1 tsconfig.app.json
**File**: `apps/main/tsconfig.app.json`

**Action**: Add to `compilerOptions.paths` (after existing @features/worldTools):

```json
"@lib/core": ["./src/lib/core/index.ts"],
"@lib/panels": ["./src/lib/panels/index.ts"],
"@lib/shapes": ["./src/lib/shapes/index.ts"],
"@lib/widgets": ["./src/lib/widgets/index.ts"],
"@lib/api": ["./src/lib/api/index.ts"],

"@features/graph": ["./src/features/graph/index.ts"],
"@features/brainTools": ["./src/features/brainTools/index.ts"],
"@features/simulation": ["./src/features/simulation/index.ts"],
"@features/generation": ["./src/features/generation/index.ts"],
"@features/intimacy": ["./src/features/intimacy/index.ts"],
"@features/prompts": ["./src/features/prompts/index.ts"],
"@features/scene": ["./src/features/scene/index.ts"],
"@features/gallery": ["./src/features/gallery/index.ts"],
"@features/automation": ["./src/features/automation/index.ts"],
"@features/interactions": ["./src/features/interactions/index.ts"],
```

### 2.2 vite.config.ts
**File**: `apps/main/vite.config.ts`

**Action**: Mirror the new path aliases in `resolve.alias` section

---

## Phase 3: Fix Import Violations

### 3.1 lib/core violations (10 files)
Replace imports from `@/lib/core/types` or relative paths with `@lib/core`:

**Files**:
- `apps/main/src/components/shapes/BrainShape.tsx`
- `apps/main/src/features/worldTools/plugins/npcBrainDebug.tsx`
- `apps/main/src/features/brainTools/plugins/*.tsx` (7 files: behavior, traits, social, mood, memories, logic, instinct)
- `apps/main/src/components/examples/BrainShapeExample.tsx`

**Pattern**:
```typescript
// BEFORE:
import { BrainState, getAxisValue, getMood } from '@/lib/core/types';

// AFTER:
import { BrainState, getAxisValue, getMood } from '@lib/core';
```

---

### 3.2 @features/worldTools violations (3 files)
Already exported in worldTools barrel - just fix import paths:

**Files**:
- `apps/main/src/routes/Game2D.tsx`
- `apps/main/src/components/panels/tools/GameToolsPanel.tsx`
- `apps/main/src/features/simulation/components/SimulationPlayground.tsx`

**Pattern**:
```typescript
// BEFORE:
import { worldToolRegistry } from '@features/worldTools/lib/registry';

// AFTER:
import { worldToolRegistry } from '@features/worldTools';
```

---

### 3.3 @features/graph violations (1 file)
**File**: `apps/main/src/lib/panels/corePanelsPlugin.tsx`

**Pattern**:
```typescript
// BEFORE:
import { GraphEditorHost } from '@features/graph/components/graph/GraphEditorHost';

// AFTER:
import { GraphEditorHost } from '@features/graph';
```

---

### 3.4 lib/panels violations (5+ files)
**Files**:
- `apps/main/src/stores/panelConfigStore.ts`
- `apps/main/src/components/panels/tools/GameToolsPanel.tsx`
- `apps/main/src/components/panels/shared/PanelHeader.tsx`
- `apps/main/src/components/panels/shared/FloatingPanelsManager.tsx`
- `apps/main/src/components/layout/workspace-toolbar/AddPanelDropdown.tsx`

**Pattern**:
```typescript
// BEFORE:
import { panelRegistry } from '@/lib/panels/panelRegistry';
import { PANEL_CATEGORIES } from '@/lib/panels/panelConstants';

// AFTER:
import { panelRegistry, PANEL_CATEGORIES } from '@lib/panels';
```

---

## Phase 4: ESLint Import Enforcement

### 4.1 Install dependencies
```bash
pnpm add -D eslint-plugin-import eslint-import-resolver-typescript
```

---

### 4.2 Update eslint.config.js
**File**: `apps/main/eslint.config.js`

**Action**: Add import plugin and rules:

```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import importPlugin from 'eslint-plugin-import'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.app.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',

      // Enforce barrel exports - prevent deep imports
      'import/no-internal-modules': [
        'error',
        {
          allow: [
            // Packages
            '@pixsim7/**',
            '@shared/**',

            // Assets
            '**/*.css',
            '**/*.scss',
            '**/*.svg',
            '**/*.png',

            // Feature submodules (intentionally exposed)
            '@features/*/plugins/*',

            // Lib directories WITHOUT barrels (allow until barrels created)
            '@/lib/game/**',
            '@/lib/gizmos/**',
            '@/lib/overlay/**',
            '@/lib/console/**',
            // ... other lib dirs without barrels

            // DO NOT allow: @/lib/core/*, @/lib/panels/*, etc.
          ],
        },
      ],

      // Import order
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '@lib/**', group: 'internal', position: 'before' },
            { pattern: '@features/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Detect circular dependencies
      'import/no-cycle': ['warn', { maxDepth: 10 }],

      // Ensure imports resolve
      'import/no-unresolved': 'error',
    },
  },

  // Test files - allow deep imports
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'import/no-internal-modules': 'off',
    },
  },
])
```

---

## Phase 5: Pre-commit Hooks

### 5.1 Install husky + lint-staged
```bash
pnpm add -D husky lint-staged
```

---

### 5.2 Initialize husky
```bash
pnpm exec husky init
```

---

### 5.3 Configure lint-staged
**File**: `package.json` (in apps/main)

**Action**: Add lint-staged config:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

### 5.4 Create pre-commit hook
**File**: `.husky/pre-commit` (in apps/main)

**Content**:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

cd apps/main && pnpm exec lint-staged
```

---

## Phase 6: Backend Stats Migration Sub-Barrel

### 6.1 Create stats/migration/__init__.py
**File**: `pixsim7/backend/main/domain/stats/migration/__init__.py` (new)

**Why**: User chose "Create stats.migration sub-barrel" option

**Content**:
```python
"""
Legacy migration helpers for transitioning from hardcoded relationships to abstract stats.

These utilities help migrate old world_meta relationship configs to the new stats system.
Exposed as a sub-barrel (stats.migration.*) to keep them separate from core stats API.
"""

from .relationship_migration import (
    migrate_world_meta_to_stats_config,
    needs_migration,
    migrate_relationship_definition,
    extract_relationship_axes_from_meta,
)

__all__ = [
    'migrate_world_meta_to_stats_config',
    'needs_migration',
    'migrate_relationship_definition',
    'extract_relationship_axes_from_meta',
]
```

---

### 6.2 Update imports using stats.migration (7 files)
**Files**:
- `pixsim7/backend/main/api/v1/actions.py`
- `pixsim7/backend/main/api/v1/stat_preview.py`
- `pixsim7/backend/main/services/game/stat_service.py`
- `pixsim7/backend/main/services/generation/social_context_builder.py`
- `pixsim7/backend/main/domain/narrative/action_block_resolver.py`
- `pixsim7/backend/main/domain/narrative/engine.py`
- `pixsim7/backend/main/plugins/game_dialogue/manifest.py`

**Pattern**:
```python
# BEFORE:
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration,
)

# AFTER:
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration,
)
# (Path stays the same - just now official via __init__.py)
```

**Note**: The import path doesn't change, but now it goes through the barrel instead of direct file import.

---

## Phase 7: Documentation

### 7.1 Update docs/repo-map.md
**File**: `docs/repo-map.md`

**Action**: Add import hygiene section after line 27 (in Front-End section):

```markdown
### Import Hygiene & Barrel Exports

PixSim7 uses barrel exports (`index.ts`) to control public API surfaces.

**Lib Aliases** (`@lib/*`):
- `@lib/core` - Core types, BrainState helpers, mock core
- `@lib/panels` - Panel registry and constants
- `@lib/shapes` - Shape rendering
- `@lib/widgets` - Widget registry
- `@lib/api` - API client

**Feature Aliases** (`@features/*`):
All 12 features have barrels. Import from feature root, not nested paths.

**Import Rules**:
1. ✅ Import from barrels: `@lib/core`, `@features/graph`
2. ❌ Never deep import: `@lib/core/types`, `@features/graph/components/...`
3. ✅ Exception: Feature plugins: `@features/worldTools/plugins/inventory`
4. Enforced by ESLint `import/no-internal-modules` rule

**Example**:
```typescript
// GOOD
import { BrainState, getMood } from '@lib/core';
import { GraphEditorHost } from '@features/graph';

// BAD
import { BrainState } from '@/lib/core/types';
import { GraphEditorHost } from '@features/graph/components/graph/GraphEditorHost';
```

**Backend**: Domain modules have barrels. Import from `pixsim7.backend.<domain>`, not deep paths.
```python
# GOOD
from pixsim7.backend.main.domain.stats import StatEngine
from pixsim7.backend.main.domain.stats.migration import migrate_world_meta_to_stats_config

# BAD
from pixsim7.backend.main.domain.stats.engine import StatEngine
```
```

---

### 7.2 Create IMPORT_HYGIENE.md
**File**: `docs/guidelines/IMPORT_HYGIENE.md` (new)

**Content**: Comprehensive guide with:
- Principles (why barrel exports matter)
- Pattern examples (correct vs incorrect)
- Adding new barrels checklist
- ESLint rules explanation
- Migration guide for new features
- FAQ

---

## Validation Checklist

After each phase, validate:
- [ ] `pnpm exec tsc --noEmit` (type check)
- [ ] `pnpm exec eslint src/` (lint)
- [ ] `pnpm run build` (production build)
- [ ] Git status clean (no unintended changes)

---

## Implementation Order

1. **Phase 1** - Create 5 frontend barrels (core, panels, shapes, widgets, api)
2. **Phase 2** - Update tsconfig path aliases + vite config
3. **Validate** - TypeScript builds, no errors
4. **Phase 3** - Fix ~23 import violations manually
5. **Validate** - TypeScript + dev server work
6. **Phase 4** - Add ESLint import rules (start with 'warn')
7. **Phase 5** - Setup husky + lint-staged
8. **Validate** - Hooks run on commit
9. **Phase 6** - Create backend stats/migration barrel + update imports
10. **Phase 7** - Update documentation
11. **Final** - Upgrade ESLint rules from 'warn' to 'error'

---

## Critical Files Reference

### Frontend Barrels (NEW):
- `apps/main/src/lib/core/index.ts`
- `apps/main/src/lib/panels/index.ts`
- `apps/main/src/lib/shapes/index.ts`
- `apps/main/src/lib/widgets/index.ts`
- `apps/main/src/lib/api/index.ts`

### Config Updates:
- `apps/main/tsconfig.app.json` - Path aliases
- `apps/main/vite.config.ts` - Runtime aliases
- `apps/main/eslint.config.js` - Import rules
- `apps/main/package.json` - lint-staged config

### Backend Barrel (NEW):
- `pixsim7/backend/main/domain/stats/migration/__init__.py`

### Documentation:
- `docs/repo-map.md` - Add import section
- `docs/guidelines/IMPORT_HYGIENE.md` - New comprehensive guide

---

## Success Criteria

✅ All 5 critical lib directories have barrel exports
✅ Zero deep imports to @lib/core, @lib/panels, @lib/shapes, @lib/widgets, @lib/api
✅ ESLint import rules enforced as errors
✅ Pre-commit hooks run lint-staged
✅ Documentation updated with import guidelines
✅ Backend stats.migration accessible via sub-barrel
✅ TypeScript builds without errors
✅ Production build passes

---

## Notes

- **Manual fixes preferred** - Only 23 violations, safer than codemod
- **Gradual rollout** - ESLint warns first, then errors after fixes complete
- **Test as you go** - Validate after each phase to catch issues early
- **Backend minimal** - Only stats.migration barrel per user choice
- **Infrastructure unchanged** - Database/redis/events stay granular (intentional)
