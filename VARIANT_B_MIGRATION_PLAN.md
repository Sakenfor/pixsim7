# Variant B Migration Plan

## Overview
Reorganizing PixSim7 frontend from flat structure to namespace-based organization with clear separation between shared, game, and scene concerns.

## Target Structure

```
pixsim7/
├── apps/
│   ├── admin/                      → @pixsim7/frontend.admin
│   └── game/                       → @pixsim7/frontend.game
│
├── packages/
│   ├── shared/
│   │   ├── types/                  → @pixsim7/shared.types
│   │   ├── ui/                     → @pixsim7/shared.ui
│   │   └── config/                 → @pixsim7/shared.config
│   │
│   ├── game/
│   │   ├── engine/                 → @pixsim7/game.engine
│   │   └── components/             → @pixsim7/game.components
│   │
│   └── scene/
│       ├── gizmos/                 → @pixsim7/scene.gizmos
│       ├── shapes/                 → @pixsim7/scene.shapes
│       └── cubes/                  → @pixsim7/scene.cubes
│
└── launcher/                       (Python - stays separate)
```

## File Mappings

### Apps Migration

| Current Path | New Path | New Package Name |
|--------------|----------|------------------|
| `/frontend` | `/apps/admin` | `@pixsim7/frontend.admin` |
| `/game-frontend` | `/apps/game` | `@pixsim7/frontend.game` |

### Shared Packages Migration

| Current Path | New Path | New Package Name |
|--------------|----------|------------------|
| `/packages/types` | `/packages/shared/types` | `@pixsim7/shared.types` |
| `/packages/ui` | `/packages/shared/ui` | `@pixsim7/shared.ui` |
| `/packages/config-tailwind` | `/packages/shared/config` | `@pixsim7/shared.config` |

### Game Packages Migration

| Current Path | New Path | New Package Name |
|--------------|----------|------------------|
| `/packages/game-core` | `/packages/game/engine` | `@pixsim7/game.engine` |
| `/packages/game-ui` | `/packages/game/components` | `@pixsim7/game.components` |

### Scene Packages Migration

| Current Path | New Path | New Package Name |
|--------------|----------|------------------|
| `/packages/scene-gizmos` | `/packages/scene/gizmos` | `@pixsim7/scene.gizmos` |
| `/packages/semantic-shapes` | `/packages/scene/shapes` | `@pixsim7/scene.shapes` |
| `/packages/pixcubes` | `/packages/scene/cubes` | `@pixsim7/scene.cubes` |

## Package Name Changes

### Import Statement Updates

All imports will need to be updated throughout the codebase:

```typescript
// OLD → NEW

// Apps
'@pixsim7/frontend' → '@pixsim7/frontend.admin'
'@pixsim7/game-frontend' → '@pixsim7/frontend.game'

// Shared
'@pixsim7/types' → '@pixsim7/shared.types'
'@pixsim7/ui' → '@pixsim7/shared.ui'
'@pixsim7/config-tailwind' → '@pixsim7/shared.config'

// Game
'@pixsim7/game-core' → '@pixsim7/game.engine'
'@pixsim7/game-ui' → '@pixsim7/game.components'

// Scene
'@pixsim7/scene-gizmos' → '@pixsim7/scene.gizmos'
'@pixsim7/semantic-shapes' → '@pixsim7/scene.shapes'
'pixcubes' → '@pixsim7/scene.cubes'
```

## Migration Steps

### Phase 1: Create New Directory Structure
1. Create `apps/` directory
2. Create `packages/shared/`, `packages/game/`, `packages/scene/` directories

### Phase 2: Move Packages
1. Move shared packages (types, ui, config)
2. Move game packages (engine, components)
3. Move scene packages (gizmos, shapes, cubes)
4. Move frontend apps (admin, game)

### Phase 3: Update Configurations
1. Update all `package.json` files with new names
2. Update all `tsconfig.json` files with new path mappings
3. Update `pnpm-workspace.yaml`
4. Update any vite/build configs

### Phase 4: Update Imports
1. Find all import statements referencing old package names
2. Replace with new namespaced package names
3. Update any dynamic imports or require() statements

### Phase 5: Test & Validate
1. Run `pnpm install` to update workspace
2. Build all packages
3. Test admin app
4. Test game app
5. Verify all imports resolve correctly

## Benefits of This Structure

### Semantic Clarity
- **shared/**: Truly reusable, domain-agnostic code
- **game/**: Game logic and game-specific UI
- **scene/**: 3D scene building tools (spatial/visual)

### Mirrors Backend Structure
```
Backend:  pixsim7.backend.main, pixsim7.backend.generation
Frontend: @pixsim7/frontend.admin, @pixsim7/frontend.game
Shared:   @pixsim7/shared.types, @pixsim7/shared.ui
Game:     @pixsim7/game.engine, @pixsim7/game.components
Scene:    @pixsim7/scene.gizmos, @pixsim7/scene.shapes
```

### Future-Proof
- Easy to add new scene tools (lighting, materials, cameras)
- Clear location for new shared utilities
- Obvious place for game features vs admin features

### Developer Experience
- Imports clearly show what's being used
- Easier to find related code
- Better tooling support with namespaces
- Clearer dependency boundaries

## Rollback Plan

If issues arise:
1. Git branch allows easy revert
2. Old structure is preserved in git history
3. Can cherry-pick specific migrations if needed

## Notes

- All existing functionality remains unchanged
- Only organizational structure changes
- No breaking changes to external APIs
- Build and runtime behavior identical
