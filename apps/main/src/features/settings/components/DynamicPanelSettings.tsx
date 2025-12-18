/**
 * Dynamic Panel Settings Component
 *
 * Dynamically displays settings for all registered panels.
 * Integrates with the existing panel registry's settings system.
 */

import { useMemo, useState, useCallback, useRef } from 'react';
import { panelRegistry, usePanelConfigStore, type PanelDefinition } from '@features/panels';
import { usePanelSettingsHelpers } from '@features/panels/lib/panelSettingsHelpers';
import { PanelSettingsErrorBoundary } from './PanelSettingsErrorBoundary';

// Stable empty object to avoid re-renders
const EMPTY_SETTINGS = {};

interface PanelSettingsSectionProps {
  panel: PanelDefinition;
  isExpanded: boolean;
  onToggle: () => void;
}

function PanelSettingsSection({ panel, isExpanded, onToggle }: PanelSettingsSectionProps) {
  // Get update function from store (stable reference)
  const updatePanelSettings = usePanelConfigStore(state => state.updatePanelSettings);

  // Create update callback for this specific panel (stable reference)
  const onUpdateSettings = useCallback(
    (settings: Record<string, any>) => {
      updatePanelSettings(panel.id, settings);
    },
    [panel.id, updatePanelSettings]
  );

  // Get current settings using shallow equality to avoid unnecessary re-renders
  const panelSettings = usePanelConfigStore(
    useCallback(
      (state: any) => {
        const settings = state.panelConfigs?.[panel.id]?.settings;
        return settings ?? panel.defaultSettings ?? EMPTY_SETTINGS;
      },
      [panel.id, panel.defaultSettings]
    ),
    (a, b) => a === b // Shallow equality check
  );

  // Get update helpers (will be stable because dependencies are stable)
  const helpers = usePanelSettingsHelpers(panel.id, panelSettings, onUpdateSettings);

  // Check if panel has settings
  const hasSettings = !!(panel.settingsComponent || panel.settingsSections);

  if (!hasSettings) {
    return (
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
              {panel.title}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {panel.description || 'No description available'}
            </p>
          </div>
          <span className="text-xs text-neutral-400">No settings</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="text-left">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {panel.title}
          </h3>
          {panel.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {panel.description}
            </p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-neutral-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Settings Content */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-4">
          <PanelSettingsErrorBoundary panelId={panel.id}>
            {panel.settingsComponent ? (
              // Single settings component
              <panel.settingsComponent settings={panelSettings} helpers={helpers} />
            ) : panel.settingsSections ? (
              // Multiple settings sections
              <div className="space-y-6">
                {panel.settingsSections.map(section => (
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
        </div>
      )}
    </div>
  );
}

export function DynamicPanelSettings() {
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Get all registered panels
  const allPanels = useMemo(() => panelRegistry.getAll(), []);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(allPanels.map(p => p.category));
    return ['all', ...Array.from(cats).sort()];
  }, [allPanels]);

  // Filter panels
  const filteredPanels = useMemo(() => {
    let panels = allPanels;

    // Filter by category
    if (selectedCategory !== 'all') {
      panels = panels.filter(p => p.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      panels = panels.filter(
        p =>
          p.title.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return panels;
  }, [allPanels, selectedCategory, searchQuery]);

  // Count panels with settings
  const panelsWithSettings = useMemo(
    () => filteredPanels.filter(p => p.settingsComponent || p.settingsSections).length,
    [filteredPanels]
  );

  const togglePanel = (panelId: string) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedPanels(new Set(filteredPanels.map(p => p.id)));
  };

  const collapseAll = () => {
    setExpandedPanels(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Panel Settings
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Configure individual panel behaviors and preferences
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search panels..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
        />

        {/* Category Filter + Actions */}
        <div className="flex items-center justify-between gap-3">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Showing {filteredPanels.length} panels ({panelsWithSettings} with settings)
        </div>
      </div>

      {/* Panel List */}
      <div className="space-y-3">
        {filteredPanels.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
            No panels found matching your search.
          </div>
        ) : (
          filteredPanels.map(panel => (
            <PanelSettingsSection
              key={panel.id}
              panel={panel}
              isExpanded={expandedPanels.has(panel.id)}
              onToggle={() => togglePanel(panel.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
