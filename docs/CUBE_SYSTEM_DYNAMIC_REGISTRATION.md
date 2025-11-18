
# 🎲 Dynamic Cube Registration Guide

## Overview

The Cube System V2 now uses a **dynamic registry** that allows any module to register cubes. When you add new UI elements to your app, they can automatically appear in the cube system.

## Architecture

### Before (Hardcoded)
```typescript
// ❌ Tightly coupled - must edit CubeSystemV2.tsx
type CubeType = 'creation' | 'timeline' | 'assets'; // Fixed!

const contents = {
  creation: { /* hardcoded */ },
  // Adding new cube requires editing this file
};
```

### After (Dynamic Registry)
```typescript
// ✅ Loosely coupled - register from anywhere
import { cubeRegistry } from './cubeRegistry';

// Any module can register cubes
cubeRegistry.register({ ... });
```

## How To Add New Cubes

### Example 1: Adding an Analytics Cube

When you add a new analytics feature to your app:

```typescript
// In your analytics module: src/modules/analytics/registerCube.ts
import { cubeRegistry } from '@/plugins/ui/cube-system-v2/cubeRegistry';

export function registerAnalyticsCube() {
  cubeRegistry.register({
    id: 'analytics',
    name: 'Analytics',
    description: 'Data analytics and insights',
    color: '#10b981', // Green
    icon: '📊',
    category: 'viewing',
    priority: 60,

    // Show in specific workspaces
    workspaces: ['review'],

    // Only show if user has permission
    visible: () => {
      const user = useAuthStore.getState().user;
      return user?.permissions?.includes('view_analytics');
    },

    faces: {
      front: {
        label: 'Dashboard',
        icon: '📊',
        route: '/analytics',
      },
      top: {
        label: 'Reports',
        icon: '📄',
        route: '/analytics/reports',
      },
      right: {
        label: 'Charts',
        icon: '📈',
        route: '/analytics/charts',
      },
      left: {
        label: 'Data',
        icon: '🗂️',
        route: '/analytics/data',
      },
      bottom: {
        label: 'Export',
        icon: '💾',
        action: () => {
          // Custom export logic
          exportAnalytics();
        },
      },
      back: {
        label: 'Settings',
        icon: '⚙️',
        route: '/analytics/settings',
      },
    },

    // Dynamic state
    getState: () => {
      const isProcessing = analyticsStore.getState().processing;
      return isProcessing ? 'processing' : 'idle';
    },
  });
}
```

Then call it during initialization:
```typescript
// In src/modules/analytics/index.ts
import { registerAnalyticsCube } from './registerCube';

export function initAnalyticsModule() {
  registerAnalyticsCube();
  // ... other init
}
```

### Example 2: Plugin-Registered Cube

A plugin can register its own cube:

```typescript
// In a plugin: plugins/my-plugin/plugin.ts
import { cubeRegistry } from '@/plugins/ui/cube-system-v2/cubeRegistry';

export const plugin: Plugin = {
  async onEnable(api: PluginAPI) {
    // Register a cube when plugin is enabled
    cubeRegistry.register({
      id: 'my-plugin-cube',
      name: 'My Feature',
      description: 'Cool new feature',
      color: '#f59e0b',
      icon: '🚀',
      category: 'utility',

      faces: {
        front: {
          label: 'Feature',
          icon: '🚀',
          action: () => {
            // Use plugin API
            api.ui.showNotification({
              message: 'Feature activated!',
              type: 'success',
            });
          },
        },
        // ... other faces
      },
    });
  },

  async onDisable() {
    // Unregister when disabled
    cubeRegistry.unregister('my-plugin-cube');
  },
};
```

### Example 3: Conditional Cubes

Show cubes only when certain conditions are met:

```typescript
// Feature flag cube
cubeRegistry.register({
  id: 'beta-features',
  name: 'Beta Features',
  description: 'Experimental features',
  color: '#f97316',
  icon: '🧪',
  category: 'utility',

  // Only show if beta features are enabled
  visible: () => {
    return localStorage.getItem('beta-features') === 'true';
  },

  faces: {
    front: {
      label: 'Experiments',
      icon: '🧪',
      route: '/beta',
    },
    // ...
  },
});
```

## Registry API

### Register a Cube
```typescript
cubeRegistry.register(cubeDefinition);
```

### Unregister a Cube
```typescript
cubeRegistry.unregister('cube-id');
```

### Get All Cubes
```typescript
const allCubes = cubeRegistry.getAll();
```

### Get Cubes for Workspace
```typescript
const cubes = cubeRegistry.getForWorkspace('create');
```

### Get Cubes by Category
```typescript
const creationCubes = cubeRegistry.getByCategory('creation');
```

### Subscribe to Changes
```typescript
const unsubscribe = cubeRegistry.subscribe(() => {
  console.log('Cubes changed!');
  updateUI();
});

// Later:
unsubscribe();
```

## Cube Definition Schema

```typescript
interface CubeDefinition {
  // Required
  id: string;              // Unique identifier
  name: string;            // Display name
  description: string;     // Short description
  color: string;           // Hex color (#rrggbb)
  category: 'creation' | 'editing' | 'viewing' | 'management' | 'utility';

  faces: {
    front: CubeFace;
    back: CubeFace;
    top: CubeFace;
    bottom: CubeFace;
    left: CubeFace;
    right: CubeFace;
  };

  // Optional
  icon?: string;           // Emoji or icon
  priority?: number;       // Display order (higher = first)
  workspaces?: string[];   // Which workspaces to show in
  visible?: () => boolean; // Visibility condition
  getState?: () => 'idle' | 'active' | 'processing' | 'connected' | 'error';
}

interface CubeFace {
  label: string;           // Face label
  icon?: string;           // Face icon
  route?: string;          // Navigation route
  action?: () => void;     // Custom action
  component?: ComponentType; // Custom component (future)
}
```

## Categories

Cubes are organized by category:

- **creation** - Content generation, authoring
- **editing** - Editing, manipulation, composition
- **viewing** - Previewing, reviewing, playback
- **management** - Organization, storage, history
- **utility** - Tools, settings, helpers

## Workspaces

Built-in workspaces:
- `create` - Creation-focused layout
- `edit` - Editing-focused layout
- `review` - Review-focused layout

Custom workspaces can be added:
```typescript
// Register custom workspace
workspaceRegistry.register({
  id: 'collaborate',
  name: 'Collaboration Mode',
  layout: 'custom',
});
```

## Dynamic Behavior

### State Management

Cubes can reflect real-time state:

```typescript
cubeRegistry.register({
  id: 'jobs',
  name: 'Jobs',
  // ...
  getState: () => {
    const jobs = jobStore.getState().activeJobs;

    if (jobs.some(j => j.status === 'failed')) return 'error';
    if (jobs.some(j => j.status === 'running')) return 'processing';
    if (jobs.some(j => j.status === 'queued')) return 'active';

    return 'idle';
  },
});
```

The cube will automatically update its appearance based on state.

### Visibility Conditions

```typescript
cubeRegistry.register({
  id: 'admin-panel',
  name: 'Admin',
  // ...
  visible: () => {
    const user = useAuthStore.getState().user;
    return user?.role === 'admin';
  },
});
```

Cube only appears for admins.

## Integration Examples

### Example: Automation Module

```typescript
// modules/automation/cubes.ts
import { cubeRegistry } from '@/plugins/ui/cube-system-v2/cubeRegistry';
import { automationStore } from './store';

export function registerAutomationCubes() {
  cubeRegistry.register({
    id: 'automation',
    name: 'Automation',
    description: 'Workflow automation and scheduling',
    color: '#8b5cf6',
    icon: '⚡',
    category: 'utility',
    workspaces: ['create', 'edit'],

    faces: {
      front: {
        label: 'Workflows',
        icon: '⚡',
        route: '/automation',
      },
      top: {
        label: 'Schedule',
        icon: '📅',
        route: '/automation/schedule',
      },
      right: {
        label: 'Templates',
        icon: '📋',
        route: '/automation/templates',
      },
      left: {
        label: 'History',
        icon: '📜',
        route: '/automation/history',
      },
      bottom: {
        label: 'Triggers',
        icon: '🎯',
        route: '/automation/triggers',
      },
      back: {
        label: 'Settings',
        icon: '⚙️',
        route: '/automation/settings',
      },
    },

    getState: () => {
      const activeWorkflows = automationStore.getState().activeWorkflows;
      return activeWorkflows.length > 0 ? 'processing' : 'idle';
    },
  });
}
```

### Example: Game Module

```typescript
// modules/game/cubes.ts
export function registerGameCubes() {
  // Game World Cube
  cubeRegistry.register({
    id: 'game-world',
    name: 'Game World',
    description: 'Interactive 3D world',
    color: '#22c55e',
    icon: '🎮',
    category: 'viewing',

    faces: {
      front: { label: 'Play', icon: '🎮', route: '/game-world' },
      top: { label: 'Levels', icon: '🗺️', route: '/game-world/levels' },
      right: { label: 'NPCs', icon: '👤', route: '/npc-portraits' },
      left: { label: 'Quests', icon: '📜', route: '/game-world/quests' },
      bottom: { label: 'Inventory', icon: '🎒', route: '/game-world/inventory' },
      back: { label: 'Settings', icon: '⚙️', route: '/game-world/settings' },
    },
  });

  // NPC Brain Lab Cube
  cubeRegistry.register({
    id: 'npc-brain',
    name: 'NPC Brain',
    description: 'AI behavior testing',
    color: '#a855f7',
    icon: '🧠',
    category: 'editing',

    faces: {
      front: { label: 'Lab', icon: '🧠', route: '/npc-brain-lab' },
      top: { label: 'Behaviors', icon: '🎭', route: '/npc-brain-lab/behaviors' },
      right: { label: 'Dialogue', icon: '💬', route: '/npc-brain-lab/dialogue' },
      left: { label: 'Memory', icon: '💾', route: '/npc-brain-lab/memory' },
      bottom: { label: 'Test', icon: '🧪', route: '/npc-brain-lab/test' },
      back: { label: 'Export', icon: '📤', route: '/npc-brain-lab/export' },
    },
  });
}
```

## Benefits

### ✅ Modular
- Each module can register its own cubes
- No central file to edit
- Clean separation of concerns

### ✅ Dynamic
- Cubes appear/disappear based on conditions
- State updates automatically
- Permission-aware

### ✅ Plugin-Friendly
- Plugins can add cubes
- Automatically cleanup on disable
- No core code changes needed

### ✅ Discoverable
- New features automatically visible in 3D space
- Users discover features through exploration
- Visual organization by category/workspace

## Migration From Hardcoded

If you have existing hardcoded cubes:

1. Create a registration file for your module
2. Call `cubeRegistry.register()` for each cube
3. Call the registration function during module init
4. Remove hardcoded cube definitions

Example:
```typescript
// Before: Hardcoded in CubeSystemV2.tsx
const cubes = [
  { id: 'my-cube', ... }, // Hardcoded
];

// After: Registered from module
// modules/my-module/registerCubes.ts
export function registerMyCubes() {
  cubeRegistry.register({
    id: 'my-cube',
    // ...
  });
}

// modules/my-module/index.ts
import { registerMyCubes } from './registerCubes';

export function initMyModule() {
  registerMyCubes();
}
```

## Best Practices

1. **Register during module initialization**
   - Don't register in render functions
   - Register once on startup

2. **Use descriptive IDs**
   - `analytics-dashboard` not `dash1`
   - Helps with debugging

3. **Set appropriate priority**
   - Core features: 80-100
   - Regular features: 50-79
   - Utilities: 20-49

4. **Specify workspaces**
   - Don't clutter every workspace
   - Think about user workflows

5. **Add visibility conditions**
   - Hide premium features for free users
   - Show beta features only when enabled

6. **Cleanup properly**
   - Unregister when module/plugin disables
   - Prevents ghost cubes

## Troubleshooting

### Cube not appearing
- Check `visible()` condition
- Check `workspaces` array
- Verify registration was called
- Check browser console for errors

### Wrong workspace
- Update `workspaces` array
- Leave empty to show everywhere

### State not updating
- Ensure `getState()` accesses reactive store
- Check if store is updating
- Verify no caching issues

---

**The cube system is now fully dynamic and ready to grow with your app!** 🎉
