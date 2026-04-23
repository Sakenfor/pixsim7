/**
 * useOverlayShortcuts
 *
 * Hook for handling keyboard shortcuts for overlay modes.
 * Manages escape to exit, drawing mode switching, and overlay toggles.
 */

import { useEffect, useCallback } from 'react';

import { useAssetRegionStore, useCaptureRegionStore, useAssetViewerOverlayStore } from '@features/mediaViewer';

import { isTypingInEditable } from '@/hooks/useKeyboardShortcuts';


import type { MediaOverlayHostState } from '../../overlays';
import { useMaskOverlayStore } from '../../overlays/builtins/maskOverlayStore';

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
 * - C: switch to curve drawing mode (in annotation/capture mode)
 * - V: switch to canonical select/view mode (from the global select tool)
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
      // Skip if the user is typing (input, textarea, or contenteditable).
      // Contenteditable was missing from the previous hand-rolled check
      // and let bare letters (R/P/C/V) hijack typing in rich-text prompts.
      if (isTypingInEditable(e)) return;

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
          // Switch to rect mode (annotation & capture overlays)
          if (!e.ctrlKey && !e.metaKey) {
            if (overlayMode === 'annotate') {
              setDrawingMode('rect');
            } else if (overlayMode === 'capture') {
              useCaptureRegionStore.getState().setDrawingMode('rect');
            }
          }
          break;
        case 'p':
          // Switch to polygon mode (annotation & capture overlays)
          if (!e.ctrlKey && !e.metaKey) {
            if (overlayMode === 'annotate') {
              setDrawingMode('polygon');
            } else if (overlayMode === 'capture') {
              useCaptureRegionStore.getState().setDrawingMode('polygon');
            }
          }
          break;
        case 'c':
          // Switch to curve mode when inside annotation/capture,
          // otherwise toggle the Capture overlay (shortcut: C)
          if (!e.ctrlKey && !e.metaKey) {
            if (overlayMode === 'annotate') {
              setDrawingMode('curve');
            } else if (overlayMode === 'capture') {
              useCaptureRegionStore.getState().setDrawingMode('curve');
            } else {
              const matchingOverlay = getOverlayForShortcut(e.key);
              if (matchingOverlay) {
                handleToggleOverlay(matchingOverlay.id);
              }
            }
          }
          break;
        case 'v':
          // Move/select mode (canonical across overlays)
          if (!e.ctrlKey && !e.metaKey && overlayMode !== 'none') {
            if (overlayMode === 'annotate') {
              setDrawingMode('select');
            } else if (overlayMode === 'capture') {
              useCaptureRegionStore.getState().setDrawingMode('select');
            } else if (overlayMode === 'mask') {
              useMaskOverlayStore.getState().setMode('view');
            }
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
