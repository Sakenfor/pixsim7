/**
 * UI Settings Module
 *
 * Visual and interaction settings for the application UI.
 */
import { useAssetViewerStore } from '@/stores/assetViewerStore';
import { settingsRegistry } from '@/lib/settingsRegistry';

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative" />
    </label>
  );
}

export function UISettings() {
  const settings = useAssetViewerStore((s) => s.settings);
  const updateSettings = useAssetViewerStore((s) => s.updateSettings);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Media Viewer Section */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Media Viewer
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
            Configure how assets are displayed when opened from gallery or local folders.
          </p>
        </div>

        <div className="space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
          {/* Default Mode */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                Default View Mode
              </div>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                How the viewer opens when clicking an asset.
              </div>
            </div>
            <select
              value={settings.defaultMode}
              onChange={(e) => updateSettings({ defaultMode: e.target.value as 'side' | 'fullscreen' })}
              className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
            >
              <option value="side">Side Panel</option>
              <option value="fullscreen">Fullscreen</option>
            </select>
          </div>

          {/* Panel Width */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                Panel Width
              </div>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                Width of the side panel (% of screen).
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="20"
                max="60"
                step="5"
                value={settings.panelWidth}
                onChange={(e) => updateSettings({ panelWidth: Number(e.target.value) })}
                className="w-24 h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[11px] text-neutral-600 dark:text-neutral-400 w-8 text-right">
                {settings.panelWidth}%
              </span>
            </div>
          </div>

          <div className="border-t border-neutral-200/70 dark:border-neutral-800/70 pt-3 space-y-3">
            {/* Auto-play Videos */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                  Auto-play Videos
                </div>
                <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                  Automatically start video playback when opened.
                </div>
              </div>
              <ToggleSwitch
                checked={settings.autoPlayVideos}
                onChange={(checked) => updateSettings({ autoPlayVideos: checked })}
              />
            </div>

            {/* Loop Videos */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                  Loop Videos
                </div>
                <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                  Repeat videos continuously.
                </div>
              </div>
              <ToggleSwitch
                checked={settings.loopVideos}
                onChange={(checked) => updateSettings({ loopVideos: checked })}
              />
            </div>

            {/* Show Metadata */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                  Show Metadata by Default
                </div>
                <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                  Display asset metadata panel when opening viewer.
                </div>
              </div>
              <ToggleSwitch
                checked={settings.showMetadata}
                onChange={(checked) => updateSettings({ showMetadata: checked })}
              />
            </div>
          </div>
        </div>

        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Keyboard shortcuts: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">F</kbd> fullscreen,{' '}
          <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">I</kbd> metadata,{' '}
          <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">←</kbd><kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">→</kbd> navigate,{' '}
          <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">Esc</kbd> close
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'ui',
  label: 'UI',
  icon: '🎨',
  component: UISettings,
  order: 15, // After General (10), before Media (40)
});
