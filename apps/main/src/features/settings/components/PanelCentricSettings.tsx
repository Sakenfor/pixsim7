/**
 * Panel-Centric Settings Component
 *
 * Master-detail layout for panel settings:
 * - Left sidebar: List of all panels
 * - Right panel: All settings for the selected panel
 */

import { SearchInput } from '@pixsim7/shared.ui';
import { useState, useMemo, useEffect } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { getAllPanelMetadata } from '@features/panels/lib/panelMetadataRegistry';
import type { PanelMetadata } from '@features/panels/lib/types';

import { usePanelSettingsUiStore } from '../stores/panelSettingsUiStore';

import { PanelDetailView } from './PanelDetailView';

interface PanelSettingsListItem {
  id: string;
  title: string;
  category?: string;
  panelRole?: string;
  description?: string;
  tags?: string[];
  updatedAt?: string;
  changeNote?: string;
  featureHighlights?: string[];
  metadata: PanelMetadata;
}

function parseUpdatedAt(value?: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function formatUpdatedAt(value?: string): string | null {
  const ts = parseUpdatedAt(value);
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PanelCentricSettings() {
  const allPanels = useMemo<PanelSettingsListItem[]>(() => {
    const orchestrationById = new Map(
      getAllPanelMetadata().map((metadata) => [metadata.id, metadata]),
    );

    return panelSelectors.getPublicPanels()
      .map((panel) => {
        const metadata: PanelMetadata =
          orchestrationById.get(panel.id) ??
          (panel.orchestration
            ? { id: panel.id, title: panel.title, ...panel.orchestration }
            : { id: panel.id, title: panel.title, type: 'zone-panel' });

        return {
          id: panel.id,
          title: panel.title,
          category: panel.category,
          panelRole: panel.panelRole,
          description: panel.description,
          tags: panel.tags,
          updatedAt: panel.updatedAt,
          changeNote: panel.changeNote,
          featureHighlights: panel.featureHighlights,
          metadata,
        };
      })
      .sort((a, b) => {
        const tsDiff = parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt);
        if (tsDiff !== 0) return tsDiff;
        return a.title.localeCompare(b.title);
      });
  }, []);
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
      p.title.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query) ||
      p.panelRole?.toLowerCase().includes(query) ||
      p.changeNote?.toLowerCase().includes(query) ||
      p.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
      p.featureHighlights?.some((item) => item.toLowerCase().includes(query))
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
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search panels..."
            size="md"
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
                    {panel.category ?? 'custom'}
                    {panel.panelRole ? ` · ${panel.panelRole}` : ''}
                    {formatUpdatedAt(panel.updatedAt) ? ` | Updated ${formatUpdatedAt(panel.updatedAt)}` : ''}
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
            metadata={selectedPanel.metadata}
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
