/**
 * Panel Settings Cards
 *
 * Card components for rendering component settings within panels:
 * - ComponentSettingsCard: Global component settings card
 * - InstanceComponentSettingsCard: Instance-aware component settings card with overrides
 */

import { componentRegistry, useComponentSettingsStore } from '@features/componentSettings';
import { useResolveComponentSettings } from '@features/panels/lib/instanceSettingsResolver';
import { usePanelInstanceSettingsStore } from '@features/panels/stores/panelInstanceSettingsStore';
import type { PanelId } from '@features/workspace';

import { resolveSchemaValues } from '../lib/core/schemaHelpers';

import { PanelSchemaRenderer } from './PanelSchemaRenderers';

// Stable empty object to avoid re-renders
const EMPTY_SETTINGS = {};

export function ComponentSettingsCard({
  componentId,
}: {
  componentId: string;
}) {
  const definition = componentRegistry.get(componentId);
  const storedSettings = useComponentSettingsStore(
    (state) => state.settings[componentId] ?? EMPTY_SETTINGS,
  );
  const setComponentSetting = useComponentSettingsStore((state) => state.setComponentSetting);

  if (!definition?.settingsForm) {
    return null;
  }

  const values = resolveSchemaValues(
    storedSettings,
    definition.settingsForm.tabs,
    definition.settingsForm.groups,
  );

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 p-4">
      <div>
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {definition.title}
        </div>
        {definition.description && (
          <div className="text-xs text-neutral-500 mt-1">{definition.description}</div>
        )}
      </div>
      <PanelSchemaRenderer
        schema={definition.settingsForm}
        values={values}
        setValue={(fieldId, value) => setComponentSetting(componentId, fieldId, value)}
      />
    </div>
  );
}

/**
 * Instance-aware component settings card.
 * Shows resolved settings (global + instance overrides) and allows editing instance overrides.
 */
export function InstanceComponentSettingsCard({
  componentId,
  instanceId,
  panelId,
}: {
  componentId: string;
  instanceId: string;
  panelId: PanelId;
}) {
  const definition = componentRegistry.get(componentId);
  const resolved = useResolveComponentSettings(componentId, instanceId);
  const setInstanceComponentSetting = usePanelInstanceSettingsStore(
    (state) => state.setComponentSetting,
  );
  const clearInstanceComponentSettings = usePanelInstanceSettingsStore(
    (state) => state.clearComponentSettings,
  );
  const clearInstanceComponentSettingField = usePanelInstanceSettingsStore(
    (state) => state.clearComponentSettingField,
  );

  if (!definition?.settingsForm) {
    return null;
  }

  const values = resolveSchemaValues(
    resolved.settings as Record<string, any>,
    definition.settingsForm.tabs,
    definition.settingsForm.groups,
  );

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {definition.title}
          </div>
          {definition.description && (
            <div className="text-xs text-neutral-500 mt-1">{definition.description}</div>
          )}
        </div>
        {resolved.hasInstanceOverrides && (
          <button
            type="button"
            onClick={() => clearInstanceComponentSettings(instanceId, componentId)}
            className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>
      {resolved.hasInstanceOverrides && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
          This instance has custom settings. Changes here override global settings.
        </div>
      )}
      <PanelSchemaRenderer
        schema={definition.settingsForm}
        values={values}
        setValue={(fieldId, value) =>
          setInstanceComponentSetting(instanceId, panelId, componentId, fieldId, value)
        }
        instanceOverrides={resolved.instanceOverrides as Record<string, unknown> | undefined}
        onResetField={(fieldId) => clearInstanceComponentSettingField(instanceId, componentId, fieldId)}
      />
    </div>
  );
}
