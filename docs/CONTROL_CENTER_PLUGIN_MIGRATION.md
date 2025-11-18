# 🎛️ Control Center Plugin Migration Guide

## Overview

All three control centers are now plugins! Users can swap between them freely.

## Architecture

```
Before:
App.tsx (hardcoded)
├── ControlCenterDock
└── CubeFormationControlCenter

After:
App.tsx (minimal)
└── ControlCenterManager
    ├── Dock Plugin (default)
    ├── Cube V1 Plugin
    └── Cube V2 Plugin
```

## Files Created

### Core Architecture
```
frontend/src/lib/plugins/
├── controlCenterPlugin.ts          ✅ Plugin system types & registry
└── bootstrapControlCenters.ts      ✅ Plugin loader

frontend/src/components/control/
└── ControlCenterManager.tsx        ✅ Renderer + Selector UI
```

### Plugins
```
frontend/src/plugins/ui/
├── dock-control-center/
│   └── plugin.ts                   ✅ Dock as plugin
├── cube-formation-v1/
│   └── plugin.ts                   ✅ Original cubes as plugin
└── cube-system-v2/
    ├── plugin.ts                   ✅ New 3D cubes (updated)
    ├── CubeSystemV2.tsx
    └── README.md
```

## Migration Steps

### Step 1: Update App.tsx Imports

**Remove:**
```typescript
import { CubeFormationControlCenter } from './components/control/CubeFormationControlCenter';
import { ControlCenterDock } from './components/control/ControlCenterDock';
```

**Add:**
```typescript
import { ControlCenterManager } from './components/control/ControlCenterManager';
import { bootstrapControlCenters } from './lib/plugins/bootstrapControlCenters';
```

### Step 2: Update useEffect

**Add to useEffect (after pluginManager.loadPluginRegistry()):**
```typescript
// Bootstrap control center plugins
bootstrapControlCenters().catch(error => {
  console.error('Failed to bootstrap control centers:', error);
});
```

### Step 3: Update Control Center Rendering

**Replace this:**
```typescript
{/* Control Center - Dock or Cubes mode (only when authenticated) */}
{isAuthenticated && (
  <ErrorBoundary>
    {controlCenterMode === 'dock' ? (
      <ControlCenterDock />
    ) : (
      <CubeFormationControlCenter />
    )}
  </ErrorBoundary>
)}
```

**With this:**
```typescript
{/* Control Center - Plugin-based (only when authenticated) */}
{isAuthenticated && (
  <ErrorBoundary>
    <ControlCenterManager />
  </ErrorBoundary>
)}
```

### Step 4: Remove Unused Store References (Optional)

The `controlCenterMode` state variable is no longer needed since mode selection is handled by the plugin system:

```typescript
// Can remove this line if not used elsewhere:
const controlCenterMode = useControlCenterStore((s) => s.mode);
```

## Complete App.tsx After Migration

```typescript
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useToast } from './stores/toastStore';
import { registerModules, moduleRegistry } from './modules';
import { registerCubeExpansions } from './lib/registerCubeExpansions';
import { registerBuiltinNodeTypes, registerArcNodeTypes, registerBuiltinHelpers } from './lib/registries';
import { registerBuiltinRenderers } from './lib/graph/builtinRenderers';
import { registerArcRenderers } from './lib/graph/arcRenderers';
import { registerPluginRenderers } from './lib/graph/pluginRenderers';
import { registerCustomHelpers } from './lib/game/customHelpers';
import { loadAllPlugins } from './lib/pluginLoader';
import { pluginManager, bootstrapExamplePlugins } from './lib/plugins';
import { bootstrapControlCenters } from './lib/plugins/bootstrapControlCenters';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Home } from './routes/Home';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AssetsRoute } from './routes/Assets';
import { AssetDetailRoute } from './routes/AssetDetail';
import { GraphRoute } from './routes/Graph';
import { ArcGraphRoute } from './routes/ArcGraph';
import { WorkspaceRoute } from './routes/Workspace';
import { GameWorld } from './routes/GameWorld';
import { AutomationRoute } from './routes/Automation';
import { NpcPortraits } from './routes/NpcPortraits';
import { Game2D } from './routes/Game2D';
import { NpcBrainLab } from './routes/NpcBrainLab';
import { GizmoLab } from './routes/GizmoLab';
import { ControlCenterManager } from './components/control/ControlCenterManager';
import { FloatingPanelsManager } from './components/layout/FloatingPanelsManager';
import { PluginOverlays } from './components/PluginOverlays';
import { PluginManagerUI } from './components/PluginManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { useTheme } from '@pixsim7/ui';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const toast = useToast();

  // Initialize theme
  useTheme();

  useEffect(() => {
    // Load plugin registry from localStorage
    pluginManager.loadPluginRegistry();

    // Bootstrap control center plugins
    bootstrapControlCenters().catch(error => {
      console.error('Failed to bootstrap control centers:', error);
    });

    // Bootstrap other plugins
    bootstrapExamplePlugins().catch(error => {
      console.error('Failed to bootstrap plugins:', error);
    });

    // Register builtin node types
    registerBuiltinNodeTypes();
    registerArcNodeTypes();

    // Register builtin node renderers
    registerBuiltinRenderers();
    registerArcRenderers();
    registerPluginRenderers();

    // Register session helpers
    registerBuiltinHelpers();
    registerCustomHelpers();

    // Load all plugins
    loadAllPlugins({
      verbose: true,
      strict: false,
    });

    // Initialize modules
    registerModules();
    moduleRegistry.initializeAll();

    // Register cube expansions
    registerCubeExpansions();

    // Initialize auth state
    initialize();

    // Cleanup on unmount
    return () => {
      moduleRegistry.cleanupAll();
    };
  }, [initialize, toast]);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/assets" element={<ProtectedRoute><AssetsRoute /></ProtectedRoute>} />
          <Route path="/assets/:id" element={<ProtectedRoute><AssetDetailRoute /></ProtectedRoute>} />
          <Route path="/graph/:id" element={<ProtectedRoute><GraphRoute /></ProtectedRoute>} />
          <Route path="/arc-graph" element={<ProtectedRoute><ArcGraphRoute /></ProtectedRoute>} />
          <Route path="/workspace" element={<ProtectedRoute><WorkspaceRoute /></ProtectedRoute>} />
          <Route path="/automation" element={<ProtectedRoute><AutomationRoute /></ProtectedRoute>} />
          <Route path="/game-2d" element={<ProtectedRoute><Game2D /></ProtectedRoute>} />
          <Route path="/game-world" element={<ProtectedRoute><GameWorld /></ProtectedRoute>} />
          <Route path="/npc-portraits" element={<ProtectedRoute><NpcPortraits /></ProtectedRoute>} />
          <Route path="/npc-brain-lab" element={<ProtectedRoute><NpcBrainLab /></ProtectedRoute>} />
          <Route path="/gizmo-lab" element={<ProtectedRoute><GizmoLab /></ProtectedRoute>} />
          <Route path="/plugins" element={<ProtectedRoute><PluginManagerUI /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Control Center - Plugin-based (only when authenticated) */}
      {isAuthenticated && (
        <ErrorBoundary>
          <ControlCenterManager />
        </ErrorBoundary>
      )}

      {/* Floating panels (only when authenticated) */}
      {isAuthenticated && (
        <ErrorBoundary>
          <FloatingPanelsManager />
        </ErrorBoundary>
      )}

      {/* Global toast notifications */}
      <ToastContainer />

      {/* Plugin overlays (only when authenticated) */}
      {isAuthenticated && (
        <ErrorBoundary>
          <PluginOverlays />
        </ErrorBoundary>
      )}
    </BrowserRouter>
  );
}

export default App;
```

## User Experience

### Swapping Control Centers

**Method 1: Keyboard Shortcut**
- Press `Ctrl+Shift+X` to open the control center selector
- Click the desired control center
- Instantly switches

**Method 2: Quick Switcher**
- Click the "🎛️ Control Center: [name]" button at bottom-left
- Opens the same selector

**Method 3: Settings**
- Go to Settings (future)
- Select preferred control center
- Saved in localStorage

### Available Control Centers

1. **🪟 Dock Mode** (Default)
   - Traditional sliding panel
   - Multi-position (bottom, top, left, right, floating)
   - Keyboard resize
   - Lightweight

2. **🎲 Cube Formation (Original)**
   - 6 formation patterns
   - Animated transitions
   - Draggable cubes
   - Standalone cubes for minimized panels

3. **✨ Cube System V2 (3D)**
   - Revolutionary 3D interface
   - Purpose-driven cubes
   - Smart workspaces
   - WebGL accelerated

### Persistence

User's choice is saved in localStorage:
```
Key: control-center-preference
Value: "dock" | "cubes-v1" | "cubes-v2"
```

## Benefits

### For Users
- ✅ Free choice of interface
- ✅ No forced UI changes
- ✅ Easy switching
- ✅ Preference persisted

### For Developers
- ✅ Clean core (zero control center code in App.tsx)
- ✅ Independent development
- ✅ Easy A/B testing
- ✅ Community can create more

### For the Project
- ✅ Validates plugin architecture
- ✅ Demonstrates extensibility
- ✅ Reduces core complexity
- ✅ Enables innovation

## Testing

After migration:

1. Start the app
2. Should see Dock control center by default
3. Press `Ctrl+Shift+X`
4. Should see 3 options
5. Switch to each one
6. Verify they work
7. Refresh page
8. Should remember choice

## Troubleshooting

### "No Control Center Active" message
- Check that bootstrap runs
- Check browser console for errors
- Verify plugin files exist

### Selector not showing
- Check `Ctrl+Shift+X` works
- Look for bottom-left button
- Verify multiple control centers registered

### Preference not saving
- Check localStorage permissions
- Check browser console
- Try clearing cache

## Future Enhancements

### Phase 2: Settings Integration
- Add to main settings page
- Preview images for each control center
- Feature comparison table

### Phase 3: Community Plugins
- Plugin marketplace
- User-created control centers
- Rating/review system

### Phase 4: Advanced Features
- Per-workspace preferences
- Keyboard shortcut customization
- Theme integration

## Migration Checklist

- [ ] Update App.tsx imports
- [ ] Add bootstrap call to useEffect
- [ ] Replace control center rendering
- [ ] Remove unused state variables
- [ ] Test all 3 control centers
- [ ] Verify persistence works
- [ ] Check keyboard shortcut
- [ ] Test selector UI
- [ ] Verify default is Dock
- [ ] Document for users

---

**Status:** ✅ Implementation Complete
**Next:** Apply migration to App.tsx and test
