/**
 * @deprecated Use PanelCentricSettings instead.
 *
 * Panel Configuration Panel
 *
 * Manage panel visibility, settings, and organization.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 *
 * Redesigned with tab-based interface for better settings visibility
 */

import { useState, useMemo } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';
import { pluginCatalog } from '@lib/plugins/pluginSystem';

import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';
import { usePanelConfigStore } from '@features/panels/stores/panelConfigStore';
import { useWorkspaceStore } from '@features/workspace';


import { PanelSettingsErrorBoundary } from './PanelSettingsErrorBoundary';

type FilterCategory = 'all' | 'workspace' | 'dev' | 'game' | 'tools' | 'custom';

export function PanelConfigurationPanel() {
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const panelConfigs = usePanelConfigStore((s) => s.panelConfigs);
  const togglePanelEnabled = usePanelConfigStore((s) => s.togglePanelEnabled);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);
  const searchPanels = usePanelConfigStore((s) => s.searchPanels);

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Filter panels based on search and category
  const filteredPanels = useMemo(() => {
    let panels = Object.values(panelConfigs);

    // Search filter
    if (searchQuery.trim()) {
      panels = searchPanels(searchQuery);
    }

    // Category filter
    if (filterCategory !== 'all') {
      panels = panels.filter((p) => p.category === filterCategory);
    }

    return panels;
  }, [panelConfigs, searchQuery, filterCategory, searchPanels]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const all = Object.values(panelConfigs);
    return {
      all: all.length,
      workspace: all.filter((p) => p.category === 'workspace').length,
      dev: all.filter((p) => p.category === 'dev').length,
      game: all.filter((p) => p.category === 'game').length,
      tools: all.filter((p) => p.category === 'tools').length,
      custom: all.filter((p) => p.category === 'custom').length,
    };
  }, [panelConfigs]);

  const handleTogglePanel = (panelId: string) => {
    togglePanelEnabled(panelId as any);
  };

  const handleOpenPanel = (panelId: string) => {
    openFloatingPanel(panelId as any, { width: 800, height: 600 });
  };

  // Auto-select first panel if none selected
  const selectedPanel = useMemo(() => {
    if (!selectedPanelId && filteredPanels.length > 0) {
      const firstPanel = filteredPanels[0];
      setSelectedPanelId(firstPanel.id);
      return firstPanel;
    }
    return filteredPanels.find(p => p.id === selectedPanelId) || null;
  }, [selectedPanelId, filteredPanels]);

  return (
    <div className="h-full flex bg-white dark:bg-neutral-900">
      {/* Sidebar - Panel List as Tabs */}
      <div className="w-64 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-bold mb-3">Panels</h2>

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full px-2 py-1.5 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          />
        </div>

        {/* Category Filters */}
        <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-col gap-1">
            {(['all', 'workspace', 'dev', 'game', 'tools', 'custom'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors text-left ${
                  filterCategory === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat]})
              </button>
            ))}
          </div>
        </div>

        {/* Panel Tabs List */}
        <div className="flex-1 overflow-y-auto">
          {filteredPanels.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-neutral-500">
              {searchQuery ? 'No panels match your search' : 'No panels available'}
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredPanels.map((panel) => {
                const isSelected = selectedPanelId === panel.id;
                return (
                  <button
                    key={panel.id}
                    onClick={() => setSelectedPanelId(panel.id)}
                    className={`
                      p-3 border-b border-neutral-200 dark:border-neutral-700 text-left transition-colors
                      ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800 border-l-4 border-l-transparent'
                      }
                      ${!panel.enabled ? 'opacity-50' : ''}
                    `}
                  >
                    <div className="flex items-start gap-2">
                      {panel.icon && <span className="text-lg">{panel.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate">{panel.id}</div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              panel.category === 'workspace'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : panel.category === 'dev'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : panel.category === 'game'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {panel.category}
                          </span>
                        </div>
                      </div>
                      {/* Enabled indicator */}
                      <div className={`w-2 h-2 rounded-full mt-1 ${panel.enabled ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Panel Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPanel ? (
          <PanelDetailView
            panel={selectedPanel}
            onToggle={() => handleTogglePanel(selectedPanel.id)}
            onOpen={() => handleOpenPanel(selectedPanel.id)}
            onUpdateSettings={(settings) =>
              updatePanelSettings(selectedPanel.id as any, settings)
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500">
            Select a panel to configure
          </div>
        )}
      </div>
    </div>
  );
}

// Panel Detail View Component (Tab Content)
function PanelDetailView({
  panel,
  onToggle,
  onOpen,
  onUpdateSettings,
}: {
  panel: any;
  onToggle: () => void;
  onOpen: () => void;
  onUpdateSettings: (settings: Record<string, any>) => void;
}) {
  // Get plugin metadata
  const pluginMeta = pluginCatalog.get(panel.id);

  // Get panel definition from registry
  const panelDefinition = panelSelectors.get(panel.id);

  // Create settings helpers with debouncing
  const settingsHelpers = usePanelSettingsHelpers(
    panel.id,
    panel.settings || {},
    onUpdateSettings,
    { delay: 300 }
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {panel.icon && <span className="text-3xl">{panel.icon}</span>}
            <div>
              <h2 className="text-xl font-bold">{panel.id}</h2>
              <div className="flex gap-2 mt-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    panel.category === 'core'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : panel.category === 'development'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : panel.category === 'game'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {panel.category}
                </span>
                {pluginMeta && pluginMeta.origin !== 'builtin' && (
                  <span className="text-xs px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                    from: {pluginMeta.origin}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    panel.enabled
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {panel.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onOpen}
              disabled={!panel.enabled}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
            >
              Open Panel
            </button>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={panel.enabled}
                onChange={onToggle}
                className="sr-only peer"
              />
              <div className="w-14 h-8 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-1 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all relative"></div>
            </label>
          </div>
        </div>

        {panel.description && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-3">{panel.description}</p>
        )}
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">
          {panelDefinition?.settingsSections && panelDefinition.settingsSections.length > 0 ? (
            // Render settings sections
            panelDefinition.settingsSections.map((section) => (
              <div key={section.id}>
                {section.title && (
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                      {section.title}
                    </h3>
                    {section.description && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {section.description}
                      </p>
                    )}
                  </div>
                )}
                <PanelSettingsErrorBoundary panelId={panel.id} sectionId={section.id}>
                  <section.component settings={panel.settings || {}} helpers={settingsHelpers} />
                </PanelSettingsErrorBoundary>
              </div>
            ))
          ) : panelDefinition?.settingsComponent ? (
            // Render single settings component
            <PanelSettingsErrorBoundary panelId={panel.id}>
              <panelDefinition.settingsComponent
                settings={panel.settings || {}}
                helpers={settingsHelpers}
              />
            </PanelSettingsErrorBoundary>
          ) : panel.tags && panel.tags.length > 0 ? (
            // Show tags if no settings component
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {panel.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            // Default message
            <div className="text-center py-12 text-neutral-500 text-sm">
              No additional settings available for this panel
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
