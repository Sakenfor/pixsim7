/**
 * UI Settings Schema
 *
 * Schema-based settings for UI-related configuration.
 * This demonstrates how modules can expose settings declaratively.
 */

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from './settingsSchemaRegistry';
import { useAssetViewerStore } from '@/stores/assetViewerStore';
import { useControlCenterStore, type LayoutBehavior, type DockPosition } from '@/stores/controlCenterStore';

// Media Viewer settings tab
const mediaViewerTab: SettingTab = {
  id: 'media-viewer',
  label: 'Media Viewer',
  icon: '🖼️',
  groups: [
    {
      id: 'viewer-general',
      description: 'Configure how assets are displayed when opened from gallery or local folders.',
      fields: [
        {
          id: 'defaultMode',
          type: 'select',
          label: 'Default View Mode',
          description: 'How the viewer opens when clicking an asset.',
          options: [
            { value: 'side', label: 'Side Panel' },
            { value: 'fullscreen', label: 'Fullscreen' },
          ],
          defaultValue: 'side',
        },
        {
          id: 'panelWidth',
          type: 'range',
          label: 'Panel Width',
          description: 'Width of the side panel (% of screen).',
          min: 20,
          max: 60,
          step: 5,
          defaultValue: 40,
          format: (v) => `${v}%`,
        },
      ],
    },
    {
      id: 'viewer-video',
      title: 'Video Playback',
      fields: [
        {
          id: 'autoPlayVideos',
          type: 'toggle',
          label: 'Auto-play Videos',
          description: 'Automatically start video playback when opened.',
          defaultValue: true,
        },
        {
          id: 'loopVideos',
          type: 'toggle',
          label: 'Loop Videos',
          description: 'Repeat videos continuously.',
          defaultValue: true,
        },
        {
          id: 'showMetadata',
          type: 'toggle',
          label: 'Show Metadata by Default',
          description: 'Display asset metadata panel when opening viewer.',
          defaultValue: false,
        },
      ],
    },
  ],
  footer: (
    <>
      Keyboard shortcuts: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">F</kbd> fullscreen,{' '}
      <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">I</kbd> metadata,{' '}
      <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">←</kbd>
      <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">→</kbd> navigate,{' '}
      <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">Esc</kbd> close
    </>
  ),
};

// Control Center settings tab
const controlCenterTab: SettingTab = {
  id: 'control-center',
  label: 'Control Center',
  icon: '🎛️',
  groups: [
    {
      id: 'dock-settings',
      description: 'Configure the generation control center dock behavior.',
      fields: [
        {
          id: 'dockPosition',
          type: 'select',
          label: 'Dock Position',
          description: 'Where the control center appears on screen.',
          options: [
            { value: 'bottom', label: 'Bottom' },
            { value: 'top', label: 'Top' },
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'floating', label: 'Floating' },
          ],
          defaultValue: 'bottom',
        },
        {
          id: 'layoutBehavior',
          type: 'select',
          label: 'Layout Behavior',
          description: 'How the dock affects page content when open.',
          options: [
            { value: 'overlay', label: 'Overlay (float over content)' },
            { value: 'push', label: 'Push (resize content)' },
          ],
          defaultValue: 'overlay',
          disabled: (values) => values.dockPosition === 'floating',
        },
      ],
    },
  ],
  footer: (
    <>
      Tip: Use <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">~</kbd> to toggle the control center open/closed.
    </>
  ),
};

/**
 * Store adapter that combines asset viewer and control center stores
 */
function useUISettingsStore(): SettingStoreAdapter {
  const viewerSettings = useAssetViewerStore((s) => s.settings);
  const updateViewerSettings = useAssetViewerStore((s) => s.updateSettings);

  const dockPosition = useControlCenterStore((s) => s.dockPosition);
  const layoutBehavior = useControlCenterStore((s) => s.layoutBehavior);
  const setDockPosition = useControlCenterStore((s) => s.setDockPosition);
  const setLayoutBehavior = useControlCenterStore((s) => s.setLayoutBehavior);

  return {
    get: (fieldId: string) => {
      // Media viewer settings
      if (fieldId === 'defaultMode') return viewerSettings.defaultMode;
      if (fieldId === 'panelWidth') return viewerSettings.panelWidth;
      if (fieldId === 'autoPlayVideos') return viewerSettings.autoPlayVideos;
      if (fieldId === 'loopVideos') return viewerSettings.loopVideos;
      if (fieldId === 'showMetadata') return viewerSettings.showMetadata;

      // Control center settings
      if (fieldId === 'dockPosition') return dockPosition;
      if (fieldId === 'layoutBehavior') return layoutBehavior;

      return undefined;
    },
    set: (fieldId: string, value: any) => {
      // Media viewer settings
      if (fieldId === 'defaultMode') updateViewerSettings({ defaultMode: value });
      if (fieldId === 'panelWidth') updateViewerSettings({ panelWidth: value });
      if (fieldId === 'autoPlayVideos') updateViewerSettings({ autoPlayVideos: value });
      if (fieldId === 'loopVideos') updateViewerSettings({ loopVideos: value });
      if (fieldId === 'showMetadata') updateViewerSettings({ showMetadata: value });

      // Control center settings
      if (fieldId === 'dockPosition') setDockPosition(value as DockPosition);
      if (fieldId === 'layoutBehavior') setLayoutBehavior(value as LayoutBehavior);
    },
    getAll: () => ({
      defaultMode: viewerSettings.defaultMode,
      panelWidth: viewerSettings.panelWidth,
      autoPlayVideos: viewerSettings.autoPlayVideos,
      loopVideos: viewerSettings.loopVideos,
      showMetadata: viewerSettings.showMetadata,
      dockPosition,
      layoutBehavior,
    }),
  };
}

/**
 * Register UI settings with the schema registry
 */
export function registerUISettings(): () => void {
  const unregisterMediaViewer = settingsSchemaRegistry.register({
    categoryId: 'ui',
    category: {
      label: 'UI',
      icon: '🎨',
      order: 15,
    },
    tab: mediaViewerTab,
    useStore: useUISettingsStore,
  });

  const unregisterControlCenter = settingsSchemaRegistry.register({
    categoryId: 'ui',
    tab: controlCenterTab,
    useStore: useUISettingsStore,
  });

  return () => {
    unregisterMediaViewer();
    unregisterControlCenter();
  };
}
