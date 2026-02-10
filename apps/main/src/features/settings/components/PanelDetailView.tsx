/**
 * Panel Detail View
 *
 * The main detail panel shown on the right side of the panel-centric settings layout.
 * Displays all settings, interaction rules, and instance overrides for a selected panel.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { componentRegistry } from '@features/componentSettings';
import { ScopeModeSelect } from '@features/panels/components/shared/ScopeModeSelect';
import { useResolvePanelSettings } from '@features/panels/lib/instanceSettingsResolver';
import { getAllPanelMetadata, type PanelMetadata } from '@features/panels/lib/panelMetadataRegistry';
import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';
import { panelSettingsScopeRegistry, getScopeMode } from '@features/panels/lib/panelSettingsScopes';
import { usePanelConfigStore } from '@features/panels/stores/panelConfigStore';
import { usePanelInstanceSettingsStore } from '@features/panels/stores/panelInstanceSettingsStore';
import type { PanelId } from '@features/workspace';

import { resolveSchemaValues } from '../lib/core/schemaUtils';

import { PanelSchemaRenderer } from './PanelSchemaRenderers';
import { ComponentSettingsCard, InstanceComponentSettingsCard } from './PanelSettingsCards';
import { PanelSettingsErrorBoundary } from './PanelSettingsErrorBoundary';

// Stable empty object to avoid re-renders
const EMPTY_SETTINGS = {};

export interface PanelDetailViewProps {
  metadata: PanelMetadata;
  selectedInstanceId?: string | null;
  onClearInstance?: () => void;
}

export function PanelDetailView({ metadata, selectedInstanceId, onClearInstance }: PanelDetailViewProps) {
  const allPanels = useMemo(() => getAllPanelMetadata(), []);
  const panelId = metadata.id as PanelId;
  // Get panel definition from registry (for panel-specific settings)
  const panelDefinition = useMemo(
    () => panelSelectors.getAll().find((p) => p.id === metadata.id),
    [metadata.id]
  );
  const [componentRegistryVersion, setComponentRegistryVersion] = useState(0);
  const panelRegistryOverride = usePanelConfigStore(
    (state) => state.panelConfigs[panelId]?.registryOverride
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
    state.panelConfigs?.[panelId]?.enabled ?? true
  );
  const togglePanel = usePanelConfigStore((state) => state.togglePanel);

  // Get update function from store
  const updatePanelSettings = usePanelConfigStore((state) => state.updatePanelSettings);

  // Get current panel settings
  const panelSettings = usePanelConfigStore((state) => {
    const settings = state.panelConfigs?.[panelId]?.settings;
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
      updatePanelSettings(panelId, settings);
    },
    [panelId, updatePanelSettings]
  );

  // Get helpers for panel settings
  const helpers = usePanelSettingsHelpers(panelId, panelSettings, onUpdateSettings);

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
  const resolvedInstancePanelSettings = useResolvePanelSettings(panelId, selectedInstanceId);
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
                    clearRegistryOverride(panelId);
                  } else {
                    setRegistryOverride(panelId, {
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
                          setScope(selectedInstanceId, panelId, scope.id, next)
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
                      setInstancePanelSetting(selectedInstanceId, panelId, fieldId, value)
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
                      panelId={panelId}
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
          <PanelSettingsErrorBoundary panelId={panelId}>
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
            <PanelSettingsErrorBoundary panelId={panelId} sectionId={tab.id}>
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
    panelId,
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
              onClick={() => togglePanel(panelId)}
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
