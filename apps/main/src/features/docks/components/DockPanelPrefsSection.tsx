import { useEffect, useMemo, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import type { PanelSettingsProps } from '@features/panels/lib/panelRegistry';

import { isPanelEnabledByPrefs } from '../lib/panelPrefs';
import { useDockPanelPrefs, useDockPanelPrefsStore } from '../stores';

interface CreateDockPanelPrefsSettingsSectionOptions {
  dockId: string;
  requiredPanelIds?: readonly string[];
  hideInternalPanels?: boolean;
  emptyMessage?: string;
}

export function createDockPanelPrefsSettingsSection(
  options: CreateDockPanelPrefsSettingsSectionOptions,
) {
  const requiredPanelIdSet = new Set(options.requiredPanelIds ?? []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function DockPanelPrefsSection(_props: PanelSettingsProps) {
    const [catalogVersion, setCatalogVersion] = useState(0);
    const panelPrefs = useDockPanelPrefs(options.dockId, (prefs) => prefs);
    const setDockPanelEnabled = useDockPanelPrefsStore((state) => state.setDockPanelEnabled);

    useEffect(() => {
      return panelSelectors.subscribe(() => {
        setCatalogVersion((version) => version + 1);
      });
    }, []);

    const panels = useMemo(
      () =>
        panelSelectors
          .getPanelsForScope(options.dockId)
          .filter((panel) => !options.hideInternalPanels || !panel.isInternal)
          .sort((a, b) => a.title.localeCompare(b.title)),
      [catalogVersion],
    );

    if (panels.length === 0) {
      return (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {options.emptyMessage ?? 'No panels available for this dock.'}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {panels.map((panel) => {
          const required = requiredPanelIdSet.has(panel.id);
          const enabled = required ? true : isPanelEnabledByPrefs(panel, panelPrefs);

          return (
            <div
              key={panel.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {panel.title}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  {panel.id}
                </div>
              </div>

              <button
                type="button"
                disabled={required}
                onClick={() =>
                  setDockPanelEnabled(options.dockId, panel.id, !enabled)
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  enabled
                    ? 'bg-accent'
                    : 'bg-neutral-300 dark:bg-neutral-700'
                } ${required ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={required ? 'Required panel' : enabled ? 'Disable panel' : 'Enable panel'}
                aria-label={`${enabled ? 'Disable' : 'Enable'} ${panel.title}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  DockPanelPrefsSection.displayName = `DockPanelPrefsSection(${options.dockId})`;
  return DockPanelPrefsSection;
}
