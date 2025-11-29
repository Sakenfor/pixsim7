/**
 * Panel Configuration Panel
 *
 * Manage panel visibility, settings, and organization.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 */

import { useState, useMemo } from 'react';
import { usePanelConfigStore } from '@/stores/panelConfigStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { pluginCatalog } from '@/lib/plugins/pluginSystem';
import { BADGE_CONFIG_PRESETS, findMatchingPreset } from '@/lib/gallery/badgeConfigPresets';

type ViewMode = 'grid' | 'list';
type FilterCategory = 'all' | 'core' | 'development' | 'game' | 'tools' | 'custom';

export function PanelConfigurationPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const panelConfigs = usePanelConfigStore((s) => s.panelConfigs);
  const togglePanelEnabled = usePanelConfigStore((s) => s.togglePanelEnabled);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);
  const searchPanels = usePanelConfigStore((s) => s.searchPanels);
  const getPanelsByCategory = usePanelConfigStore((s) => s.getPanelsByCategory);

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);

  const [graphEditorSelectorOpen, setGraphEditorSelectorOpen] = useState(false);

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
      core: all.filter((p) => p.category === 'core').length,
      development: all.filter((p) => p.category === 'development').length,
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <h2 className="text-xl font-bold mb-4">Panel Configuration</h2>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search panels..."
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          />
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 flex-wrap mb-4">
          {(['all', 'core', 'development', 'game', 'tools', 'custom'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat]})
            </button>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === 'grid'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Panel List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredPanels.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            {searchQuery ? 'No panels match your search' : 'No panels available'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPanels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                onToggle={() => handleTogglePanel(panel.id)}
                onOpen={() => handleOpenPanel(panel.id)}
                onUpdateSettings={(settings) =>
                  updatePanelSettings(panel.id as any, settings)
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPanels.map((panel) => (
              <PanelListItem
                key={panel.id}
                panel={panel}
                onToggle={() => handleTogglePanel(panel.id)}
                onOpen={() => handleOpenPanel(panel.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Panel Card Component (Grid View)
function PanelCard({
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

  return (
    <div
      className={`
        p-4 rounded-lg border-2 transition-all
        ${
          panel.enabled
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-neutral-200 dark:border-neutral-700 opacity-60'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {panel.icon && <span className="text-2xl">{panel.icon}</span>}
          <div>
            <h3 className="font-semibold text-sm">{panel.id}</h3>
            <div className="flex gap-1 mt-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                  from: {pluginMeta.origin}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Enable Toggle */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={panel.enabled}
            onChange={onToggle}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
        </label>
      </div>

      {/* Description + Advanced Settings */}
      <div className="mb-3 space-y-2">
        {panel.description && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{panel.description}</p>
        )}

        {/* Graph panel advanced settings: choose active graph editor */}
        {panel.id === 'graph' && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-500">
              Active editor:{' '}
              <span className="font-mono">
                {panel.settings?.graphEditorId || 'scene-graph-v2'}
              </span>
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onUpdateSettings({ graphEditorId: 'scene-graph-v2' })}
                className={`flex-1 px-2 py-1 rounded text-[11px] border ${
                  (panel.settings?.graphEditorId || 'scene-graph-v2') === 'scene-graph-v2'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600'
                }`}
              >
                Scene Graph
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ graphEditorId: 'arc-graph' })}
                className={`flex-1 px-2 py-1 rounded text-[11px] border ${
                  panel.settings?.graphEditorId === 'arc-graph'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600'
                }`}
              >
                Arc Graph
              </button>
            </div>
          </div>
        )}

        {/* Gallery panel badge configuration */}
        {panel.id === 'gallery' && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
              Card Badges
            </span>

            {/* Preset Selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Quick Presets:</span>
              <div className="grid grid-cols-2 gap-1">
                {BADGE_CONFIG_PRESETS.map(preset => {
                  const isActive = findMatchingPreset(panel.settings?.badgeConfig || {}) === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateSettings({ badgeConfig: preset.config })}
                      className={`px-2 py-1 rounded text-[10px] border transition-colors text-left ${
                        isActive
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
                      }`}
                      title={preset.description}
                    >
                      {preset.icon && <span className="mr-1">{preset.icon}</span>}
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual Toggles */}
            <div className="flex flex-col gap-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Custom:</span>
              <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showPrimaryIcon ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showPrimaryIcon: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Media type icon</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showStatusIcon ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showStatusIcon: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Status icon</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showStatusTextOnHover ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showStatusTextOnHover: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Status text on hover</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showTagsInOverlay ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showTagsInOverlay: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Tags in overlay</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showFooterProvider ?? false}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showFooterProvider: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Footer provider</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showFooterDate ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showFooterDate: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Footer date</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.enableBadgePulse ?? false}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      enableBadgePulse: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                />
                <span>Enable badge pulse</span>
              </label>
              </div>
            </div>

            {/* Generation Actions Section */}
            <div className="flex flex-col gap-1 pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400">Generation Actions:</span>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={panel.settings?.badgeConfig?.showGenerationBadge ?? true}
                    onChange={(e) => onUpdateSettings({
                      badgeConfig: {
                        ...panel.settings?.badgeConfig,
                        showGenerationBadge: e.target.checked,
                      }
                    })}
                    className="w-3 h-3"
                  />
                  <span>⚡ Generation badge</span>
                </label>
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={panel.settings?.badgeConfig?.showGenerationInMenu ?? true}
                    onChange={(e) => onUpdateSettings({
                      badgeConfig: {
                        ...panel.settings?.badgeConfig,
                        showGenerationInMenu: e.target.checked,
                      }
                    })}
                    className="w-3 h-3"
                  />
                  <span>Show in menu</span>
                </label>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={panel.settings?.badgeConfig?.showGenerationOnHoverOnly ?? true}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      showGenerationOnHoverOnly: e.target.checked,
                    }
                  })}
                  className="w-3 h-3"
                  disabled={!(panel.settings?.badgeConfig?.showGenerationBadge ?? true)}
                />
                <span>Only show on hover</span>
              </label>

              {/* Quick Action Selector */}
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Quick Action:</span>
                <select
                  value={panel.settings?.badgeConfig?.generationQuickAction ?? 'auto'}
                  onChange={(e) => onUpdateSettings({
                    badgeConfig: {
                      ...panel.settings?.badgeConfig,
                      generationQuickAction: e.target.value as any,
                    }
                  })}
                  className="px-2 py-1 text-[10px] border rounded bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                >
                  <option value="auto">Auto (Smart Default)</option>
                  <option value="image_to_video">Image → Video</option>
                  <option value="video_extend">Video Extend</option>
                  <option value="add_to_transition">Add to Transition</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      {panel.tags && panel.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {panel.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onOpen}
          disabled={!panel.enabled}
          className="flex-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
        >
          Open Panel
        </button>
      </div>
    </div>
  );
}

// Panel List Item Component (List View)
function PanelListItem({
  panel,
  onToggle,
  onOpen,
}: {
  panel: any;
  onToggle: () => void;
  onOpen: () => void;
}) {
  // Get plugin metadata
  const pluginMeta = pluginCatalog.get(panel.id);

  return (
    <div
      className={`
        p-3 rounded-lg border flex items-center justify-between transition-all
        ${
          panel.enabled
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-neutral-200 dark:border-neutral-700 opacity-60'
        }
      `}
    >
      <div className="flex items-center gap-3 flex-1">
        {panel.icon && <span className="text-xl">{panel.icon}</span>}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">{panel.id}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                from: {pluginMeta.origin}
              </span>
            )}
          </div>
          {panel.description && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {panel.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpen}
          disabled={!panel.enabled}
          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
        >
          Open
        </button>

        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={panel.enabled}
            onChange={onToggle}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
        </label>
      </div>
    </div>
  );
}
