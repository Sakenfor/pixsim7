/**
 * Panel-Centric Settings Component
 *
 * Master-detail layout for panel settings:
 * - Left sidebar: List of all panels
 * - Right panel: All settings for the selected panel
 */

import { useState, useMemo, useCallback } from 'react';
import {
  getAllPanelMetadata,
  type PanelMetadata,
  panelRegistry,
  usePanelConfigStore,
} from '@features/panels';
import { PanelSettingsErrorBoundary } from './PanelSettingsErrorBoundary';
import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';

// Stable empty object to avoid re-renders
const EMPTY_SETTINGS = {};

interface PanelDetailViewProps {
  metadata: PanelMetadata;
}

function PanelDetailView({ metadata }: PanelDetailViewProps) {
  const allPanels = useMemo(() => getAllPanelMetadata(), []);
  // Get panel definition from registry (for panel-specific settings)
  const panelDefinition = useMemo(
    () => panelRegistry.getAll().find((p) => p.id === metadata.id),
    [metadata.id]
  );

  // Check if has interaction rules
  const hasInteractionRules = !!(
    metadata.interactionRules?.whenOpens ||
    metadata.interactionRules?.whenCloses
  );

  // Check if has panel-specific settings
  const hasPanelSettings = !!(
    panelDefinition?.settingsComponent || panelDefinition?.settingsSections
  );
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

  // Create update callback
  const onUpdateSettings = useCallback(
    (settings: Record<string, any>) => {
      updatePanelSettings(metadata.id, settings);
    },
    [metadata.id, updatePanelSettings]
  );

  // Get helpers for panel settings
  const helpers = usePanelSettingsHelpers(metadata.id, panelSettings, onUpdateSettings);

  const tabs = useMemo(() => {
    const baseTabs: Array<{ id: string; label: string; order: number; content: JSX.Element }> = [];

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
    hasCustomTabs,
    hasInteractionRules,
    hasPanelSettings,
    helpers,
    metadata.id,
    metadata.interactionRules,
    metadata.retraction,
    panelDefinition,
    panelSettings,
  ]);

  const [activeTabId, setActiveTabId] = useState<string | null>(
    tabs[0]?.id ?? null
  );

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
            {metadata.defaultZone && ` · ${metadata.defaultZone} zone`}
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
  const [selectedPanelId, setSelectedPanelId] = useState<string>(allPanels[0]?.id);
  const [searchQuery, setSearchQuery] = useState('');

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
                  onClick={() => setSelectedPanelId(panel.id)}
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
          <PanelDetailView metadata={selectedPanel} />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a panel to view its settings
          </div>
        )}
      </div>
    </div>
  );
}
