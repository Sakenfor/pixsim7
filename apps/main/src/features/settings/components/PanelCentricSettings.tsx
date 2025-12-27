/**
 * Panel-Centric Settings Component
 *
 * Master-detail layout for panel settings:
 * - Left sidebar: List of all panels
 * - Right panel: All settings for the selected panel
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  getAllPanelMetadata,
  type PanelMetadata,
  panelRegistry,
  usePanelConfigStore,
  panelSettingsScopeRegistry,
  usePanelInstanceSettingsStore,
  useResolvePanelSettings,
  useResolveComponentSettings,
  getScopeMode,
  ScopeModeSelect,
} from '@features/panels';
import { PanelSettingsErrorBoundary } from './PanelSettingsErrorBoundary';
import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';
import { usePanelSettingsUiStore } from '../stores/panelSettingsUiStore';
import { SettingFieldRenderer } from './shared/SettingFieldRenderer';
import { resolveSchemaValues } from '../lib/core/schemaUtils';
import type { SettingField, SettingGroup, SettingTab } from '../lib/core/types';
import { componentRegistry, useComponentSettingsStore } from '@features/componentSettings';
import type { PanelId } from '@features/workspace';

// Stable empty object to avoid re-renders
const EMPTY_SETTINGS = {};

/**
 * Wraps a field with an optional reset button for instance overrides.
 */
function InstanceFieldWrapper({
  field,
  value,
  onChange,
  allValues,
  hasOverride,
  onReset,
}: {
  field: SettingField;
  value: any;
  onChange: (value: any) => void;
  allValues: Record<string, any>;
  hasOverride?: boolean;
  onReset?: () => void;
}) {
  // Check showWhen condition
  if (field.showWhen && !field.showWhen(allValues)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SettingFieldRenderer
          field={field}
          value={value}
          onChange={onChange}
          allValues={allValues}
        />
      </div>
      {hasOverride && onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Reset to global value"
          className="shrink-0 p-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
    </div>
  );
}

function PanelSchemaGroupRenderer({
  group,
  values,
  setValue,
  instanceOverrides,
  onResetField,
}: {
  group: SettingGroup;
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  instanceOverrides?: Record<string, unknown>;
  onResetField?: (fieldId: string) => void;
}) {
  if (group.showWhen && !group.showWhen(values)) {
    return null;
  }

  return (
    <div className="space-y-2">
      {group.title && (
        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {group.title}
        </h4>
      )}
      {group.description && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          {group.description}
        </p>
      )}
      <div className="space-y-3">
        {group.fields.map((field) => (
          <InstanceFieldWrapper
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(value) => setValue(field.id, value)}
            allValues={values}
            hasOverride={instanceOverrides ? field.id in instanceOverrides : false}
            onReset={onResetField ? () => onResetField(field.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function PanelSchemaRenderer({
  schema,
  values,
  setValue,
  instanceOverrides,
  onResetField,
}: {
  schema: { tabs?: SettingTab[]; groups?: SettingGroup[] };
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  instanceOverrides?: Record<string, unknown>;
  onResetField?: (fieldId: string) => void;
}) {
  const tabs = schema.tabs ?? [];
  const groups = schema.groups ?? [];
  const [activeTabId, setActiveTabId] = useState<string | null>(tabs[0]?.id ?? null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  if (tabs.length > 0 && activeTab) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                activeTabId === tab.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {activeTab.groups.map((group) => (
            <PanelSchemaGroupRenderer
              key={group.id}
              group={group}
              values={values}
              setValue={setValue}
              instanceOverrides={instanceOverrides}
              onResetField={onResetField}
            />
          ))}
          {activeTab.footer && (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {activeTab.footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-sm text-neutral-500">
        No schema settings available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <PanelSchemaGroupRenderer
          key={group.id}
          group={group}
          values={values}
          setValue={setValue}
          instanceOverrides={instanceOverrides}
          onResetField={onResetField}
        />
      ))}
    </div>
  );
}

function ComponentSettingsCard({
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
function InstanceComponentSettingsCard({
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

interface PanelDetailViewProps {
  metadata: PanelMetadata;
  selectedInstanceId?: string | null;
  onClearInstance?: () => void;
}

function PanelDetailView({ metadata, selectedInstanceId, onClearInstance }: PanelDetailViewProps) {
  const allPanels = useMemo(() => getAllPanelMetadata(), []);
  // Get panel definition from registry (for panel-specific settings)
  const panelDefinition = useMemo(
    () => panelRegistry.getAll().find((p) => p.id === metadata.id),
    [metadata.id]
  );
  const [componentRegistryVersion, setComponentRegistryVersion] = useState(0);
  const panelRegistryOverride = usePanelConfigStore(
    (state) => state.panelConfigs[metadata.id as PanelId]?.registryOverride
  );
  const setRegistryOverride = usePanelConfigStore((state) => state.setRegistryOverride);
  const clearRegistryOverride = usePanelConfigStore((state) => state.clearRegistryOverride);

  const supportsMultipleDefault = panelDefinition?.supportsMultipleInstances ?? false;
  const supportsMultipleResolved =
    panelRegistryOverride?.supportsMultipleInstances ?? supportsMultipleDefault;
  const supportsMultipleOverrideValue = panelRegistryOverride?.supportsMultipleInstances;

  // Check if has interaction rules
  const hasInteractionRules = !!(
    metadata.interactionRules?.whenOpens ||
    metadata.interactionRules?.whenCloses
  );

  // Check if has panel-specific settings
  const hasPanelSettings = !!(
    panelDefinition?.settingsComponent ||
    panelDefinition?.settingsSections ||
    panelDefinition?.settingsForm
  );
  const componentSettings = panelDefinition?.componentSettings ?? [];
  const hasComponentSettings = componentSettings.some((componentId) => {
    const definition = componentRegistry.get(componentId);
    return !!definition?.settingsForm;
  });
  const hasCustomTabs = !!panelDefinition?.settingsTabs?.length;

  // Get panel enabled state
  const isEnabled = usePanelConfigStore((state) =>
    state.panelConfigs?.[metadata.id]?.enabled ?? true
  );
  const togglePanel = usePanelConfigStore((state) => state.togglePanel);

  // Get update function from store
  const updatePanelSettings = usePanelConfigStore((state) => state.updatePanelSettings);

  // Get current panel settings
  const panelSettings = usePanelConfigStore((state) => {
    const settings = state.panelConfigs?.[metadata.id]?.settings;
    return settings ?? panelDefinition?.defaultSettings ?? EMPTY_SETTINGS;
  });
  const schemaValues = useMemo(() => {
    if (!panelDefinition?.settingsForm) {
      return panelSettings as Record<string, any>;
    }
    return resolveSchemaValues(
      panelSettings as Record<string, any>,
      panelDefinition.settingsForm.tabs,
      panelDefinition.settingsForm.groups,
    );
  }, [panelDefinition?.settingsForm, panelSettings]);

  // Create update callback
  const onUpdateSettings = useCallback(
    (settings: Record<string, any>) => {
      updatePanelSettings(metadata.id, settings);
    },
    [metadata.id, updatePanelSettings]
  );

  // Get helpers for panel settings
  const helpers = usePanelSettingsHelpers(metadata.id, panelSettings, onUpdateSettings);

  const [scopeDefinitions, setScopeDefinitions] = useState(() =>
    panelSettingsScopeRegistry.getAll()
  );

  useEffect(() => {
    return panelSettingsScopeRegistry.subscribe(() => {
      setScopeDefinitions(panelSettingsScopeRegistry.getAll());
    });
  }, []);

  useEffect(() => {
    return componentRegistry.subscribe(() => {
      setComponentRegistryVersion((version) => version + 1);
    });
  }, []);

  const instanceScopes = usePanelInstanceSettingsStore((state) =>
    selectedInstanceId ? state.instances[selectedInstanceId]?.scopes ?? EMPTY_SETTINGS : EMPTY_SETTINGS
  );
  const setScope = usePanelInstanceSettingsStore((state) => state.setScope);

  // Instance panel settings
  const instancePanelSettings = usePanelInstanceSettingsStore((state) =>
    selectedInstanceId ? state.instances[selectedInstanceId]?.panelSettings : undefined
  );
  const setInstancePanelSetting = usePanelInstanceSettingsStore(
    (state) => state.setPanelSetting
  );
  const clearInstancePanelSettings = usePanelInstanceSettingsStore(
    (state) => state.clearPanelSettings
  );
  const clearInstancePanelSettingField = usePanelInstanceSettingsStore(
    (state) => state.clearPanelSettingField
  );
  const hasInstancePanelOverrides =
    !!instancePanelSettings && Object.keys(instancePanelSettings).length > 0;

  // Resolved instance panel settings (global + instance overrides)
  const resolvedInstancePanelSettings = useResolvePanelSettings(metadata.id, selectedInstanceId);
  const instanceSchemaValues = useMemo(() => {
    if (!panelDefinition?.settingsForm) {
      return resolvedInstancePanelSettings.settings as Record<string, any>;
    }
    return resolveSchemaValues(
      resolvedInstancePanelSettings.settings as Record<string, any>,
      panelDefinition.settingsForm.tabs,
      panelDefinition.settingsForm.groups,
    );
  }, [panelDefinition?.settingsForm, resolvedInstancePanelSettings.settings]);

  const tabs = useMemo(() => {
    const baseTabs: Array<{ id: string; label: string; order: number; content: JSX.Element }> = [];

    if (panelDefinition) {
      baseTabs.push({
        id: "panel-behavior",
        label: "Panel",
        order: 1,
        content: (
          <div className="space-y-3">
            <div className="text-xs text-neutral-500">
              Defaults are defined by the panel type. Overrides apply globally for this user.
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  Allow multiple instances
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Default: {supportsMultipleDefault ? "Allowed" : "Single"} - Active:{" "}
                  {supportsMultipleResolved ? "Allowed" : "Single"}
                </div>
              </div>
              <select
                value={
                  supportsMultipleOverrideValue === undefined
                    ? "default"
                    : supportsMultipleOverrideValue
                      ? "allow"
                      : "single"
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "default") {
                    clearRegistryOverride(metadata.id as PanelId);
                  } else {
                    setRegistryOverride(metadata.id as PanelId, {
                      supportsMultipleInstances: value === "allow",
                    });
                  }
                }}
                className="text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
              >
                <option value="default">Use Default</option>
                <option value="allow">Allow</option>
                <option value="single">Single</option>
              </select>
            </div>
          </div>
        ),
      });
    }

    if (selectedInstanceId) {
      baseTabs.push({
        id: "instance-settings",
        label: "Instance",
        order: 5,
        content: (
          <div className="space-y-4">
            <div className="text-xs text-neutral-500">
              Instance: <span className="font-mono">{selectedInstanceId}</span>
            </div>

            {/* Instance scope toggles */}
            {scopeDefinitions.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Scope Settings
                </h4>
                {scopeDefinitions.map((scope) => {
                  const mode = getScopeMode(instanceScopes, scope);

                  return (
                    <div
                      key={scope.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700"
                    >
                      <div>
                        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                          {scope.label}
                        </div>
                        {scope.description && (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {scope.description}
                          </div>
                        )}
                      </div>
                      <ScopeModeSelect
                        value={mode}
                        onChange={(next) =>
                          setScope(selectedInstanceId, metadata.id, scope.id, next)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Instance panel settings (if panel has settingsForm) */}
            {panelDefinition?.settingsForm && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Panel Settings Overrides
                  </h4>
                  {hasInstancePanelOverrides && (
                    <button
                      type="button"
                      onClick={() => clearInstancePanelSettings(selectedInstanceId)}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      Clear all overrides
                    </button>
                  )}
                </div>
                {hasInstancePanelOverrides && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                    This instance has custom settings. Changes here override global panel settings.
                  </div>
                )}
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 p-4">
                  <PanelSchemaRenderer
                    schema={panelDefinition.settingsForm}
                    values={instanceSchemaValues}
                    setValue={(fieldId, value) =>
                      setInstancePanelSetting(selectedInstanceId, metadata.id, fieldId, value)
                    }
                    instanceOverrides={instancePanelSettings}
                    onResetField={(fieldId) =>
                      clearInstancePanelSettingField(selectedInstanceId, fieldId)
                    }
                  />
                </div>
              </div>
            )}

            {/* Instance component settings */}
            {hasComponentSettings && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Component Settings Overrides
                </h4>
                <div className="space-y-4">
                  {componentSettings.map((componentId) => (
                    <InstanceComponentSettingsCard
                      key={componentId}
                      componentId={componentId}
                      instanceId={selectedInstanceId}
                      panelId={metadata.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {!panelDefinition?.settingsForm && !hasComponentSettings && scopeDefinitions.length === 0 && (
              <div className="text-sm text-neutral-500">
                No instance-level settings available for this panel.
              </div>
            )}

            {onClearInstance && (
              <button
                type="button"
                onClick={onClearInstance}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                Clear instance selection
              </button>
            )}
          </div>
        ),
      });
    }

    if (hasComponentSettings) {
      baseTabs.push({
        id: "component-settings",
        label: "Components",
        order: 8,
        content: (
          <div className="space-y-4">
            {componentSettings.map((componentId) => (
              <ComponentSettingsCard key={componentId} componentId={componentId} />
            ))}
          </div>
        ),
      });
    }

    if (hasPanelSettings && panelDefinition) {
      baseTabs.push({
        id: "panel-settings",
        label: "Panel Settings",
        order: 10,
        content: (
          <PanelSettingsErrorBoundary panelId={metadata.id}>
            {panelDefinition.settingsComponent ? (
              <panelDefinition.settingsComponent settings={panelSettings} helpers={helpers} />
            ) : panelDefinition.settingsSections ? (
              <div className="space-y-6">
                {panelDefinition.settingsSections.map((section) => (
                  <div key={section.id} className="space-y-2">
                    <div>
                      <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {section.title}
                      </h4>
                      {section.description && (
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                          {section.description}
                        </p>
                      )}
                    </div>
                    <section.component settings={panelSettings} helpers={helpers} />
                  </div>
                ))}
              </div>
            ) : panelDefinition.settingsForm ? (
              <PanelSchemaRenderer
                schema={panelDefinition.settingsForm}
                values={schemaValues}
                setValue={(fieldId, value) => helpers.set(fieldId as any, value)}
              />
            ) : null}
          </PanelSettingsErrorBoundary>
        ),
      });
    }

    if (hasInteractionRules) {
      baseTabs.push({
        id: "panel-interactions",
        label: "Interactions",
        order: 20,
        content: (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              How this panel behaves when other panels open or close.
            </p>

            {metadata.interactionRules?.whenOpens && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  When Other Panels Open
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(metadata.interactionRules.whenOpens).map(
                    ([panelId, action]) => (
                      <div
                        key={panelId}
                        className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700"
                      >
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {allPanels.find((p) => p.id === panelId)?.title || panelId}
                        </span>
                        <span className="text-xs font-mono px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                          {action}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {metadata.interactionRules?.whenCloses && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  When Other Panels Close
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(metadata.interactionRules.whenCloses).map(
                    ([panelId, action]) => (
                      <div
                        key={panelId}
                        className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700"
                      >
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {allPanels.find((p) => p.id === panelId)?.title || panelId}
                        </span>
                        <span className="text-xs font-mono px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                          {action}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {metadata.retraction?.canRetract && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Retraction Behavior
                </h4>
                <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">Can retract:</span>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">Yes</span>
                    </div>
                    {metadata.retraction.retractedWidth && (
                      <div className="flex justify-between">
                        <span className="text-neutral-600 dark:text-neutral-400">Retracted width:</span>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {metadata.retraction.retractedWidth}px
                        </span>
                      </div>
                    )}
                    {metadata.retraction.animationDuration && (
                      <div className="flex justify-between">
                        <span className="text-neutral-600 dark:text-neutral-400">Animation:</span>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {metadata.retraction.animationDuration}ms
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ),
      });
    }

    if (hasCustomTabs && panelDefinition?.settingsTabs) {
      panelDefinition.settingsTabs.forEach((tab) => {
        baseTabs.push({
          id: tab.id,
          label: tab.label,
          order: tab.order ?? 50,
          content: (
            <PanelSettingsErrorBoundary panelId={metadata.id} sectionId={tab.id}>
              <tab.component settings={panelSettings} helpers={helpers} />
            </PanelSettingsErrorBoundary>
          ),
        });
      });
    }

    return baseTabs.sort((a, b) => a.order - b.order);
  }, [
    allPanels,
    instanceScopes,
    scopeDefinitions,
    selectedInstanceId,
    setScope,
    hasCustomTabs,
    hasInteractionRules,
    hasPanelSettings,
    helpers,
    metadata.id,
    metadata.interactionRules,
    metadata.retraction,
    panelDefinition,
    panelSettings,
    schemaValues,
    onClearInstance,
    componentSettings,
    hasComponentSettings,
    componentRegistryVersion,
    supportsMultipleDefault,
    supportsMultipleResolved,
    supportsMultipleOverrideValue,
    setRegistryOverride,
    clearRegistryOverride,
    // Instance settings
    hasInstancePanelOverrides,
    instanceSchemaValues,
    instancePanelSettings,
    setInstancePanelSetting,
    clearInstancePanelSettings,
    clearInstancePanelSettingField,
  ]);

  const [activeTabId, setActiveTabId] = useState<string | null>(
    tabs[0]?.id ?? null
  );

  // Auto-select Instance tab when an instance is selected
  useEffect(() => {
    if (selectedInstanceId) {
      setActiveTabId("instance-settings");
    }
  }, [selectedInstanceId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {metadata.title}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {metadata.type === 'dockview-container'
              ? 'Container panel with resizable sub-panels'
              : 'Simple panel'}
            {metadata.defaultZone && ` - ${metadata.defaultZone} zone`}
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        <div className="mb-6 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Panel Status
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                {isEnabled ? 'Panel is enabled and active' : 'Panel is disabled and hidden'}
              </p>
            </div>
            <button
              onClick={() => togglePanel(metadata.id)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-neutral-300 dark:bg-neutral-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-4">
          {tabs.length > 1 && (
            <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab?.id === tab.id
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {activeTab ? (
            <div className="space-y-3">{activeTab.content}</div>
          ) : (
            <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
              No additional settings available for this panel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PanelCentricSettings() {
  const allPanels = useMemo(() => getAllPanelMetadata(), []);
  const selectedPanelId = usePanelSettingsUiStore((state) => state.selectedPanelId);
  const selectedInstanceId = usePanelSettingsUiStore((state) => state.selectedInstanceId);
  const setSelection = usePanelSettingsUiStore((state) => state.setSelection);
  const clearInstanceSelection = usePanelSettingsUiStore((state) => state.clearInstanceSelection);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!selectedPanelId && allPanels.length > 0) {
      setSelection(allPanels[0].id, null);
    }
  }, [selectedPanelId, allPanels, setSelection]);

  // Filter panels by search
  const filteredPanels = useMemo(() => {
    if (!searchQuery.trim()) return allPanels;

    const query = searchQuery.toLowerCase();
    return allPanels.filter((p) =>
      p.title.toLowerCase().includes(query)
    );
  }, [allPanels, searchQuery]);

  const selectedPanel = useMemo(
    () => allPanels.find((p) => p.id === selectedPanelId),
    [allPanels, selectedPanelId]
  );

  return (
    <div className="h-full flex">
      {/* Left Sidebar - Panel List */}
      <div className="w-64 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        {/* Search */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <input
            type="text"
            placeholder="Search panels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />
        </div>

        {/* Panel List */}
        <div className="flex-1 overflow-auto">
          {filteredPanels.length === 0 ? (
            <div className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No panels found
            </div>
          ) : (
            <div className="p-2">
              {filteredPanels.map((panel) => (
                <button
                  key={panel.id}
                  onClick={() => setSelection(panel.id, null)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                    selectedPanelId === panel.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="font-medium text-sm">{panel.title}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {panel.type === 'dockview-container' ? 'Container' : 'Panel'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel Count */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400">
          {filteredPanels.length} panel{filteredPanels.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Right Panel - Panel Details */}
      <div className="flex-1 bg-white dark:bg-neutral-900">
        {selectedPanel ? (
          <PanelDetailView
            metadata={selectedPanel}
            selectedInstanceId={selectedInstanceId}
            onClearInstance={clearInstanceSelection}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a panel to view its settings
          </div>
        )}
      </div>
    </div>
  );
}
