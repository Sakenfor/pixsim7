# @pixsim7/scene-gizmos

Pure TypeScript contracts and registry for the scene gizmo system.

## Purpose

This package provides **UI-agnostic** type definitions and registry functions for interactive scene gizmos. It contains no React components or UI implementation - only types and core logic.

## What's Included

### Type Definitions

```typescript
import type {
  GizmoDefinition,
  GizmoComponentProps,
  SceneGizmoConfig,
  GizmoResult,
  InteractiveTool,
  TouchPattern,
  Vector3D,
} from '@pixsim7/scene-gizmos';
```

### Registry Functions

```typescript
import {
  registerGizmo,
  getGizmo,
  getAllGizmos,
  registerTool,
  getTool,
  getAllTools,
} from '@pixsim7/scene-gizmos';
```

### NPC Preference System

```typescript
import {
  calculateFeedback,
  isToolUnlocked,
  getRecommendedTools,
  PREFERENCE_PRESETS,
} from '@pixsim7/scene-gizmos';
```

## Package Responsibilities

✅ **This package handles:**
- Type definitions for gizmos and tools
- Registry system for gizmo definitions
- Core gizmo logic (no UI)
- NPC preference calculations

❌ **This package does NOT handle:**
- React components (those go in `frontend` or `game-ui`)
- Visual rendering of gizmos
- Application-specific gizmo implementations

## Creating a Custom Gizmo

1. **Define the gizmo type** (using types from this package)
2. **Implement the React component** (in your application, e.g., `frontend`)
3. **Register the gizmo** (using registry functions from this package)

Example:

```typescript
import { registerGizmo, type GizmoDefinition } from '@pixsim7/scene-gizmos';

const myGizmo: GizmoDefinition = {
  id: 'my-gizmo',
  name: 'My Custom Gizmo',
  category: 'interactive',
  description: 'A custom gizmo for my game',
  version: '1.0.0',
  defaultConfig: {
    zones: [
      { id: 'zone1', position: { x: 0, y: 0, z: 0 }, radius: 50 }
    ],
    style: 'my-gizmo',
  },
};

registerGizmo(myGizmo);
```

## Architecture

This package follows a **separation of concerns** pattern:

```
@pixsim7/scene-gizmos (types + registry)
       ↓
@pixsim7/game-ui (generic UI components)
       ↓
frontend (app-specific gizmo implementations + renderers)
```

## Building

```bash
# Build
pnpm build

# Watch mode
pnpm dev
```

## Architecture Decision

See [docs/ADR-GIZMO-ARCHITECTURE.md](../../docs/ADR-GIZMO-ARCHITECTURE.md) for the architectural decision on how gizmos are organized across packages.
