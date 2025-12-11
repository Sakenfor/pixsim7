# Repository Map & Path Aliases

This document describes the repository structure and the path alias system for cleaner imports.

## Path Aliases

The repository uses TypeScript path aliases to simplify imports and reduce coupling to physical file locations. This allows you to import from logical domains rather than using deep relative paths.

### Available Aliases

| Alias | Maps To | Purpose |
|-------|---------|---------|
| `@/narrative/*` | `packages/game/engine/src/narrative/*` | Narrative runtime engine, executor, node handlers, logging |
| `@/narrative` | `packages/game/engine/src/narrative/index.ts` | Main narrative barrel export |
| `@/scene/*` | `packages/game/engine/src/narrative/*` | Scene integration (playback, triggers, media coordination) |
| `@/scene` | `packages/game/engine/src/narrative/index.ts` | Scene-related exports from narrative |
| `@/gizmos/*` | `apps/main/src/lib/gizmos/*` | Gizmo surfaces, console integration, interaction stats |
| `@/gizmos` | `apps/main/src/lib/gizmos/index.ts` | Main gizmos barrel export |
| `@/types/*` | `packages/shared/types/src/*` | Shared type definitions, DTOs, interfaces |
| `@/types` | `packages/shared/types/src/index.ts` | Main types barrel export |

### Usage Examples

**Before (deep relative imports):**
```typescript
import { NarrativeExecutor } from '../../../packages/game/engine/src/narrative/executor';
import type { GameSessionDTO } from '@pixsim7/shared.types';
import { interactionStats } from '../../lib/gizmos/interactionStats';
```

**After (using aliases):**
```typescript
import { NarrativeExecutor } from '@/narrative/executor';
import type { GameSessionDTO } from '@/types';
import { interactionStats } from '@/gizmos/interactionStats';
```

**Barrel imports (recommended for public API):**
```typescript
import {
  NarrativeExecutor,
  createProgramProvider,
  createNodeHandlerRegistry
} from '@/narrative';

import type { GameSessionDTO, SceneNode, SceneEdge } from '@/types';

import {
  calculateStatChanges,
  getZoneStatModifiers
} from '@/gizmos';
```

### Configuration

The aliases are configured in three places:

1. **TypeScript** (`tsconfig.base.json`):
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@/narrative/*": ["packages/game/engine/src/narrative/*"],
         "@/narrative": ["packages/game/engine/src/narrative/index.ts"],
         "@/scene/*": ["packages/game/engine/src/narrative/*"],
         "@/scene": ["packages/game/engine/src/narrative/index.ts"],
         "@/gizmos/*": ["apps/main/src/lib/gizmos/*"],
         "@/gizmos": ["apps/main/src/lib/gizmos/index.ts"],
         "@/types/*": ["packages/shared/types/src/*"],
         "@/types": ["packages/shared/types/src/index.ts"]
       }
     }
   }
   ```

2. **Vite** (`apps/main/vite.config.ts`, `apps/game/vite.config.ts`):
   ```typescript
   export default defineConfig({
     resolve: {
       alias: {
         '@/narrative': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
         '@/scene': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
         '@/gizmos': path.resolve(__dirname, './src/lib/gizmos'),
         '@/types': path.resolve(__dirname, '../../packages/shared/types/src'),
       },
     },
   });
   ```

3. **ESLint/other tools**: Inherit from `tsconfig.base.json`

### Barrel Exports

Each aliased domain has an `index.ts` barrel file that exports the public API:

- **`@/narrative`**: Exports narrative executor, node handlers, condition evaluator, effect applicator, logging, generation bridge, runtime integration, and scene integration
- **`@/gizmos`**: Exports surface registry, registration helpers, console integration, tool overrides, and interaction stats
- **`@/types`**: Exports all shared types including game DTOs, scene graph types, generation types, node type registry, and NPC types

Barrel exports help maintain a stable public API and make it clear which modules are intended for external use.

### Best Practices

1. **Prefer barrel imports** for public APIs: `import { X } from '@/narrative'`
2. **Use specific imports** for internal/advanced usage: `import { X } from '@/narrative/executor'`
3. **Avoid barrel re-exports** in your own modules to prevent circular dependencies
4. **Use barrel imports in apps**, use workspace packages (`@pixsim7/*`) in libraries

### Future Domains

Potential future aliases as the codebase evolves:

- `@/simulation/*` - Core simulation logic and state management
- `@/automation/*` - Browser automation and provider integration
- `@/panels/*` - Reusable UI panel components
- `@/console/*` - Console framework and commands
- `@/stores/*` - Shared Zustand stores

## Repository Structure

```
pixsim7/
├── apps/
│   ├── main/          # Main application (scene editor, game runtime)
│   │   └── src/
│   │       └── lib/
│   │           └── gizmos/   # Aliased as @/gizmos
│   └── game/          # Game-specific app
├── packages/
│   ├── game/
│   │   └── engine/
│   │       └── src/
│   │           └── narrative/  # Aliased as @/narrative, @/scene
│   └── shared/
│       └── types/
│           └── src/    # Aliased as @/types
└── docs/
    └── repo-map.md     # This file
```

## Contributing

When adding new files to aliased domains:

1. **Add exports to the barrel** (`index.ts`) if the module is part of the public API
2. **Keep internal modules private** by not exporting them from the barrel
3. **Update this documentation** if you add new domains or change alias mappings
4. **Use the aliases** in your imports to maintain consistency

When adding new domains that would benefit from aliases:

1. Add the path mapping to `tsconfig.base.json`
2. Add the alias to all Vite configs
3. Create or update the barrel export (`index.ts`)
4. Document the alias in this file
5. Consider adding an ESLint rule to enforce alias usage
