import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { registerModules, moduleRegistry } from './modules';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Home } from './routes/Home';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AssetsRoute } from './routes/Assets';
import { AssetDetailRoute } from './routes/AssetDetail';
import { GraphRoute } from './routes/Graph';
import { WorkspaceRoute } from './routes/Workspace';
import { ControlCenterDock } from './components/control/ControlCenterDock';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { useTheme } from '@pixsim7/ui';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  useEffect(() => {
    // Initialize modules
    registerModules();
    moduleRegistry.initializeAll();

    // Initialize auth state
    initialize();

    // Cleanup on unmount
    return () => {
      moduleRegistry.cleanupAll();
    };
  }, [initialize]);

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
          <Route path="/workspace" element={<ProtectedRoute><WorkspaceRoute /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {/* Global bottom dock (only when authenticated) */}
      {isAuthenticated && (
        <ErrorBoundary>
          <ControlCenterDock />
        </ErrorBoundary>
      )}
      {/* Global toast notifications */}
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App
