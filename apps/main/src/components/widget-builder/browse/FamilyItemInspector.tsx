/**
 * FamilyItemInspector
 *
 * Generic inspector/details view for an item in a browsable plugin family.
 * Includes special handling for panel-group items (presets, panel mappings).
 */

import { Panel } from '@pixsim7/shared.ui';

import type { BrowsableFamilyConfig } from '@lib/plugins/browsableFamilies';

export interface FamilyItemInspectorProps {
  config: BrowsableFamilyConfig;
  item: any;
}

export function FamilyItemInspector({ config, item }: FamilyItemInspectorProps) {
  const getName = config.getItemName || ((i: any) => i.title || i.name || i.label || i.id);
  const getIcon = config.getItemIcon || ((i: any) => i.icon);

  // Get all enumerable properties
  const properties = Object.entries(item).filter(([key, value]) => {
    // Skip functions and complex objects
    if (typeof value === 'function') return false;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return false;
    // Skip internal properties
    if (key.startsWith('_')) return false;
    return true;
  });

  return (
    <Panel className="space-y-4 overflow-auto">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{getIcon(item) || '📄'}</span>
        <div>
          <h3 className="text-sm font-semibold">{getName(item)}</h3>
          <p className="text-xs text-neutral-500">{item.id}</p>
        </div>
      </div>

      {item.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {item.description}
        </p>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-neutral-500 uppercase">Properties</h4>
        <div className="text-sm space-y-1">
          {properties.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <span className="text-neutral-500 shrink-0">{key}</span>
              <span className="text-right truncate">
                {Array.isArray(value)
                  ? value.join(', ') || '—'
                  : String(value ?? '—')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Special handling for panel groups - show presets */}
      {config.family === 'panel-group' && item.presets && (
        <div className="space-y-2 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <h4 className="text-xs font-medium text-neutral-500 uppercase">Presets</h4>
          <div className="space-y-2">
            {Object.entries(item.presets).map(([presetName, preset]: [string, any]) => (
              <div
                key={presetName}
                className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded text-sm"
              >
                <div className="font-medium">{presetName}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  Slots: {preset.slots?.join(', ') || '—'}
                </div>
                {preset.description && (
                  <div className="text-xs text-neutral-400 mt-1">
                    {preset.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special handling for panel groups - show panel mappings */}
      {config.family === 'panel-group' && item.panels && (
        <div className="space-y-2 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <h4 className="text-xs font-medium text-neutral-500 uppercase">Panel Slots</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(item.panels).map(([slot, panelId]: [string, any]) => (
              <div key={slot} className="flex justify-between">
                <span className="text-neutral-500">{slot}</span>
                <span className="font-mono text-xs">{panelId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
