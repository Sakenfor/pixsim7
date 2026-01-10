/**
 * useOverlayShortcuts
 *
 * Hook for handling keyboard shortcuts for overlay modes.
 * Manages escape to exit, drawing mode switching, and overlay toggles.
 */

import { useEffect, useCallback } from 'react';

import { useAssetRegionStore, useAssetViewerOverlayStore } from '@features/mediaViewer';

import type { MediaOverlayHostState } from '../../overlays';

export interface UseOverlayShortcutsOptions {
  /** Current overlay mode (from useMediaOverlayHost) */
  overlayMode: string;
  /** Whether annotation mode is active */
  annotationMode: boolean;
  /** Overlay host state for toggle and shortcut lookup */
  overlayHostState: Pick<MediaOverlayHostState, 'toggleOverlay' | 'getOverlayForShortcut'>;
  /** Callback when an overlay is toggled */
  onToggleOverlay?: (id: string, entering: boolean) => void;
}

/**
 * Hook for overlay keyboard shortcut handling.
 *
 * Handles:
 * - Escape: exit overlay mode or deselect region
 * - R: switch to rect drawing mode (in annotation mode)
 * - P: switch to polygon drawing mode (in annotation mode)
 * - S: switch to select mode (in annotation mode)
 * - Overlay-specific shortcuts (e.g., A for annotate)
 *
 * @param options - Configuration options
 */
export function useOverlayShortcuts({
  overlayMode,
  annotationMode,
  overlayHostState,
  onToggleOverlay,
}: UseOverlayShortcutsOptions): void {
  const setOverlayMode = useAssetViewerOverlayStore((s) => s.setOverlayMode);
  const setDrawingMode = useAssetRegionStore((s) => s.setDrawingMode);
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

  const { toggleOverlay, getOverlayForShortcut } = overlayHostState;

  const handleToggleOverlay = useCallback(
    (id: string) => {
      const entering = overlayMode !== id;
      if (!toggleOverlay(id)) {
        return;
      }
      if (entering) {
        selectRegion(null);
      }
      onToggleOverlay?.(id, entering);
    },
    [overlayMode, toggleOverlay, selectRegion, onToggleOverlay]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape':
          // Exit overlay mode or deselect region
          if (annotationMode) {
            if (selectedRegionId) {
              selectRegion(null);
            } else {
              setOverlayMode('none');
            }
          } else if (overlayMode !== 'none') {
            setOverlayMode('none');
          }
          break;
        case 'r':
          // Switch to rect mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('rect');
          }
          break;
        case 'p':
          // Switch to polygon mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('polygon');
          }
          break;
        case 's':
          // Switch to select mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('select');
          }
          break;
        default: {
          const matchingOverlay = getOverlayForShortcut(e.key);
          if (matchingOverlay && !e.ctrlKey && !e.metaKey) {
            handleToggleOverlay(matchingOverlay.id);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    annotationMode,
    overlayMode,
    selectedRegionId,
    handleToggleOverlay,
    getOverlayForShortcut,
    setOverlayMode,
    setDrawingMode,
    selectRegion,
  ]);
}
