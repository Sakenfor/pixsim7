/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';

import type { ViewerAsset } from '@features/assets';

import { useMediaOverlayRegistry } from './registry';
import type { MediaOverlayId, MediaOverlayTool } from './types';

export interface MediaOverlayHostOptions {
  asset: ViewerAsset | null;
  overlayMode: string;
  setOverlayMode: (mode: string) => void;
  toggleOverlayMode?: (mode: string) => void;
}

export interface MediaOverlayHostState {
  overlays: MediaOverlayTool[];
  activeOverlay: MediaOverlayTool | null;
  effectiveOverlayMode: string;
  toggleOverlay: (id: MediaOverlayId) => boolean;
  getOverlayForShortcut: (key: string) => MediaOverlayTool | undefined;
}

export function useMediaOverlayHost({
  asset,
  overlayMode,
  setOverlayMode,
  toggleOverlayMode,
}: MediaOverlayHostOptions): MediaOverlayHostState {
  const { overlays } = useMediaOverlayRegistry();

  const availableOverlays = useMemo(() => {
    if (!asset) {
      return [];
    }
    return overlays.filter((overlay) => (overlay.isAvailable ? overlay.isAvailable(asset) : true));
  }, [overlays, asset]);

  const activeOverlay = overlayMode !== 'none'
    ? availableOverlays.find((overlay) => overlay.id === overlayMode) ?? null
    : null;

  const effectiveOverlayMode = activeOverlay ? overlayMode : 'none';

  const toggleOverlay = useCallback(
    (id: MediaOverlayId) => {
      if (!availableOverlays.some((overlay) => overlay.id === id)) {
        return false;
      }
      if (toggleOverlayMode) {
        toggleOverlayMode(id);
      } else {
        setOverlayMode(overlayMode === id ? 'none' : id);
      }
      return true;
    },
    [availableOverlays, toggleOverlayMode, setOverlayMode, overlayMode]
  );

  const getOverlayForShortcut = useCallback(
    (key: string) => {
      const normalized = key.toLowerCase();
      return availableOverlays.find(
        (overlay) => overlay.shortcut?.toLowerCase() === normalized
      );
    },
    [availableOverlays]
  );

  return {
    overlays: availableOverlays,
    activeOverlay,
    effectiveOverlayMode,
    toggleOverlay,
    getOverlayForShortcut,
  };
}

export interface MediaOverlayHostProps extends MediaOverlayHostOptions {
  children: (state: MediaOverlayHostState) => ReactNode;
}

export function MediaOverlayHost({ children, ...options }: MediaOverlayHostProps) {
  const state = useMediaOverlayHost(options);
  return <>{children(state)}</>;
}
