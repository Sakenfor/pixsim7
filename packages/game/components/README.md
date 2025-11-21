# @pixsim7/game-ui

Generic, reusable game UI components for the Pixsim7 project.

## Purpose

This package provides **application-agnostic** UI components that can be reused across different parts of the Pixsim7 ecosystem (editor, game player, etc.).

## Architecture Principles

1. **Generic and Reusable**: Components in this package should not be tightly coupled to any specific application
2. **No Parent Dependencies**: This package **never** imports from consuming applications (like `frontend`)
3. **Clean Package Boundaries**: Maintains clear separation between reusable library code and application-specific code

## What Belongs Here

✅ **Should be in game-ui:**
- Generic scene player components
- Reusable mini-game frameworks (like ReflexMiniGame)
- Shared game UI utilities
- Components that could be used in multiple applications

❌ **Should NOT be in game-ui:**
- Application-specific implementations (belongs in `frontend`)
- Components that import from `frontend` or other consuming apps
- Highly specialized components tied to specific game mechanics

## Exported Components

### ScenePlayer
Main component for playing game scenes.

```tsx
import { ScenePlayer } from '@pixsim7/game-ui';

<ScenePlayer
  sceneData={sceneData}
  onComplete={handleComplete}
/>
```

### ReflexMiniGame
Generic reflex-based mini-game component.

```tsx
import { ReflexMiniGame } from '@pixsim7/game-ui';

<ReflexMiniGame
  onSuccess={handleSuccess}
  difficulty="medium"
/>
```

## Dependencies

- `@pixsim7/game.engine` - Core game logic and types
- `@pixsim7/types` - Shared type definitions
- `@pixsim7/ui` - Base UI components
- `react` / `react-dom` - UI framework (peer dependencies)

## Development

```bash
# Build the package
pnpm build

# Watch mode
pnpm dev
```

## Architecture Decision

See [docs/ADR-GIZMO-ARCHITECTURE.md](../../docs/ADR-GIZMO-ARCHITECTURE.md) for the decision to move gizmo-specific components to the frontend application.
