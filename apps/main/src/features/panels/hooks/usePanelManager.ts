/**
 * Panel Manager React Hooks
 *
 * React integration for the declarative panel system.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { panelManager } from '../lib/PanelManager';
import type {
  PanelState,
  ZoneState,
  PanelManagerState,
  PanelManagerEvent,
  WorkspaceZone,
  OpenPanelOptions,
  MovePanelOptions,
} from '../lib/types';

/**
 * Subscribe to a specific panel's state
 */
export function usePanelState(panelId: string): PanelState | undefined {
  const [state, setState] = useState<PanelState | undefined>(() =>
    panelManager.getPanelState(panelId)
  );

  useEffect(() => {
    return panelManager.subscribe(managerState => {
      setState(managerState.panels.get(panelId));
    });
  }, [panelId]);

  return state;
}

/**
 * Subscribe to a specific zone's state
 */
export function useZoneState(zoneId: WorkspaceZone): ZoneState | undefined {
  const [state, setState] = useState<ZoneState | undefined>(() =>
    panelManager.getZoneState(zoneId)
  );

  useEffect(() => {
    return panelManager.subscribe(managerState => {
      setState(managerState.zones.get(zoneId));
    });
  }, [zoneId]);

  return state;
}

/**
 * Subscribe to all panels in a zone
 */
export function usePanelsInZone(zoneId: WorkspaceZone): PanelState[] {
  const [panels, setPanels] = useState<PanelState[]>(() =>
    panelManager.getPanelsInZone(zoneId)
  );

  useEffect(() => {
    return panelManager.subscribe(() => {
      setPanels(panelManager.getPanelsInZone(zoneId));
    });
  }, [zoneId]);

  return panels;
}

/**
 * Subscribe to the active panel in a zone
 */
export function useActivePanelInZone(zoneId: WorkspaceZone): PanelState | undefined {
  const [activePanel, setActivePanel] = useState<PanelState | undefined>(() =>
    panelManager.getActivePanelInZone(zoneId)
  );

  useEffect(() => {
    return panelManager.subscribe(() => {
      setActivePanel(panelManager.getActivePanelInZone(zoneId));
    });
  }, [zoneId]);

  return activePanel;
}

/**
 * Subscribe to all open panels
 */
export function useOpenPanels(): PanelState[] {
  const [panels, setPanels] = useState<PanelState[]>(() =>
    panelManager.getOpenPanels()
  );

  useEffect(() => {
    return panelManager.subscribe(() => {
      setPanels(panelManager.getOpenPanels());
    });
  }, []);

  return panels;
}

/**
 * Subscribe to entire panel manager state
 */
export function usePanelManagerState(): PanelManagerState {
  const [state, setState] = useState<PanelManagerState>(() =>
    panelManager.getState()
  );

  useEffect(() => {
    return panelManager.subscribe(newState => {
      setState(newState);
    });
  }, []);

  return state;
}

/**
 * Subscribe to panel manager events
 */
export function usePanelManagerEvents(
  callback: (event: PanelManagerEvent) => void
): void {
  useEffect(() => {
    return panelManager.on(callback);
  }, [callback]);
}

/**
 * Get panel manager actions as stable callbacks
 */
export function usePanelActions(panelId: string) {
  const open = useCallback(
    (options?: OpenPanelOptions) => {
      panelManager.openPanel(panelId, options);
    },
    [panelId]
  );

  const close = useCallback(() => {
    panelManager.closePanel(panelId);
  }, [panelId]);

  const toggle = useCallback(() => {
    panelManager.togglePanel(panelId);
  }, [panelId]);

  const retract = useCallback(() => {
    panelManager.retractPanel(panelId);
  }, [panelId]);

  const expand = useCallback(() => {
    panelManager.expandPanel(panelId);
  }, [panelId]);

  const toggleRetraction = useCallback(() => {
    panelManager.toggleRetraction(panelId);
  }, [panelId]);

  const focus = useCallback(() => {
    panelManager.focusPanel(panelId);
  }, [panelId]);

  const move = useCallback(
    (options: MovePanelOptions) => {
      panelManager.movePanel(panelId, options);
    },
    [panelId]
  );

  return useMemo(
    () => ({
      open,
      close,
      toggle,
      retract,
      expand,
      toggleRetraction,
      focus,
      move,
    }),
    [open, close, toggle, retract, expand, toggleRetraction, focus, move]
  );
}

/**
 * Hook that combines panel state + actions for convenience
 */
export function usePanel(panelId: string) {
  const state = usePanelState(panelId);
  const actions = usePanelActions(panelId);

  return useMemo(
    () => ({
      state,
      ...actions,
    }),
    [state, actions]
  );
}

/**
 * Hook for zone actions
 */
export function useZoneActions(zoneId: WorkspaceZone) {
  const getActivePanelInZone = useCallback(() => {
    return panelManager.getActivePanelInZone(zoneId);
  }, [zoneId]);

  const getPanelsInZone = useCallback(() => {
    return panelManager.getPanelsInZone(zoneId);
  }, [zoneId]);

  return useMemo(
    () => ({
      getActivePanel: getActivePanelInZone,
      getPanels: getPanelsInZone,
    }),
    [getActivePanelInZone, getPanelsInZone]
  );
}

/**
 * Hook that returns whether a panel is in a specific state
 */
export function usePanelIs(panelId: string, check: 'open' | 'retracted' | 'hidden' | 'minimized'): boolean {
  const state = usePanelState(panelId);

  return useMemo(() => {
    if (!state) return false;

    switch (check) {
      case 'open':
        return state.isOpen;
      case 'retracted':
        return state.mode === 'retracted';
      case 'hidden':
        return state.mode === 'hidden';
      case 'minimized':
        return state.mode === 'minimized';
      default:
        return false;
    }
  }, [state, check]);
}

/**
 * Hook for accessing panel manager directly (for advanced usage)
 */
export function usePanelManagerInstance() {
  return panelManager;
}

// Re-export initialization hooks
export { usePanelSystemInitialization, useInitializePanelSystem } from './usePanelSystemInitialization';
