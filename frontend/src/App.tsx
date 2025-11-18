import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useControlCenterStore } from './stores/controlCenterStore';
import { registerModules, moduleRegistry } from './modules';
import { registerCubeExpansions } from './lib/registerCubeExpansions';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Home } from './routes/Home';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AssetsRoute } from './routes/Assets';
import { AssetDetailRoute } from './routes/AssetDetail';
import { GraphRoute } from './routes/Graph';
import { WorkspaceRoute } from './routes/Workspace';
import { GameWorld } from './routes/GameWorld';
import { AutomationRoute } from './routes/Automation';
import { NpcPortraits } from './routes/NpcPortraits';
import { Game2D } from './routes/Game2D';
import { NpcBrainLab } from './routes/NpcBrainLab';
import { CubeFormationControlCenter } from './components/control/CubeFormationControlCenter';
import { ControlCenterDock } from './components/control/ControlCenterDock';
import { FloatingPanelsManager } from './components/layout/FloatingPanelsManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { useTheme } from '@pixsim7/ui';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const controlCenterMode = useControlCenterStore((s) => s.mode);

  // Initialize theme (applies saved theme or system preference)
  useTheme();

  useEffect(() => {
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
          <Route path="/automation" element={<ProtectedRoute><AutomationRoute /></ProtectedRoute>} />
          <Route path="/game-2d" element={<ProtectedRoute><Game2D /></ProtectedRoute>} />
          <Route path="/game-world" element={<ProtectedRoute><GameWorld /></ProtectedRoute>} />
          <Route path="/npc-portraits" element={<ProtectedRoute><NpcPortraits /></ProtectedRoute>} />
          <Route path="/npc-brain-lab" element={<ProtectedRoute><NpcBrainLab /></ProtectedRoute>} />
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
    </BrowserRouter>
  );
}

export default App
