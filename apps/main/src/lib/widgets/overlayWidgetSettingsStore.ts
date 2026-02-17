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
 *
 * Also stores per-context widget visibility (which configurable widgets
 * appear in gallery / compact / viewer, as always / hover / hidden).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getWidget } from './widgetRegistry';

/** Settings for a specific widget type */
export type WidgetSettings = Record<string, unknown>;

// ── Context Visibility Types ────────────────────────────────────────────────

/** How a widget is displayed in a given context */
export type WidgetVisibilityMode = 'always' | 'hover' | 'hidden';

/** Surface contexts where overlay widgets can appear */
export type OverlayContextId = 'gallery' | 'compact' | 'viewer';

/** Widget IDs that support per-context visibility configuration */
export type ConfigurableWidgetId =
  | 'favorite-toggle'
  | 'quick-tag'
  | 'generation-button-group'
  | 'info-popover';

/** Full visibility settings map: context -> widget -> mode */
export type OverlayVisibilitySettings = Record<
  OverlayContextId,
  Record<ConfigurableWidgetId, WidgetVisibilityMode>
>;

/** Default visibility settings */
export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibilitySettings = {
  gallery: {
    'favorite-toggle': 'always',
    'quick-tag': 'always',
    'generation-button-group': 'hover',
    'info-popover': 'hover',
  },
  compact: {
    'favorite-toggle': 'hover',
    'quick-tag': 'hidden',
    'generation-button-group': 'hidden',
    'info-popover': 'hidden',
  },
  viewer: {
    'favorite-toggle': 'always',
    'quick-tag': 'hidden',
    'generation-button-group': 'hover',
    'info-popover': 'hover',
  },
};

/** All configurable widget IDs (for iteration in settings UI) */
export const CONFIGURABLE_WIDGET_IDS: ConfigurableWidgetId[] = [
  'favorite-toggle',
  'quick-tag',
  'generation-button-group',
  'info-popover',
];

/** Human-readable labels for widget IDs */
export const WIDGET_LABELS: Record<ConfigurableWidgetId, string> = {
  'favorite-toggle': 'Favorite',
  'quick-tag': 'Quick Tag',
  'generation-button-group': 'Generation Bar',
  'info-popover': 'Info Popover',
};

// ── Store ───────────────────────────────────────────────────────────────────

/** Store state */
interface OverlayWidgetSettingsState {
  /** Settings per widget definition ID */
  settings: Record<string, WidgetSettings>;

  /** Per-context widget visibility */
  contextVisibility: OverlayVisibilitySettings;

  // ── Widget behavioral settings ──

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

  // ── Context visibility ──

  /** Get the visibility mode for a widget in a given context */
  getContextVisibility: (context: OverlayContextId, widgetId: ConfigurableWidgetId) => WidgetVisibilityMode;

  /** Set the visibility mode for a widget in a given context */
  setContextVisibility: (
    context: OverlayContextId,
    widgetId: ConfigurableWidgetId,
    mode: WidgetVisibilityMode,
  ) => void;

  /** Reset context visibility to defaults */
  resetContextVisibility: () => void;
}

export const useOverlayWidgetSettingsStore = create<OverlayWidgetSettingsState>()(
  persist(
    (set, get) => ({
      settings: {},
      contextVisibility: { ...DEFAULT_OVERLAY_VISIBILITY },

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
        set({ settings: {}, contextVisibility: { ...DEFAULT_OVERLAY_VISIBILITY } });
      },

      getContextVisibility: (context, widgetId) => {
        const state = get();
        return state.contextVisibility[context]?.[widgetId]
          ?? DEFAULT_OVERLAY_VISIBILITY[context]?.[widgetId]
          ?? 'hidden';
      },

      setContextVisibility: (context, widgetId, mode) => {
        set((state) => ({
          contextVisibility: {
            ...state.contextVisibility,
            [context]: {
              ...state.contextVisibility[context],
              [widgetId]: mode,
            },
          },
        }));
      },

      resetContextVisibility: () => {
        set({ contextVisibility: { ...DEFAULT_OVERLAY_VISIBILITY } });
      },
    }),
    {
      name: 'overlay-widget-settings',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v1 -> v2: add contextVisibility
          return {
            ...persisted,
            contextVisibility: { ...DEFAULT_OVERLAY_VISIBILITY },
          };
        }
        return persisted as OverlayWidgetSettingsState;
      },
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

/**
 * Get context visibility for a widget.
 * Can be called outside React components.
 */
export function getContextVisibility(
  context: OverlayContextId,
  widgetId: ConfigurableWidgetId,
): WidgetVisibilityMode {
  return useOverlayWidgetSettingsStore.getState().getContextVisibility(context, widgetId);
}
