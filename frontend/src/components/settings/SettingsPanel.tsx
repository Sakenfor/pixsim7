import { useState } from 'react';
import { CubeSettingsPanel } from '../control/CubeSettingsPanel';

export function SettingsPanel() {
  const [showCubeSettings, setShowCubeSettings] = useState(false);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Configure global behavior for cubes, panels, and providers.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Cube System
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Adjust how control cubes behave and how connections between cubes are created.
          </p>
          <button
            type="button"
            className="inline-flex items-center px-2.5 py-1.5 rounded border border-blue-500/70 text-[11px] font-medium text-blue-600 dark:text-blue-300 bg-blue-50/60 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            onClick={() => setShowCubeSettings(true)}
          >
            Open Cube Settings
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Providers & Accounts
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Provider configuration still lives in the Provider Settings panel. Use the Panel
            Launcher or the Providers panel to manage accounts, capacities, and quotas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Workspace Layout
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Layout presets and workspace arrangement are managed from the main workspace toolbar.
            Future global layout settings can be added here.
          </p>
        </section>
      </div>

      {showCubeSettings && (
        <CubeSettingsPanel onClose={() => setShowCubeSettings(false)} />
      )}
    </div>
  );
}

