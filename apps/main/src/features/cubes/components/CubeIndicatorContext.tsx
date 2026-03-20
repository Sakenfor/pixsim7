/**
 * CubeIndicatorContext
 *
 * Provides shared data to dynamically-rendered face components inside the
 * cube indicator widget (MinimizedPanelStack).
 */

import { createContext, useContext } from 'react';

import type { CubeFaceRegistry } from '../lib/cubeFaceRegistry';
import type { ControlCube } from '../useCubeStore';

export interface CubeIndicatorContextValue {
  cubeInstanceId: string;
  panelCubes: ControlCube[];
  onRestore: (cubeId: string) => void;
  onRestoreAll: () => void;
  onClearAll: () => void;
  registry: CubeFaceRegistry;
}

export const CubeIndicatorContext = createContext<CubeIndicatorContextValue | null>(null);

export function useCubeIndicator(): CubeIndicatorContextValue {
  const ctx = useContext(CubeIndicatorContext);
  if (!ctx) throw new Error('useCubeIndicator must be used inside <CubeIndicatorContext.Provider>');
  return ctx;
}
