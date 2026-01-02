/**
 * Undo/Redo Hook for Graph Stores
 *
 * Provides unified undo/redo functionality with keyboard shortcuts
 * for all graph stores (scene, arc, collection, campaign).
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { undo, redo, canUndo, canRedo } = useGraphUndo();
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * Keyboard shortcuts:
 * - Ctrl+Z (Cmd+Z on Mac): Undo
 * - Ctrl+Shift+Z (Cmd+Shift+Z on Mac): Redo
 * - Ctrl+Y (Cmd+Y on Mac): Redo (alternative)
 */

import { useCallback, useEffect } from 'react';
import {
  useGraphStore,
  useGraphStoreUndo,
  useGraphStoreRedo,
  useGraphStoreCanUndo,
  useGraphStoreCanRedo,
} from '../stores/graphStore';
import {
  useArcGraphStore,
  useArcGraphStoreUndo,
  useArcGraphStoreRedo,
  useArcGraphStoreCanUndo,
  useArcGraphStoreCanRedo,
} from '../stores/arcGraphStore';
import {
  useSceneCollectionStore,
  useSceneCollectionStoreUndo,
  useSceneCollectionStoreRedo,
  useSceneCollectionStoreCanUndo,
  useSceneCollectionStoreCanRedo,
} from '@domain/sceneCollection';
import {
  useCampaignStore,
  useCampaignStoreUndo,
  useCampaignStoreRedo,
  useCampaignStoreCanUndo,
  useCampaignStoreCanRedo,
} from '@domain/campaign';

/**
 * Hook for graph store undo/redo with keyboard shortcuts
 */
export function useGraphUndo() {
  const undo = useGraphStoreUndo();
  const redo = useGraphStoreRedo();
  const canUndo = useGraphStoreCanUndo();
  const canRedo = useGraphStoreCanRedo();

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo();
    }
  }, [canRedo, redo]);

  return { undo: handleUndo, redo: handleRedo, canUndo, canRedo };
}

/**
 * Hook for arc graph store undo/redo with keyboard shortcuts
 */
export function useArcGraphUndo() {
  const undo = useArcGraphStoreUndo();
  const redo = useArcGraphStoreRedo();
  const canUndo = useArcGraphStoreCanUndo();
  const canRedo = useArcGraphStoreCanRedo();

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo();
    }
  }, [canRedo, redo]);

  return { undo: handleUndo, redo: handleRedo, canUndo, canRedo };
}

/**
 * Hook for scene collection store undo/redo
 */
export function useSceneCollectionUndo() {
  const undo = useSceneCollectionStoreUndo();
  const redo = useSceneCollectionStoreRedo();
  const canUndo = useSceneCollectionStoreCanUndo();
  const canRedo = useSceneCollectionStoreCanRedo();

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo();
    }
  }, [canRedo, redo]);

  return { undo: handleUndo, redo: handleRedo, canUndo, canRedo };
}

/**
 * Hook for campaign store undo/redo
 */
export function useCampaignUndo() {
  const undo = useCampaignStoreUndo();
  const redo = useCampaignStoreRedo();
  const canUndo = useCampaignStoreCanUndo();
  const canRedo = useCampaignStoreCanRedo();

  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo();
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo();
    }
  }, [canRedo, redo]);

  return { undo: handleUndo, redo: handleRedo, canUndo, canRedo };
}

/**
 * Global keyboard shortcut handler for undo/redo
 *
 * This hook sets up global keyboard shortcuts for undo/redo
 * across all graph stores. Use this in your main app component.
 *
 * Keyboard shortcuts:
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z or Ctrl+Y: Redo
 *
 * @param options - Configuration options
 */
export function useGlobalUndoShortcuts(options?: {
  /** Which store to use for shortcuts (default: 'graph') */
  store?: 'graph' | 'arc' | 'collection' | 'campaign';
  /** Whether to enable shortcuts (default: true) */
  enabled?: boolean;
  /** Custom undo callback (overrides store undo) */
  onUndo?: () => void;
  /** Custom redo callback (overrides store redo) */
  onRedo?: () => void;
}) {
  const {
    store = 'graph',
    enabled = true,
    onUndo: customOnUndo,
    onRedo: customOnRedo,
  } = options || {};

  // Get appropriate store hooks based on store option
  const graphUndo = useGraphUndo();
  const arcUndo = useArcGraphUndo();
  const collectionUndo = useSceneCollectionUndo();
  const campaignUndo = useCampaignUndo();

  const activeUndo =
    store === 'graph'
      ? graphUndo
      : store === 'arc'
      ? arcUndo
      : store === 'collection'
      ? collectionUndo
      : campaignUndo;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+Z or Cmd+Z: Undo
      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (customOnUndo) {
          customOnUndo();
        } else {
          activeUndo.undo();
        }
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z: Redo
      if (modifier && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (customOnRedo) {
          customOnRedo();
        } else {
          activeUndo.redo();
        }
      }

      // Ctrl+Y or Cmd+Y: Redo (alternative)
      if (modifier && e.key === 'y') {
        e.preventDefault();
        if (customOnRedo) {
          customOnRedo();
        } else {
          activeUndo.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, store, customOnUndo, customOnRedo, activeUndo]);

  return activeUndo;
}
