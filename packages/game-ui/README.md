# @pixsim7/game-ui

Shared game UI components and utilities for PixSim7.

## Overview

This package contains reusable game UI components that can be used in both the editor and standalone game player. It eliminates the need for iframe-based embedding and postMessage communication.

## Components

### ScenePlayer

The main scene playback component that handles:
- Video playback and scene graph navigation
- Edge condition evaluation
- Effect application (flags, state management)
- Multi-scene support with call stacks
- Mini-game integration
- Progression mode (multi-step within nodes)

**Usage:**
```tsx
import { ScenePlayer } from '@pixsim7/game-ui';
import type { Scene } from '@pixsim7/types';

function MyComponent({ scene }: { scene: Scene }) {
  return (
    <ScenePlayer
      scene={scene}
      autoAdvance={false}
      onStateChange={(state) => console.log('State updated:', state)}
    />
  );
}
```

**Props:**
- `scene: Scene` - Primary scene to play
- `scenes?: Record<string, Scene>` - Scene bundle for multi-scene support
- `initialState?: Partial<SceneRuntimeState>` - Initial runtime state
- `autoAdvance?: boolean` - Auto-advance through edges (default: false)
- `onStateChange?: (state: SceneRuntimeState) => void` - State change callback

### Mini-Games

#### ReflexMiniGame

A simple reflex test mini-game that measures reaction time.

```tsx
import { ReflexMiniGame } from '@pixsim7/game-ui';

<ReflexMiniGame
  onComplete={(score) => console.log('Score:', score)}
/>
```

## Utilities

### Scene Call Stack Manager

Manages scene call stacks for multi-scene navigation.

```tsx
import { callStackManager, bindParameters } from '@pixsim7/game-ui';

// Push a scene call
callStackManager.pushCall(stack, sceneId, returnNodeId, params);

// Pop a scene call
const call = callStackManager.popCall(stack);

// Bind parameters
const boundNode = bindParameters(node, params);
```

## Dependencies

- `@pixsim7/types` - Shared TypeScript types
- `@pixsim7/ui` - Base UI components (Button, Panel, etc.)
- `react` >= 18 (peer dependency)

## Integration

### In game-frontend

Replace direct imports:
```tsx
// Before
import { ScenePlayer } from '../components/ScenePlayer';

// After
import { ScenePlayer } from '@pixsim7/game-ui';
```

### In main frontend (editor)

Use ScenePlayer directly instead of iframe:

**Before (iframe approach):**
```tsx
<iframe
  ref={iframeRef}
  src="http://localhost:5174"
  title="Game Player"
/>
// + postMessage bridge
```

**After (direct integration):**
```tsx
import { ScenePlayer } from '@pixsim7/game-ui';

<ScenePlayer
  scene={currentScene}
  autoAdvance={false}
/>
```

## Benefits

✅ **No iframe overhead** - Direct React component rendering
✅ **No postMessage complexity** - Direct prop passing and callbacks
✅ **Shared codebase** - Single source of truth for game UI
✅ **Type safety** - Full TypeScript support across packages
✅ **Easier debugging** - All code in same context
✅ **Better performance** - No cross-window communication

## Architecture

```
packages/game-ui/
├── src/
│   ├── components/
│   │   ├── ScenePlayer.tsx         # Main scene player component
│   │   └── minigames/
│   │       └── ReflexMiniGame.tsx  # Reflex test mini-game
│   ├── lib/
│   │   └── sceneCallStack.ts       # Scene call stack utilities
│   └── index.ts                     # Public exports
├── package.json
├── tsconfig.json
└── README.md
```

## Development

Build the package:
```bash
cd packages/game-ui
pnpm build
```

The package is part of the pnpm workspace and will be linked automatically to other packages.

## Migration Guide

See `docs/PHASE3_FRONTEND_SIMPLIFICATION_SUMMARY.md` for full migration details.

## Related

- Phase 3 of `ARCHITECTURE_SIMPLIFICATION_PLAN.md`
- Simplifies frontend architecture
- Removes iframe + postMessage patterns
