import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import type { PanelDefinition } from '@features/panels/lib/panelRegistry';
import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';
import { usePanelConfigStore } from '@features/panels/stores/panelConfigStore';

import { NavIcon } from './ActivityBar';

const EMPTY_SETTINGS = {};

interface SettingsFlyoutProps {
  panelId: string;
  children: React.ReactElement;
}

function SettingsFlyoutContent({ panel }: { panel: PanelDefinition }) {
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  const onUpdateSettings = useCallback(
    (settings: Record<string, any>) => {
      updatePanelSettings(panel.id, settings);
    },
    [panel.id, updatePanelSettings],
  );

  const panelSettings = usePanelConfigStore(
    useCallback(
      (state: any) => {
        const settings = state.panelConfigs?.[panel.id]?.settings;
        return settings ?? panel.defaultSettings ?? EMPTY_SETTINGS;
      },
      [panel.id, panel.defaultSettings],
    ),
    (a, b) => a === b,
  );

  const helpers = usePanelSettingsHelpers(panel.id, panelSettings, onUpdateSettings);

  if (panel.settingsComponent) {
    return <panel.settingsComponent settings={panelSettings} helpers={helpers} />;
  }

  if (panel.settingsSections) {
    return (
      <div className="space-y-4">
        {panel.settingsSections.map((section) => (
          <div key={section.id} className="space-y-1.5">
            <div>
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                {section.title}
              </h4>
              {section.description && (
                <p className="text-[11px] text-neutral-500 mt-0.5">{section.description}</p>
              )}
            </div>
            <section.component settings={panelSettings} helpers={helpers} />
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-xs text-neutral-500">No settings available.</p>;
}

export function SettingsFlyout({ panelId, children }: SettingsFlyoutProps) {
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 200,
    collapseDelay: 250,
  });

  const panel = panelSelectors.get(panelId);
  const hasSettings = panel && (panel.settingsComponent || panel.settingsSections);

  if (!hasSettings) return children;

  const rect = triggerRef.current?.getBoundingClientRect();

  return (
    <div ref={triggerRef} {...handlers}>
      {children}

      {isExpanded &&
        rect &&
        panel &&
        createPortal(
          <div
            className="fixed z-50 w-[320px] max-h-[min(600px,80vh)] overflow-y-auto rounded-lg border border-neutral-700/60 bg-neutral-900/95 p-3 shadow-xl backdrop-blur-sm"
            style={{ top: rect.top - 8, left: rect.right + 8 }}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-700/40">
              <NavIcon name="settings" size={14} />
              <span className="text-xs font-semibold text-neutral-200">
                {panel.title} Settings
              </span>
            </div>
            <SettingsFlyoutContent panel={panel} />
          </div>,
          document.body,
        )}
    </div>
  );
}
