# 🎯 App Capability Registry

## Problem Statement

**Before:** UI plugins had hardcoded knowledge of app features
```typescript
// CubeV2 plugin - hardcoded ❌
const cubes = [
  { id: 'assets', route: '/assets' }, // What if route changes?
  { id: 'workspace', route: '/workspace' }, // What if feature is disabled?
  { id: 'generation', /* ... */ }, // How to know if user has permission?
];
```

**Issues:**
- Tight coupling between plugins and app
- Breaks when routes change
- Can't discover new features automatically
- No permission awareness
- No state awareness

## Solution: Capability Registry

**After:** App exposes capabilities, plugins discover them dynamically
```typescript
// CubeV2 plugin - dynamic ✅
const features = useFeatures(); // Automatically gets all features
features.forEach(feature => {
  // Create cube from feature metadata
  createCube({
    id: feature.id,
    name: feature.name,
    routes: feature.routes,
    actions: feature.actions,
    // All discovered automatically!
  });
});
```

## Architecture

```
┌──────────────────────────────────────────┐
│          App Capability Registry          │
├──────────────────────────────────────────┤
│  Features │ Routes │ Actions │ States    │
│     ↓          ↓         ↓         ↓     │
│  Exposed through standardized interface  │
└──────────────────────────────────────────┘
         ↑           ↑            ↑
         │           │            │
    ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
    │ CubeV2  │ │ Command │ │ Custom  │
    │ Plugin  │ │ Palette │ │ UI      │
    └─────────┘ └─────────┘ └─────────┘
```

## Core Concepts

### 1. Feature Capability
A high-level feature of the app (Assets, Workspace, Game, etc.)

```typescript
interface FeatureCapability {
  id: string;           // 'assets', 'workspace', etc.
  name: string;         // 'Assets'
  description: string;  // 'Asset library and management'
  icon: string;         // '📦'
  category: 'creation' | 'editing' | 'viewing' | 'management' | 'utility' | 'game';
  priority: number;     // For ordering
  routes: Route[];      // Associated routes
  actions: Action[];    // Available actions
  enabled: () => boolean; // Dynamic availability
  permissions: string[]; // Required permissions
}
```

### 2. Route Capability
A navigable page/route

```typescript
interface RouteCapability {
  path: string;         // '/assets'
  name: string;         // 'Asset Gallery'
  description: string;  // 'Browse all assets'
  icon: string;         // '📦'
  protected: boolean;   // Requires auth
  showInNav: boolean;   // Show in navigation
  featureId: string;    // Parent feature
}
```

### 3. Action Capability
An executable action/command

```typescript
interface ActionCapability {
  id: string;           // 'assets.upload'
  name: string;         // 'Upload Asset'
  description: string;  // 'Upload a new asset'
  icon: string;         // '📤'
  shortcut: string;     // 'Ctrl+U'
  execute: () => void;  // Action handler
  enabled: () => boolean; // Dynamic availability
  category: string;     // 'assets'
  featureId: string;    // Parent feature
}
```

### 4. State Capability
Accessible app state

```typescript
interface StateCapability {
  id: string;               // 'workspace.panels'
  name: string;             // 'Open Panels'
  getValue: () => any;      // Get current value
  subscribe: (cb) => void;  // Listen to changes
  readonly: boolean;        // Can't be modified
}
```

## How Modules Expose Themselves

### Example: Assets Module

```typescript
// modules/assets/registerCapabilities.ts
import { registerCompleteFeature } from '@/lib/capabilities';

export function registerAssetsCapabilities() {
  registerCompleteFeature({
    feature: {
      id: 'assets',
      name: 'Assets',
      description: 'Asset library and media management',
      icon: '📦',
      category: 'management',
      priority: 90,
    },
    routes: [
      {
        path: '/assets',
        name: 'Asset Gallery',
        icon: '📦',
        protected: true,
        showInNav: true,
      },
      {
        path: '/assets/:id',
        name: 'Asset Detail',
        icon: '🔍',
        protected: true,
      },
    ],
    actions: [
      {
        id: 'assets.open-gallery',
        name: 'Open Gallery',
        icon: '📦',
        shortcut: 'Ctrl+Shift+A',
        execute: () => {
          window.location.href = '/assets';
        },
      },
      {
        id: 'assets.upload',
        name: 'Upload Asset',
        icon: '📤',
        execute: () => openUploadDialog(),
      },
    ],
    states: [
      {
        id: 'assets.count',
        name: 'Asset Count',
        getValue: () => assetsStore.getState().assets.length,
        readonly: true,
      },
    ],
  });
}
```

### Example: Game Module

```typescript
// modules/game/registerCapabilities.ts
export function registerGameCapabilities() {
  registerCompleteFeature({
    feature: {
      id: 'game',
      name: 'Game World',
      description: 'Interactive game world',
      icon: '🎮',
      category: 'game',
      priority: 70,

      // Only show if game is enabled
      enabled: () => {
        return config.features.gameEnabled;
      },

      // Requires game permission
      permissions: ['play_game'],
    },
    routes: [
      {
        path: '/game-world',
        name: 'Game World',
        icon: '🌍',
        protected: true,
        showInNav: true,
      },
      {
        path: '/npc-brain-lab',
        name: 'NPC Brain Lab',
        icon: '🧠',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'game.enter-world',
        name: 'Enter Game',
        icon: '🎮',
        execute: () => {
          window.location.href = '/game-world';
        },
      },
    ],
    states: [
      {
        id: 'game.active',
        name: 'Game Active',
        getValue: () => gameStore.getState().isPlaying,
        subscribe: (callback) => {
          return gameStore.subscribe(
            (state) => state.isPlaying,
            callback
          );
        },
      },
    ],
  });
}
```

## How Plugins Consume Capabilities

### Example: CubeV2 Using Capabilities

```typescript
// plugins/ui/cube-system-v2/CubeSystemV2Dynamic.tsx
import { useFeatures, useActions } from '@/lib/capabilities';

export function CubeSystemV2Dynamic() {
  // Automatically discover all features
  const features = useFeatures();

  // Convert features to cubes dynamically
  const cubes = features.map(feature => ({
    id: feature.id,
    name: feature.name,
    color: getCategoryColor(feature.category),
    icon: feature.icon,

    // Map feature routes to cube faces
    faces: {
      front: {
        label: feature.name,
        icon: feature.icon,
        route: feature.routes?.[0]?.path,
      },
      top: feature.routes?.[1] ? {
        label: feature.routes[1].name,
        route: feature.routes[1].path,
      } : undefined,
      // ... map other routes to other faces
    },

    // Use feature state for cube state
    getState: () => {
      if (feature.getState) {
        const state = feature.getState();
        return state.processing ? 'processing' : 'idle';
      }
      return 'idle';
    },
  }));

  return <CubeScene cubes={cubes} />;
}
```

### Example: Command Palette

```typescript
// components/CommandPalette.tsx
import { useActions } from '@/lib/capabilities';

export function CommandPalette() {
  const actions = useActions(); // Get all registered actions

  return (
    <div>
      {actions.map(action => (
        <CommandItem
          key={action.id}
          icon={action.icon}
          label={action.name}
          description={action.description}
          shortcut={action.shortcut}
          onSelect={() => action.execute()}
          disabled={action.enabled && !action.enabled()}
        />
      ))}
    </div>
  );
}
```

### Example: Navigation Menu

```typescript
// components/NavigationMenu.tsx
import { useRoutes } from '@/lib/capabilities';

export function NavigationMenu() {
  const routes = useRoutes(); // Get all routes

  const navRoutes = routes.filter(r => r.showInNav);

  return (
    <nav>
      {navRoutes.map(route => (
        <NavItem
          key={route.path}
          href={route.path}
          icon={route.icon}
          label={route.name}
        />
      ))}
    </nav>
  );
}
```

## Benefits

### For App Modules
- ✅ **Declarative** - Describe what you provide
- ✅ **Discoverable** - Automatically exposed to plugins
- ✅ **Maintainable** - Single place to define capabilities
- ✅ **Flexible** - Add/remove features dynamically

### For UI Plugins
- ✅ **Dynamic** - No hardcoded app knowledge
- ✅ **Resilient** - Works even when app changes
- ✅ **Permission-aware** - Only shows allowed features
- ✅ **State-aware** - Real-time updates

### For Users
- ✅ **Consistent** - All UIs show same features
- ✅ **Up-to-date** - New features appear automatically
- ✅ **Secure** - Only see permitted features

## Integration Steps

### 1. Modules Register Capabilities

```typescript
// In each module's initialization
export function initAssetsModule() {
  registerAssetsCapabilities();
  // ... other init
}
```

### 2. App Calls Registrations

```typescript
// In App.tsx useEffect
import { registerCoreFeatures } from '@/lib/capabilities/registerCoreFeatures';

useEffect(() => {
  // Register all core features
  registerCoreFeatures();

  // ... rest of initialization
}, []);
```

### 3. Plugins Consume Capabilities

```typescript
// In plugin
import { useFeatures } from '@/lib/capabilities';

export const plugin: Plugin = {
  async onEnable(api) {
    const features = useFeatures();

    // Build UI dynamically from features
    features.forEach(feature => {
      addFeatureToUI(feature);
    });
  },
};
```

## Advanced Usage

### Dynamic Feature Availability

```typescript
registerCompleteFeature({
  feature: {
    id: 'premium-analytics',
    name: 'Analytics',
    // Only available for premium users
    enabled: () => {
      const user = useAuthStore.getState().user;
      return user?.subscription === 'premium';
    },
    permissions: ['view_analytics'],
  },
  // ...
});
```

### State Subscriptions

```typescript
// UI plugin subscribing to app state
const stateCapability = useCapabilityStore.getState().getState('workspace.panels');

if (stateCapability?.subscribe) {
  stateCapability.subscribe((panels) => {
    console.log('Panels changed:', panels);
    updateUI(panels);
  });
}
```

### Action Execution

```typescript
// Execute action from anywhere
import { useCapabilityStore } from '@/lib/capabilities';

function handleShortcut(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'g') {
    useCapabilityStore.getState().executeAction('generation.quick-generate');
  }
}
```

## Comparison

### Before (Hardcoded)
```typescript
// ❌ Plugin must know all details
const cubes = [
  { id: 'assets', name: 'Assets', route: '/assets', icon: '📦' },
  { id: 'workspace', name: 'Workspace', route: '/workspace', icon: '🎬' },
  // Must update when app changes
];
```

### After (Capability Registry)
```typescript
// ✅ Plugin discovers dynamically
const features = useFeatures();
const cubes = features.map(autoConvert);
// Works even when new features are added!
```

## Future Enhancements

- **UI Contribution Points** - Let plugins add to menus, toolbars
- **Keyboard Shortcut Registry** - Centralized shortcut management
- **Context Menu Registry** - Right-click menu items
- **Status Bar Registry** - Status bar contributions
- **View Registry** - Custom views and panels

---

**The app is now a platform that exposes itself to plugins!** 🎉
