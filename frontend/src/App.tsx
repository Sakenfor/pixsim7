import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useControlCenterStore } from './stores/controlCenterStore';
import { useToast } from './stores/toastStore';
import { registerModules, moduleRegistry } from './modules';
import { registerCubeExpansions } from './lib/registerCubeExpansions';
import { registerBuiltinNodeTypes, registerArcNodeTypes, registerBuiltinHelpers } from './lib/registries';
import { registerBuiltinRenderers } from './lib/graph/builtinRenderers';
import { registerArcRenderers } from './lib/graph/arcRenderers';
import { registerPluginRenderers } from './lib/graph/pluginRenderers';
import { registerRenderersFromNodeTypes } from './lib/graph/autoRegisterRenderers';
import { preloadHighPriorityRenderers } from './lib/graph/rendererBootstrap';
import { registerCustomHelpers } from './lib/game/customHelpers';
import { loadAllPlugins } from './lib/pluginLoader';
import { pluginManager, bootstrapExamplePlugins } from './lib/plugins';
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
import { CubeFormationControlCenter } from './components/control/CubeFormationControlCenter';
import { ControlCenterDock } from './components/control/ControlCenterDock';
import { FloatingPanelsManager } from './components/layout/FloatingPanelsManager';
import { PluginOverlays } from './components/PluginOverlays';
import { PluginManagerUI } from './components/PluginManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { useTheme } from '@pixsim7/ui';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const controlCenterMode = useControlCenterStore((s) => s.mode);
  const toast = useToast();

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  useEffect(() => {
    // Load plugin registry from localStorage
    pluginManager.loadPluginRegistry();

    // Bootstrap plugins (re-enables previously enabled plugins)
    bootstrapExamplePlugins().catch(error => {
      console.error('Failed to bootstrap plugins:', error);
    });

    // Register builtin node types
    registerBuiltinNodeTypes();
    registerArcNodeTypes();

    // Register builtin node renderers
    registerBuiltinRenderers();
    registerArcRenderers();

    // Register plugin node renderers
    registerPluginRenderers();

    // Preload high-priority renderers (priority > 7)
    // This eagerly loads core renderers (video, choice, scene_call, etc.)
    // while leaving rare/heavy renderers lazy-loaded
    preloadHighPriorityRenderers().catch(error => {
      console.error('Failed to preload high-priority renderers:', error);
    });

    // Register session helpers (built-in and custom)
    registerBuiltinHelpers();
    registerCustomHelpers();

    // Load all plugins (node types, helpers, and interactions) from plugins directory
    // Note: This automatically discovers and registers:
    // - Node type plugins from lib/plugins/**/*Node.{ts,tsx} (e.g., seductionNode, questTriggerNode)
    // - Helper plugins from plugins/helpers/**/*.{ts,tsx}
    // - Interaction plugins from plugins/interactions/**/*.{ts,tsx}
    loadAllPlugins({
      verbose: true, // Log plugin loading progress
      strict: false, // Don't throw on individual plugin errors
    });

    // Auto-register renderers from node types (after plugins are loaded)
    // This discovers renderer components and registers them based on the
    // rendererComponent field in NodeTypeDefinition
    registerRenderersFromNodeTypes({
      verbose: true,
      strict: false, // Don't fail if a renderer is missing
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

export default App
