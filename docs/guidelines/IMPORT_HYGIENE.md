# Import Hygiene Guide

> **TL;DR**: Use barrel exports (`@lib/core`, `@features/graph`) instead of deep imports (`@lib/core/types`, `@features/graph/components/...`). ESLint enforces this automatically.

---

## Why Barrel Exports Matter

**Barrel exports** (index.ts files) act as the public API for a module. They provide several benefits:

1. **Encapsulation** - Internal implementation details stay hidden
2. **Refactoring Safety** - You can reorganize internals without breaking consumers
3. **Clear Intent** - The barrel explicitly shows what's meant to be public
4. **Better IDE Support** - Auto-imports suggest public API, not internal paths
5. **Smaller Bundles** - Tree-shaking works better with well-defined exports

---

## Frontend Import Rules

### ✅ DO: Import from Barrels

```typescript
// Core library modules
import { BrainState, getMood, getAxisValue } from '@lib/core';
import { panelRegistry, PANEL_CATEGORIES } from '@lib/panels';
import { shapeRegistry, BrainShapeRenderer } from '@lib/shapes';
import { widgetRegistry, ComposedPanel } from '@lib/widgets';
import { apiClient, updateGameWorldMeta } from '@lib/api';

// Features
import { GraphEditorHost, graphEditorStore } from '@features/graph';
import { WorldToolsPanel, worldToolRegistry } from '@features/worldTools';
import { NpcBrainLab } from '@features/brainTools';
```

### ❌ DON'T: Deep Import from Barrels

```typescript
// BAD - Bypasses the barrel
import { BrainState } from '@/lib/core/types';
import { panelRegistry } from '@/lib/panels/panelRegistry';
import { GraphEditorHost } from '@features/graph/components/graph/GraphEditorHost';
```

### ✅ EXCEPTION: Advanced Tooling Can Access Lib Internals

Some features (like HUD Editor) need advanced functionality not in the public barrel:

```typescript
// OK - Advanced tooling accessing feature lib internals
import { createPreset, deletePreset } from '@features/worldTools/lib/hudPresets';
import { getHudConfig } from '@features/worldTools/lib/hudLayout';

// OK - Importing from feature plugins
import { inventoryTool } from '@features/worldTools/plugins/inventory';
```

**When is this OK?**
- Your code is an advanced editing tool (e.g., HUD Editor, config panels)
- You need CRUD operations or internal utilities not in the barrel
- You're importing from a feature's `lib/*` or `plugins/*` subdirectories

**When is this NOT OK?**
- Basic consumption of a feature's components
- You're bypassing a lib barrel (`@lib/core`, `@lib/panels`, etc.)
- You're reaching into implementation details

---

## Path Aliases Reference

### Lib Modules

| Alias | Module | What It Exports |
|-------|--------|----------------|
| `@lib/core` | Core types & helpers | BrainState, GameSession, NPC types, mock core |
| `@lib/panels` | Panel registry | panelRegistry, PANEL_CATEGORIES, panel types |
| `@lib/shapes` | Shape rendering | shapeRegistry, BrainShapeRenderer |
| `@lib/widgets` | Widget system | widgetRegistry, ComposedPanel, built-in widgets |
| `@lib/api` | API client | apiClient, all domain API functions |

### Features

All features have barrels at `@features/<name>`:

- `@features/graph` - Graph editor
- `@features/worldTools` - World tools and HUD
- `@features/brainTools` - NPC brain lab
- `@features/hud` - HUD builder
- `@features/simulation` - Simulation playground
- `@features/generation` - Generation workbench
- `@features/scene` - Scene management
- `@features/gallery` - Gallery UI
- `@features/prompts` - Prompt inspector
- `@features/interactions` - NPC interactions
- `@features/intimacy` - Intimacy composer
- `@features/automation` - Browser automation

---

## Backend Import Rules

Backend uses Python module imports. Domain modules have `__init__.py` barrels.

### ✅ DO: Import from Domain Barrels

```python
# Import from domain barrels
from pixsim7.backend.main.domain.stats import StatEngine, StatDefinition
from pixsim7.backend.main.domain.game import GameSession, GameNPC
from pixsim7.backend.main.domain.brain import BrainState, BrainEngine
from pixsim7.backend.main.domain.narrative import NarrativeProgram, DialogueNode

# Migration helpers (intentionally exposed module)
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration,
)
```

### ❌ DON'T: Deep Import from Domain Internals

```python
# BAD - Bypasses domain barrel
from pixsim7.backend.main.domain.stats.engine import StatEngine
from pixsim7.backend.main.domain.game.models import GameSession
```

---

## ESLint Enforcement

The `import/no-internal-modules` rule enforces barrel usage:

```javascript
// eslint.config.js
rules: {
  'import/no-internal-modules': ['warn', {
    allow: [
      '@features/*/plugins/*',  // Feature plugins OK
      '@features/*/lib/*',      // Advanced tooling OK
      '@/lib/game/**',          // Lib directories without barrels (yet)
      // ... other exceptions
    ]
  }]
}
```

**Severity**: Currently `warn` (will upgrade to `error` once stable)

**Bypass**: Add `// eslint-disable-next-line import/no-internal-modules` if you have a legitimate reason

---

## Adding New Barrel Exports

When creating a new lib directory or feature:

### 1. Create `index.ts`

```typescript
/**
 * My Feature Module
 *
 * Description of what this module provides
 */

// Components
export { MyComponent } from './components/MyComponent';
export { AnotherComponent } from './components/AnotherComponent';

// Hooks
export { useMyHook } from './hooks/useMyHook';

// Types
export type { MyType, MyConfig } from './types';

// Stores (if any)
export { myStore } from './stores/myStore';
```

### 2. Update tsconfig.app.json

```json
{
  "compilerOptions": {
    "paths": {
      "@features/myFeature": ["./src/features/myFeature/index.ts"],
      "@features/myFeature/*": ["./src/features/myFeature/*"]
    }
  }
}
```

### 3. Update vite.config.ts

```javascript
resolve: {
  alias: [
    { find: '@features/myFeature', replacement: path.resolve(__dirname, './src/features/myFeature') },
  ]
}
```

### 4. Update ESLint Allowlist (if needed)

If your feature has intentionally exposed submodules:

```javascript
allow: [
  '@features/*/plugins/*',
  '@features/*/lib/*',  // Already there
]
```

---

## Migration Checklist

Moving from deep imports to barrels:

- [ ] Identify the barrel export (`@lib/core`, `@features/graph`, etc.)
- [ ] Check if the symbol you need is exported (read the `index.ts`)
- [ ] If missing, check if it should be public (not everything should be)
- [ ] Update the import to use the barrel
- [ ] Run TypeScript check: `pnpm exec tsc --noEmit`
- [ ] Run ESLint: `pnpm exec eslint src/`
- [ ] Commit with message: `refactor: use barrel export for <symbol>`

---

## FAQ

### Q: What if the symbol I need isn't in the barrel?

**A**: Three possibilities:

1. **It should be public** - Add it to the barrel's `index.ts`
2. **It's internal** - Don't use it; find an alternative public API
3. **It's advanced tooling** - Import from `lib/*` or `plugins/*` if you're building an editor/tool

### Q: Can I import from feature lib directories?

**A**: Yes, if you're building advanced tooling (editors, config panels). Regular feature consumers should use the barrel.

```typescript
// Advanced tooling - OK
import { createPreset } from '@features/worldTools/lib/hudPresets';

// Regular consumption - Use barrel
import { WorldToolsPanel } from '@features/worldTools';
```

### Q: Do all lib directories have barrels now?

**A**: Yes! As of the lib consolidation (December 2024), all 29 lib directories have barrel exports. The ESLint allowlist for `@/lib/**` patterns has been completely removed. All lib imports must now use the `@lib/*` aliases.

### Q: How do I bypass the rule temporarily?

**A**: Add an ESLint disable comment (but consider if you really need to):

```typescript
// eslint-disable-next-line import/no-internal-modules
import { InternalThing } from '@lib/core/internal/thing';
```

### Q: What about test files?

**A**: Test files can deep import to access internals for testing. The rule is disabled for `*.test.ts` and `*.spec.ts` files.

### Q: Will this break existing code?

**A**: No! We fixed all ~23 existing violations before enabling the rule. The rule is currently `warn` (not `error`) to catch new violations without breaking the build.

---

## Pre-commit Hooks

Husky + lint-staged run ESLint on staged files before commit:

```json
// package.json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix"]
}
```

This catches import hygiene violations before they're committed.

---

## Lib Consolidation Migration (December 2024)

The `lib/` directory underwent a major reorganization to establish clear boundaries and complete barrel export coverage.

### What Changed

**Phase 1: Utilities Consolidation**
- Created `@lib/utils/` to consolidate scattered utility files
- Moved: `logging.ts`, `uuid.ts`, `debugFlags.ts`, `storage.ts`, `time/`, `validation/`, `polling/`
- Merged `lib/theme/` into `lib/theming/`
- Organized cube system into `lib/cubes/` with barrel

**Phase 2: Feature-Specific Code Migration**
Feature-specific libs moved from `lib/` to their respective features:
- `lib/graph/` + `lib/graphs/` → `@features/graph/lib/` (editor, builders)
- `lib/gallery/` → `@features/gallery/lib/core/`
- `lib/hud/` → `@features/hud/lib/core/`
- `lib/generation/` → `@features/generation/lib/core/`
- `lib/simulation/` → `@features/simulation/lib/core/`
- `lib/automation/` → `@features/automation/lib/core/`
- `lib/gizmos/` → `@features/gizmos/lib/core/`

**Phase 3: Complete Barrel Coverage**
Added barrels to remaining lib directories (plus app hooks):
- `lib/game/` - Game runtime adapters
- `src/hooks/` - Shared React hooks (import via `@/hooks`)
- `lib/control/`, `lib/context/`, `lib/assets/`, `lib/display/`, `lib/analyzers/`

**Phase 4: Enforcement**
- Removed 33 ESLint allowlist entries for `@/lib/**` patterns
- All lib imports now enforce barrel usage
- Added 12 new path aliases to tsconfig and vite config

### Migration Impact

| Metric | Before | After |
|--------|--------|-------|
| Lib directories | 38 | 29 |
| With barrels | 17 (45%) | 29 (100%) |
| ESLint allowlist | 33 patterns | 0 patterns |
| Feature-specific code in lib/ | 8 directories | 0 |

### Import Changes

```typescript
// OLD (before consolidation)
import { BrainState } from '@/lib/core/types';
import { editorRegistry } from '@/lib/graph/editorRegistry';
import { createPreset } from '@/lib/hud/hudPresets';

// NEW (after consolidation)
import { BrainState } from '@lib/core';
import { editorRegistry } from '@features/graph';
import { createPreset } from '@features/hud/lib/hudPresets'; // Advanced tooling
```

---

## Further Reading

- [Barrel Exports in TypeScript](https://basarat.gitbook.io/typescript/main-1/barrel)
- [ESLint import/no-internal-modules](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md)
- [Path Aliases in TypeScript](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)
- [Lib Consolidation Plan](../plans/lib-consolidation-plan.md) - Detailed implementation plan
