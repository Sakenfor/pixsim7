
import { ToastContainer } from '@pixsim7/shared.ui';
import { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';


import {
  ContextMenuProvider,
  ContextMenuPortal,
  PanelPropertiesPopup,
} from '@lib/dockview';
import { useContentInset } from '@lib/layout/edgeInsets';
import { panelSelectors } from '@lib/plugins/catalogSelectors';


import { useApplyAppearance } from '@features/appearance';
import { ContextHubHost } from '@features/contextHub/components/ContextHubHost';
import { ContextHubRootProviders } from '@features/contextHub/components/ContextHubRootProviders';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { moduleRegistry } from '@app/modules';


import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ExternalMediaViewer } from './components/ExternalMediaViewer';
import { ActivityBar } from './components/navigation/ActivityBar';
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

const LazyControlCenterManager = lazy(() =>
  import('@features/controlCenter/components/ControlCenterManager').then((moduleValue) => ({
    default: moduleValue.ControlCenterManager,
  }))
);

const LazyFloatingPanelsManager = lazy(() =>
  import('@features/panels/components/shared/FloatingPanelsManager').then((moduleValue) => ({
    default: moduleValue.FloatingPanelsManager,
  }))
);

const LazyCubeWidgetOverlay = lazy(() =>
  import('@features/cubes/CubeWidgetOverlay').then((moduleValue) => ({
    default: moduleValue.CubeWidgetOverlay,
  }))
);

const LazyPluginOverlays = lazy(() =>
  import('./components/PluginOverlays').then((moduleValue) => ({
    default: moduleValue.PluginOverlays,
  }))
);

const LazyDevToolQuickAccess = lazy(() =>
  import('./components/dev/DevToolQuickAccess').then((moduleValue) => ({
    default: moduleValue.DevToolQuickAccess,
  }))
);

function ModuleInitializationBoundary({
  moduleIds,
  children,
}: {
  moduleIds: string[];
  children: React.ReactNode;
}) {
  const moduleIdsKey = moduleIds.join('|');
  const [ready, setReady] = useState(() =>
    moduleIds.every((moduleId) => moduleRegistry.isModuleInitialized(moduleId))
  );

  useEffect(() => {
    setReady(moduleIds.every((moduleId) => moduleRegistry.isModuleInitialized(moduleId)));
  }, [moduleIdsKey]);

  useEffect(() => {
    if (ready) {
      return;
    }

    let active = true;
    const initializeModules = async () => {
      for (const moduleId of moduleIds) {
        await moduleRegistry.initializeModule(moduleId);
      }
    };

    void initializeModules()
      .catch((error) => {
        console.warn(`[App] Failed to initialize route modules (${moduleIdsKey})`, error);
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [moduleIdsKey, ready]);

  if (!ready) {
    return <RouteLoadingFallback />;
  }

  return <>{children}</>;
}


function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const leftInset = useContentInset('left');
  const rightInset = useContentInset('right');
  const topInset = useContentInset('top');
  const bottomInset = useContentInset('bottom');

  // Get dynamic routes reactively from module registry
  const dynamicRoutes = useModuleRoutes({ includeHidden: true });

  // Apply appearance settings (dark mode, accent color)
  useApplyAppearance();

  // Register dev tool keyboard shortcuts
  useDevToolShortcuts();
  useActionShortcuts(isAuthenticated);

  useEffect(() => {
    // Initialize auth state
    if (!isAuthenticated) {
      initialize();
    }
  }, [initialize, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let active = true;
    void import('@/stores/pluginCatalogStore')
      .then(({ usePluginCatalogStore }) => usePluginCatalogStore.getState().initialize())
      .catch((error) => {
        if (active) {
          console.warn('[Plugins] Failed to initialize plugin catalog:', error);
        }
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

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
          {isAuthenticated && <ActivityBar />}
          <div
            className="min-h-screen flex flex-col transition-[margin] duration-200"
            style={isAuthenticated ? {
              marginLeft: leftInset,
              marginRight: rightInset,
              marginTop: topInset,
              marginBottom: bottomInset,
            } : undefined}
          >
            <ErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  {/* Auth routes (not protected) */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  {/* Home */}
                  <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

                  {/* Dynamic routes from module registry */}
                  {dynamicRoutes.map(page => {
                    if (!page.component) return null;
                    const Component = page.component;
                    const moduleIds = Array.from(
                      new Set(
                        [page.id, page.featureId].filter(
                          (value): value is string =>
                            typeof value === 'string' && value.length > 0
                        )
                      )
                    );
                    return (
                      <Route
                        key={page.id}
                        path={page.route}
                        element={
                          <ProtectedRoute>
                            <ModuleInitializationBoundary moduleIds={moduleIds}>
                              <Component />
                            </ModuleInitializationBoundary>
                          </ProtectedRoute>
                        }
                      />
                    );
                  })}

                  {/* Catch-all redirect */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
          {/* Control Center - plugin-based (only when authenticated) */}
          {isAuthenticated && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <LazyControlCenterManager />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* Floating panels (only when authenticated) */}
          {isAuthenticated && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <LazyFloatingPanelsManager />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* Cube widget overlay (only when authenticated) */}
          {isAuthenticated && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <LazyCubeWidgetOverlay />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* External media viewer (extension → frontend, no auth needed) */}
          <ExternalMediaViewer />
          {/* Global toast notifications */}
          <ToastContainer />
          {/* Plugin overlays (only when authenticated) */}
          {isAuthenticated && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <LazyPluginOverlays />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* Dev tool quick access modal (Ctrl+Shift+D) */}
          {isAuthenticated && (
            <Suspense fallback={null}>
              <LazyDevToolQuickAccess />
            </Suspense>
          )}
          {/* Global context menu portal */}
          <ContextMenuPortal />
          <PanelPropertiesPopup />
        </ContextMenuProvider>
      </ContextHubHost>
    </BrowserRouter>
  );
}

export default App
