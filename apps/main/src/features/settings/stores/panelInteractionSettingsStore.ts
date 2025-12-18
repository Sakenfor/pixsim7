/**
 * Panel Interaction Settings Store
 *
 * User-configurable settings for panel interactions and behaviors.
 * Allows overriding default interaction rules defined in panel metadata.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PanelAction, WorkspaceZone } from '@features/panels';

/**
 * User override for a specific panel interaction
 */
export interface PanelInteractionOverride {
  /** What should this panel do when the target panel opens? */
  whenOpens?: PanelAction;
  /** What should this panel do when the target panel closes? */
  whenCloses?: PanelAction;
}

/**
 * Settings for a specific panel
 */
export interface PanelInteractionSettings {
  /** User overrides for interaction rules */
  interactionOverrides?: Record<string, PanelInteractionOverride>;

  /** User preference for default zone */
  preferredZone?: WorkspaceZone;

  /** Should this panel remember its retraction state? */
  rememberRetractionState?: boolean;

  /** Last known retraction state (if rememberRetractionState is true) */
  lastRetractionState?: 'normal' | 'retracted';
}

/**
 * Complete panel interaction settings state
 */
export interface PanelInteractionSettingsState {
  /** Settings per panel */
  panelSettings: Record<string, PanelInteractionSettings>;

  /** Global setting: Enable automatic panel interactions */
  enableAutomaticInteractions: boolean;

  /** Global setting: Animation duration for all panels (ms) */
  globalAnimationDuration: number;

  /** Actions */
  setPanelSettings: (panelId: string, settings: Partial<PanelInteractionSettings>) => void;
  setInteractionOverride: (panelId: string, targetPanelId: string, override: PanelInteractionOverride) => void;
  removeInteractionOverride: (panelId: string, targetPanelId: string) => void;
  setEnableAutomaticInteractions: (enabled: boolean) => void;
  setGlobalAnimationDuration: (duration: number) => void;
  resetPanelSettings: (panelId: string) => void;
  resetAllSettings: () => void;

  /** Getters */
  getPanelSettings: (panelId: string) => PanelInteractionSettings;
  getInteractionOverride: (panelId: string, targetPanelId: string) => PanelInteractionOverride | undefined;
}

/**
 * Default settings
 */
const DEFAULT_STATE = {
  panelSettings: {} as Record<string, PanelInteractionSettings>,
  enableAutomaticInteractions: true,
  globalAnimationDuration: 200,
};

/**
 * Panel interaction settings store
 */
export const usePanelInteractionSettingsStore = create<PanelInteractionSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setPanelSettings: (panelId, settings) => {
        set(state => ({
          panelSettings: {
            ...state.panelSettings,
            [panelId]: {
              ...state.panelSettings[panelId],
              ...settings,
            },
          },
        }));
      },

      setInteractionOverride: (panelId, targetPanelId, override) => {
        set(state => {
          const currentSettings = state.panelSettings[panelId] || {};
          const currentOverrides = currentSettings.interactionOverrides || {};

          return {
            panelSettings: {
              ...state.panelSettings,
              [panelId]: {
                ...currentSettings,
                interactionOverrides: {
                  ...currentOverrides,
                  [targetPanelId]: override,
                },
              },
            },
          };
        });
      },

      removeInteractionOverride: (panelId, targetPanelId) => {
        set(state => {
          const currentSettings = state.panelSettings[panelId];
          if (!currentSettings?.interactionOverrides) return state;

          const { [targetPanelId]: _, ...remainingOverrides } = currentSettings.interactionOverrides;

          return {
            panelSettings: {
              ...state.panelSettings,
              [panelId]: {
                ...currentSettings,
                interactionOverrides: remainingOverrides,
              },
            },
          };
        });
      },

      setEnableAutomaticInteractions: (enabled) => {
        set({ enableAutomaticInteractions: enabled });
      },

      setGlobalAnimationDuration: (duration) => {
        set({ globalAnimationDuration: Math.max(0, Math.min(1000, duration)) });
      },

      resetPanelSettings: (panelId) => {
        set(state => {
          const { [panelId]: _, ...remaining } = state.panelSettings;
          return { panelSettings: remaining };
        });
      },

      resetAllSettings: () => {
        set(DEFAULT_STATE);
      },

      getPanelSettings: (panelId) => {
        return get().panelSettings[panelId] || {};
      },

      getInteractionOverride: (panelId, targetPanelId) => {
        const settings = get().panelSettings[panelId];
        return settings?.interactionOverrides?.[targetPanelId];
      },
    }),
    {
      name: 'panel-interaction-settings',
      version: 1,
    }
  )
);

/**
 * Hook to get settings for a specific panel
 */
export function usePanelSettings(panelId: string): PanelInteractionSettings {
  return usePanelInteractionSettingsStore(state => state.getPanelSettings(panelId));
}

/**
 * Hook to get interaction override for a specific panel pair
 */
export function useInteractionOverride(
  panelId: string,
  targetPanelId: string
): PanelInteractionOverride | undefined {
  return usePanelInteractionSettingsStore(state =>
    state.getInteractionOverride(panelId, targetPanelId)
  );
}
