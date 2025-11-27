import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useToast } from '@pixsim7/shared.ui';
import { registerModules, moduleRegistry } from './modules';
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
import { PluginWorkspaceRoute } from './routes/PluginWorkspace';
import { SimulationPlayground } from './routes/SimulationPlayground';
import { AppMapDev } from './routes/AppMapDev';
import { TemplateAnalyticsDev } from './routes/TemplateAnalyticsDev';
import { InteractionStudio } from './pages/InteractionStudio';
import { InteractionComponentsDemo } from './pages/InteractionComponentsDemo';
import { ModulesDev } from './routes/ModulesDev';
import { PromptInspectorDev } from './routes/PromptInspectorDev';
import { DevPromptImporter } from './routes/DevPromptImporter';
import { PromptLabDev } from './routes/PromptLabDev';
import { ControlCenterManager } from './components/control/ControlCenterManager';
import { FloatingPanelsManager } from './components/layout/FloatingPanelsManager';
import { PluginOverlays } from './components/PluginOverlays';
import { PluginManagerUI } from './components/PluginManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer, useTheme } from '@pixsim7/shared.ui';
import { DevToolQuickAccess } from './components/dev/DevToolQuickAccess';
import { useDevToolShortcuts } from './hooks/useDevToolShortcuts';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const toast = useToast();

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  // Register dev tool keyboard shortcuts
  useDevToolShortcuts();

  useEffect(() => {
    // Initialize all application modules
    // The module system handles all initialization in the correct order:
    // 1. Plugin bootstrap (priority 100) - loads plugins and plugin registry
    // 2. Graph system (priority 75) - registers node types and renderers
    // 3. Game session (priority 75) - registers session helpers
    // 4. Feature modules (priority 50) - registers capabilities for UI features
    registerModules();
    moduleRegistry.initializeAll();

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
          <Route path="/simulation" element={<ProtectedRoute><SimulationPlayground /></ProtectedRoute>} />
          <Route path="/plugins" element={<ProtectedRoute><PluginManagerUI /></ProtectedRoute>} />
          <Route path="/plugin-workspace" element={<ProtectedRoute><PluginWorkspaceRoute /></ProtectedRoute>} />
          <Route path="/app-map" element={<ProtectedRoute><AppMapDev /></ProtectedRoute>} />
          <Route path="/template-analytics" element={<ProtectedRoute><TemplateAnalyticsDev /></ProtectedRoute>} />
          <Route path="/interaction-studio" element={<ProtectedRoute><InteractionStudio /></ProtectedRoute>} />
          <Route path="/interaction-demo" element={<ProtectedRoute><InteractionComponentsDemo /></ProtectedRoute>} />
          <Route path="/dev/modules" element={<ProtectedRoute><ModulesDev /></ProtectedRoute>} />
          <Route path="/dev/prompt-inspector" element={<ProtectedRoute><PromptInspectorDev /></ProtectedRoute>} />
          <Route path="/dev/prompt-importer" element={<ProtectedRoute><DevPromptImporter /></ProtectedRoute>} />
          <Route path="/dev/prompt-lab" element={<ProtectedRoute><PromptLabDev /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {/* Control Center - plugin-based (only when authenticated) */}
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
      {/* Dev tool quick access modal (Ctrl+Shift+D) */}
      {isAuthenticated && <DevToolQuickAccess />}
    </BrowserRouter>
  );
}

export default App
