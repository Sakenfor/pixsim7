import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';
import { useToast } from '@pixsim7/shared.ui';
import { registerModules, moduleRegistry } from '@app/modules';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Home } from './routes/Home';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AssetsRoute } from './routes/Assets';
import { AssetDetailRoute } from './routes/AssetDetail';
import { GraphRoute } from './routes/Graph';
import { ArcGraphRoute } from './routes/ArcGraph';
import { WorkspaceRoute } from '@features/workspace';
import { GameWorld } from './routes/GameWorld';
import { AutomationRoute } from './routes/Automation';
import { NpcPortraits } from '@features/npcs';
import { Game2D } from './routes/Game2D';
import { NpcBrainLab } from '@features/brainTools';
import { GizmoLab } from './routes/GizmoLab';
import { PluginWorkspaceRoute } from './routes/PluginWorkspace';
import { SimulationPlayground } from './routes/SimulationPlayground';
import { AppMapDev } from './routes/AppMapDev';
import { TemplateAnalyticsDev } from './routes/TemplateAnalyticsDev';
import { InteractionStudio } from './routes/InteractionStudio';
import { InteractionComponentsDemo } from './routes/InteractionComponentsDemo';
import { WidgetBuilderRoute } from './routes/WidgetBuilderRoute';
import { ModulesDev } from './routes/ModulesDev';
import { PromptInspectorDev } from './routes/PromptInspectorDev';
import { DevPromptImporter } from './routes/DevPromptImporter';
import { PromptLabDev } from './routes/PromptLabDev';
import { ActionBlockGraphDev } from './routes/ActionBlockGraphDev';
import { BlockFitDev } from './routes/BlockFitDev';
// OverlayConfig redirects to /dev/widget-builder?surface=overlay
import { ControlCenterManager } from '@features/controlCenter';
import { FloatingPanelsManager } from '@features/panels/components/shared/FloatingPanelsManager';
import { PluginOverlays } from './components/PluginOverlays';
import { PluginManagerUI } from './components/PluginManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer, useTheme } from '@pixsim7/shared.ui';
import { DevToolQuickAccess } from './components/dev/DevToolQuickAccess';
import { useDevToolShortcuts } from './hooks/useDevToolShortcuts';
import { useInitializePanelSystem, panelRegistry } from '@features/panels';
import {
  ContextMenuProvider,
  ContextMenuPortal,
  registerContextMenuActions,
} from '@lib/dockview/contextMenu';
import { PanelPropertiesPopup } from '@lib/dockview/contextMenu';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';
import { ContextHubHost } from '@features/contextHub';
import { ContextHubRootProviders } from '@features/contextHub/components/ContextHubRootProviders';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initializePlugins = usePluginCatalogStore((s) => s.initialize);
  const loadEnabledBundles = usePluginCatalogStore((s) => s.loadEnabledBundles);
  const toast = useToast();

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  // Register dev tool keyboard shortcuts
  useDevToolShortcuts();

  // Initialize panel orchestration system
  useInitializePanelSystem(true);

  useEffect(() => {
    // Initialize all application modules
    // The module system handles all initialization in the correct order:
    // 1. Plugin bootstrap (priority 100) - loads plugins and plugin registry
    // 2. Graph system (priority 75) - registers node types and renderers
    // 3. Game session (priority 75) - registers session helpers
    // 4. Feature modules (priority 50) - registers capabilities for UI features
    registerModules();
    moduleRegistry.initializeAll();

    // Register context menu actions (feature-specific resolvers are registered by their modules)
    registerContextMenuActions();

    // Initialize auth state
    initialize();

    // Cleanup on unmount
    return () => {
      moduleRegistry.cleanupAll();
    };
  }, [initialize, toast]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    initializePlugins()
      .then(() => loadEnabledBundles())
      .catch((error) => {
        console.warn('[Plugins] Failed to initialize plugin catalog:', error);
      });
  }, [isAuthenticated, initializePlugins, loadEnabledBundles]);

  return (
    <BrowserRouter>
      <ContextHubHost hostId="app">
        <ContextHubRootProviders />
        <ContextMenuProvider
          services={{
            workspaceStore: useWorkspaceStore,
            panelRegistry,
          }}
        >
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
            <Route path="/settings/overlays" element={<Navigate to="/dev/widget-builder?surface=overlay" replace />} />
            <Route path="/app-map" element={<ProtectedRoute><AppMapDev /></ProtectedRoute>} />
            <Route path="/template-analytics" element={<ProtectedRoute><TemplateAnalyticsDev /></ProtectedRoute>} />
            <Route path="/interaction-studio" element={<ProtectedRoute><InteractionStudio /></ProtectedRoute>} />
            <Route path="/interaction-demo" element={<ProtectedRoute><InteractionComponentsDemo /></ProtectedRoute>} />
            <Route path="/dev/modules" element={<ProtectedRoute><ModulesDev /></ProtectedRoute>} />
            <Route path="/dev/prompt-inspector" element={<ProtectedRoute><PromptInspectorDev /></ProtectedRoute>} />
            <Route path="/dev/prompt-importer" element={<ProtectedRoute><DevPromptImporter /></ProtectedRoute>} />
            <Route path="/dev/prompt-lab" element={<ProtectedRoute><PromptLabDev /></ProtectedRoute>} />
            <Route path="/dev/action-block-graph" element={<ProtectedRoute><ActionBlockGraphDev /></ProtectedRoute>} />
            <Route path="/dev/block-fit" element={<ProtectedRoute><BlockFitDev /></ProtectedRoute>} />
            <Route path="/dev/widget-builder" element={<ProtectedRoute><WidgetBuilderRoute /></ProtectedRoute>} />
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
          {/* Global context menu portal */}
          <ContextMenuPortal />
          <PanelPropertiesPopup />
        </ContextMenuProvider>
      </ContextHubHost>
    </BrowserRouter>
  );
}

export default App
