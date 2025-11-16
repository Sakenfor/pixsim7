// Re-export CubeErrorBoundary from pixcubes with pixsim7-specific logging
import { CubeErrorBoundary as BaseCubeErrorBoundary } from 'pixcubes';
import { logEvent } from '../../lib/logging';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  cubeId?: string;
}

/**
 * PixSim7-specific wrapper for CubeErrorBoundary that integrates with our logging system.
 */
export function CubeErrorBoundary({ children, fallback, cubeId }: Props) {
  return (
    <BaseCubeErrorBoundary
      cubeId={cubeId}
      fallback={fallback}
      onError={(error, errorInfo, cubeId) => {
        // Log error to backend for monitoring
        logEvent('ERROR', 'cube_expansion_error', {
          cubeId,
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      {children}
    </BaseCubeErrorBoundary>
  );
}

// Re-export the base component for cases where custom error handling is needed
export { CubeErrorBoundary as BaseCubeErrorBoundary } from 'pixcubes';
