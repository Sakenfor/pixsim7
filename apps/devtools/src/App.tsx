import { ToastContainer, useTheme } from '@pixsim7/shared.ui';
import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ProtectedRoute } from '@devtools/mainApp/routes/ProtectedRoute';
import { Login } from '@devtools/mainApp/routes/Login';
import { Register } from '@devtools/mainApp/routes/Register';
import { useAuthStore } from '@devtools/mainApp/authStore';

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

  useTheme();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
