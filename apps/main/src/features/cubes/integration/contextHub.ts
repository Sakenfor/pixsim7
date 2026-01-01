/**
 * Cubes Context Hub Integration
 *
 * Allows cubes to consume and provide context through the Context Hub system.
 */

import { useCallback } from 'react';
import { useCubeStore } from '../useCubeStore';
import type { CubeType, FormationPattern } from '@pixsim7/pixcubes';
import {
  getCubesVisibility,
  getFormation,
  setFormation,
  setCubesVisibility,
  subscribeToVisibility,
  subscribeToFormation,
} from './capabilities';
import {
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
} from '@features/contextHub';

// Capability key for cube context
export const CAP_CUBE_CONTEXT = 'cubeContext' as const;

/**
 * Cube context data exposed to other features
 */
export interface CubeContext {
  /** Whether cubes are visible */
  visible: boolean;

  /** Current formation pattern */
  formation: FormationPattern;

  /** Number of active cubes */
  cubeCount: number;

  /** IDs of all cubes */
  cubeIds: string[];

  /** Active/focused cube ID */
  activeCubeId: string | null;

  /** Actions */
  actions: {
    /** Toggle visibility */
    toggle: () => void;

    /** Set visibility */
    setVisible: (visible: boolean) => void;

    /** Set formation */
    setFormation: (formation: FormationPattern) => void;

    /** Add a cube */
    addCube: (type: CubeType, position?: { x: number; y: number }) => string;

    /** Remove a cube */
    removeCube: (id: string) => void;

    /** Clear all cubes */
    clearAll: () => void;
  };
}

/**
 * Get current cube context
 */
export function getCubeContext(): CubeContext {
  const store = useCubeStore.getState();
  const cubeIds = Object.keys(store.cubes);

  return {
    visible: getCubesVisibility(),
    formation: getFormation(),
    cubeCount: cubeIds.length,
    cubeIds,
    activeCubeId: null, // Could be tracked if needed

    actions: {
      toggle: () => setCubesVisibility(!getCubesVisibility()),
      setVisible: setCubesVisibility,
      setFormation: setFormation,
      addCube: (type, position) => store.addCube(type, position),
      removeCube: (id) => store.removeCube(id),
      clearAll: () => store.clearCubes(),
    },
  };
}

/**
 * Subscribe to cube context changes
 */
export function subscribeToCubeContext(callback: (context: CubeContext) => void): () => void {
  const notify = () => callback(getCubeContext());

  // Subscribe to all relevant changes
  const unsubVisibility = subscribeToVisibility(notify);
  const unsubFormation = subscribeToFormation(notify);
  const unsubStore = useCubeStore.subscribe(notify);

  return () => {
    unsubVisibility();
    unsubFormation();
    unsubStore();
  };
}

/**
 * Hook to use cube context in components
 */
export function useCubeContext(): CubeContext {
  const store = useCubeStore();

  return {
    visible: getCubesVisibility(),
    formation: getFormation(),
    cubeCount: Object.keys(store.cubes).length,
    cubeIds: Object.keys(store.cubes),
    activeCubeId: null,

    actions: {
      toggle: useCallback(() => setCubesVisibility(!getCubesVisibility()), []),
      setVisible: setCubesVisibility,
      setFormation: setFormation,
      addCube: store.addCube,
      removeCube: store.removeCube,
      clearAll: store.clearCubes,
    },
  };
}

/**
 * Hook to consume asset selection in cubes
 * When an asset is selected elsewhere, cubes can react to it
 */
export function useCubeAssetBinding(options?: {
  /** Create a cube when an asset is selected */
  createCubeOnSelect?: boolean;
  /** Cube type to create */
  cubeType?: CubeType;
}) {
  const addCube = useCubeStore((s) => s.addCube);
  const updateCube = useCubeStore((s) => s.updateCube);

  // This would integrate with the context hub's asset selection
  // For now, return helpers that can be used when context hub provides asset selection
  return {
    /**
     * Handle asset selection from context hub
     */
    onAssetSelected: useCallback(
      (assetId: string, position?: { x: number; y: number }) => {
        if (options?.createCubeOnSelect) {
          const cubeId = addCube(options.cubeType || 'asset', position);
          // Could store assetId in cube metadata if needed
          return cubeId;
        }
        return null;
      },
      [addCube, options?.createCubeOnSelect, options?.cubeType]
    ),
  };
}

/**
 * Context Hub descriptor for cube context
 */
export const cubeContextDescriptor = {
  key: CAP_CUBE_CONTEXT,
  name: 'Cube Context',
  description: 'Provides access to cube overlay state and actions',
  getValue: getCubeContext,
  subscribe: subscribeToCubeContext,
};

/**
 * Register cube context with the context hub
 */
export function registerCubeContextHub(): void {
  registerCapabilityDescriptor({
    key: CAP_CUBE_CONTEXT,
    label: 'Cube Context',
    description: 'Provides access to cube overlay state and actions',
    kind: 'state',
    source: 'cubes',
  });
  console.log('[cubes] Registered context hub descriptor');
}

/**
 * Unregister cube context from the context hub
 */
export function unregisterCubeContextHub(): void {
  unregisterCapabilityDescriptor(CAP_CUBE_CONTEXT);
}
