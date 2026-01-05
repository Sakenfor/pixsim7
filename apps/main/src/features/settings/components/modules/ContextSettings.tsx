/**
 * Context Settings Module
 *
 * Settings for context hub behavior and capability routing.
 */
import { useContextHubSettingsStore } from '@features/contextHub';

import { settingsRegistry } from '../../lib/core/registry';

export function ContextSettings() {
  const enableMediaCardContextMenu = useContextHubSettingsStore(
    (s) => s.enableMediaCardContextMenu
  );
  const setEnableMediaCardContextMenu = useContextHubSettingsStore(
    (s) => s.setEnableMediaCardContextMenu
  );

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Context Menus */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Context Menus
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
            Configure how custom right-click menus behave.
          </p>
        </div>

        <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100">
                Enable Media Card Context Menu
              </div>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                Show custom right-click menu on asset cards with quick actions.
              </div>
            </div>
            <label className="flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={enableMediaCardContextMenu}
                onChange={(e) => setEnableMediaCardContextMenu(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative" />
            </label>
          </div>
        </div>
      </section>

      {/* Info */}
      <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          About Context Hub
        </h3>
        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 space-y-2">
          <p>
            The Context Hub manages capability routing between UI components. It allows
            panels and widgets to share context like selected assets, active scene, and
            generation state.
          </p>
          <p>
            Context menus provide quick actions when right-clicking on assets, allowing
            you to send items to generation widgets, copy metadata, and more.
          </p>
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'context',
  label: 'Context',
  icon: '🔗',
  component: ContextSettings,
  order: 60,
});
