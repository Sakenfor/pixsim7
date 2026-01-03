import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';
import { useToast } from '@pixsim7/shared.ui';
import { registerModules, moduleRegistry } from '@app/modules';

// Register modules synchronously at module load time (before any component renders)
// This ensures routes are available on first render
let modulesRegistered = false;
function ensureModulesRegistered() {
  if (!modulesRegistered) {
    registerModules();
    modulesRegistered = true;
  }
}
ensureModulesRegistered();
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Home } from './routes/Home';
import { ProtectedRoute } from './routes/ProtectedRoute';
// Static routes that need special handling (params, redirects, etc.)
const AssetDetailRoute = lazy(() => import('./routes/AssetDetail').then(m => ({ default: m.AssetDetailRoute })));
const PluginManagerUI = lazy(() => import('./components/PluginManager').then(m => ({ default: m.PluginManagerUI })));
const WidgetBuilderRoute = lazy(() => import('./routes/WidgetBuilderRoute').then(m => ({ default: m.WidgetBuilderRoute })));
const PromptInspectorDev = lazy(() => import('./routes/PromptInspectorDev').then(m => ({ default: m.PromptInspectorDev })));
const DevPromptImporter = lazy(() => import('./routes/DevPromptImporter').then(m => ({ default: m.DevPromptImporter })));
const PromptLabDev = lazy(() => import('./routes/PromptLabDev').then(m => ({ default: m.PromptLabDev })));
const ActionBlockGraphDev = lazy(() => import('./routes/ActionBlockGraphDev').then(m => ({ default: m.ActionBlockGraphDev })));
const BlockFitDev = lazy(() => import('./routes/BlockFitDev').then(m => ({ default: m.BlockFitDev })));
const TemplateAnalyticsDev = lazy(() => import('./routes/TemplateAnalyticsDev').then(m => ({ default: m.TemplateAnalyticsDev })));
import { ControlCenterManager } from '@features/controlCenter';
import { FloatingPanelsManager } from '@features/panels/components/shared/FloatingPanelsManager';
import { PluginOverlays } from './components/PluginOverlays';
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

/** Loading fallback for lazy-loaded routes */
function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  );
}

// Get dynamic routes once at module load time (stable reference)
const dynamicRoutes = moduleRegistry
  .getPages({ includeHidden: true })
  .filter(page => page.component);

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
    // Modules are already registered synchronously at module load time
    // Now initialize them (async operations like fetching data, etc.)
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
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {/* Auth routes (not protected) */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Home */}
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

                {/* Dynamic routes from module registry */}
                {dynamicRoutes.map(page => {
                  const Component = page.component!;
                  return (
                    <Route
                      key={page.id}
                      path={page.route}
                      element={<ProtectedRoute><Component /></ProtectedRoute>}
                    />
                  );
                })}

                {/* Static routes with special handling (params, redirects, etc.) */}
                <Route path="/assets/:id" element={<ProtectedRoute><AssetDetailRoute /></ProtectedRoute>} />
                <Route path="/plugins" element={<ProtectedRoute><PluginManagerUI /></ProtectedRoute>} />
                <Route path="/settings/overlays" element={<Navigate to="/dev/widget-builder?surface=overlay" replace />} />
                <Route path="/template-analytics" element={<ProtectedRoute><TemplateAnalyticsDev /></ProtectedRoute>} />
                <Route path="/dev/prompt-inspector" element={<ProtectedRoute><PromptInspectorDev /></ProtectedRoute>} />
                <Route path="/dev/prompt-importer" element={<ProtectedRoute><DevPromptImporter /></ProtectedRoute>} />
                <Route path="/dev/prompt-lab" element={<ProtectedRoute><PromptLabDev /></ProtectedRoute>} />
                <Route path="/dev/action-block-graph" element={<ProtectedRoute><ActionBlockGraphDev /></ProtectedRoute>} />
                <Route path="/dev/block-fit" element={<ProtectedRoute><BlockFitDev /></ProtectedRoute>} />
                <Route path="/dev/widget-builder" element={<ProtectedRoute><WidgetBuilderRoute /></ProtectedRoute>} />

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
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
