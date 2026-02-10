/**
 * Panel-Centric Settings Component
 *
 * Master-detail layout for panel settings:
 * - Left sidebar: List of all panels
 * - Right panel: All settings for the selected panel
 */

import { useState, useMemo, useEffect } from 'react';

import { getAllPanelMetadata } from '@features/panels/lib/panelMetadataRegistry';

import { usePanelSettingsUiStore } from '../stores/panelSettingsUiStore';

import { PanelDetailView } from './PanelDetailView';

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
