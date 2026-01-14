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
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { Login } from '@/routes/Login';
import { Register } from '@/routes/Register';
import { useAuthStore } from '@/stores/authStore';
import { usePluginCatalogStore } from '@/stores/pluginCatalogStore';

import { DevtoolsHome } from './DevtoolsHome';
import { devtoolsRoutes } from './devtoolsRoutes';

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  );
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initializePlugins = usePluginCatalogStore((s) => s.initialize);
  const loadEnabledBundles = usePluginCatalogStore((s) => s.loadEnabledBundles);

  useTheme();

  useEffect(() => {
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
      <ContextHubHost hostId="devtools">
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
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DevtoolsHome />
                    </ProtectedRoute>
                  }
                />

                {devtoolsRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<ProtectedRoute>{route.element}</ProtectedRoute>}
                  />
                ))}

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
          <ToastContainer />
          <ContextMenuPortal />
          <PanelPropertiesPopup />
        </ContextMenuProvider>
      </ContextHubHost>
    </BrowserRouter>
  );
}
