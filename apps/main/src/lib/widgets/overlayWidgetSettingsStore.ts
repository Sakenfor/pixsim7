/**
 * Overlay Widget Settings Store
 *
 * Stores per-widget-type settings for overlay widgets.
 * Unlike the placement store (which tracks widget instances),
 * this stores user preferences for how each widget type behaves.
 *
 * Example: User wants all video-scrub widgets to have showTimeline=false
 *
 * Settings merge order:
 * 1. widgetDef.defaultSettings (base defaults)
 * 2. overlayWidgetSettingsStore (user preferences)
 * 3. inline overrides (per-usage)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getWidget } from './widgetRegistry';

/** Settings for a specific widget type */
export type WidgetSettings = Record<string, unknown>;

/** Store state */
interface OverlayWidgetSettingsState {
  /** Settings per widget definition ID */
  settings: Record<string, WidgetSettings>;

  /** Get settings for a widget type (merged with defaults) */
  getSettings: <T extends WidgetSettings>(widgetId: string) => T;

  /** Get raw user overrides (without defaults) */
  getRawSettings: (widgetId: string) => WidgetSettings | undefined;

  /** Update settings for a widget type */
  updateSettings: (widgetId: string, settings: Partial<WidgetSettings>) => void;

  /** Reset settings for a widget type to defaults */
  resetSettings: (widgetId: string) => void;

  /** Reset all settings */
  resetAll: () => void;
}

export const useOverlayWidgetSettingsStore = create<OverlayWidgetSettingsState>()(
  persist(
    (set, get) => ({
      settings: {},

      getSettings: <T extends WidgetSettings>(widgetId: string): T => {
        const widgetDef = getWidget(widgetId);
        const defaultSettings = (widgetDef?.defaultSettings ?? {}) as T;
        const userSettings = get().settings[widgetId] ?? {};

        return {
          ...defaultSettings,
          ...userSettings,
        } as T;
      },

      getRawSettings: (widgetId: string) => {
        return get().settings[widgetId];
      },

      updateSettings: (widgetId: string, newSettings: Partial<WidgetSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [widgetId]: {
              ...(state.settings[widgetId] ?? {}),
              ...newSettings,
            },
          },
        }));
      },

      resetSettings: (widgetId: string) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [widgetId]: _removed, ...rest } = state.settings;
          return { settings: rest };
        });
      },

      resetAll: () => {
        set({ settings: {} });
      },
    }),
    {
      name: 'overlay-widget-settings',
      version: 1,
    }
  )
);

/**
 * Get merged settings for an overlay widget.
 * Can be called outside React components.
 */
export function getOverlayWidgetSettings<T extends WidgetSettings>(
  widgetId: string
): T {
  return useOverlayWidgetSettingsStore.getState().getSettings<T>(widgetId);
}

/**
 * Update settings for an overlay widget.
 * Can be called outside React components.
 */
export function updateOverlayWidgetSettings(
  widgetId: string,
  settings: Partial<WidgetSettings>
): void {
  useOverlayWidgetSettingsStore.getState().updateSettings(widgetId, settings);
}

/**
 * Hook to use a specific widget's settings reactively.
 */
export function useOverlayWidgetSettings<T extends WidgetSettings>(
  widgetId: string
): [T, (settings: Partial<T>) => void] {
  const settings = useOverlayWidgetSettingsStore((state) =>
    state.getSettings<T>(widgetId)
  );
  const updateSettings = useOverlayWidgetSettingsStore(
    (state) => state.updateSettings
  );

  return [
    settings,
    (newSettings: Partial<T>) => updateSettings(widgetId, newSettings),
  ];
}
