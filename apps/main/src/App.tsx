
import { ToastContainer, useTheme } from '@pixsim7/shared.ui';
import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';


import {
  ContextMenuProvider,
  ContextMenuPortal,
} from '@lib/dockview';
import { PanelPropertiesPopup } from '@lib/dockview';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { ContextHubHost } from '@features/contextHub';
import { ContextHubRootProviders } from '@features/contextHub/components/ContextHubRootProviders';
import { ControlCenterManager } from '@features/controlCenter';
import { useInitializePanelSystem } from '@features/panels';
import { FloatingPanelsManager } from '@features/panels/components/shared/FloatingPanelsManager';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';


import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DevToolQuickAccess } from './components/dev/DevToolQuickAccess';
import { PluginOverlays } from './components/PluginOverlays';
import { useActionShortcuts } from './hooks/useActionShortcuts';
import { useDevToolShortcuts } from './hooks/useDevToolShortcuts';
import { useModuleRoutes } from './hooks/useModuleRoutes';
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { Register } from './routes/Register';
import { useAuthStore } from './stores/authStore';

/** Loading fallback for lazy-loaded routes */
function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  );
}


function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initializePlugins = usePluginCatalogStore((s) => s.initialize);
  const loadEnabledBundles = usePluginCatalogStore((s) => s.loadEnabledBundles);

  // Get dynamic routes reactively from module registry
  const dynamicRoutes = useModuleRoutes({ includeHidden: true });

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  // Register dev tool keyboard shortcuts
  useDevToolShortcuts();
  useActionShortcuts(isAuthenticated);

  // Initialize panel orchestration system
  useInitializePanelSystem(true);

  useEffect(() => {
    // Initialize auth state
    initialize();
  }, [initialize]);

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
            panelRegistry: panelSelectors,
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
