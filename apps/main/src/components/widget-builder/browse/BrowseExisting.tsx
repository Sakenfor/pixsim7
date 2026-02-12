/**
 * BrowseExisting
 *
 * Dynamic browser for all registered plugin families.
 * Uses the browsable families registry to discover and display
 * plugin families without hardcoding.
 */

import { Panel } from '@pixsim7/shared.ui';
import { useState, useMemo } from 'react';

import { Icon } from '@lib/icons';
import {
  useBrowsableFamilies,
  type BrowsableFamilyConfig,
} from '@lib/plugins/browsableFamilies';
import { pluginCatalog } from '@lib/plugins/pluginSystem';
import {
  overlayWidgets,
  blockWidgets,
  chromeWidgets,
} from '@lib/widgets';

import { SurfaceWorkbench } from '@/components/surface-workbench';

import { FamilyItemInspector } from './FamilyItemInspector';
import { FamilyTable } from './FamilyTable';

const CATEGORY_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  generation: 'Generation',
  widgets: 'Widgets',
  tools: 'Tools',
  system: 'System',
};

export function BrowseExisting() {
  const browsableFamilies = useBrowsableFamilies();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(
    browsableFamilies[0]?.family || null
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Get items for selected family
  const selectedFamily = useMemo(
    () => browsableFamilies.find((f) => f.family === selectedFamilyId),
    [browsableFamilies, selectedFamilyId]
  );

  const items = useMemo(() => {
    if (!selectedFamily) return [];
    if (selectedFamily.getItems) {
      return selectedFamily.getItems();
    }
    return pluginCatalog.getPluginsByFamily(selectedFamily.family);
  }, [selectedFamily]);

  const selectedItem = useMemo(
    () => items.find((item: any) => item.id === selectedItemId),
    [items, selectedItemId]
  );

  // Group families by category
  const familiesByCategory = useMemo(() => {
    const grouped = new Map<string, BrowsableFamilyConfig[]>();
    for (const family of browsableFamilies) {
      const cat = family.category || 'system';
      if (!grouped.has(cat)) {
        grouped.set(cat, []);
      }
      grouped.get(cat)!.push(family);
    }
    return grouped;
  }, [browsableFamilies]);

  const sidebar = (
    <div className="space-y-4">
      {/* Family selector */}
      {Array.from(familiesByCategory.entries()).map(([category, families]) => (
        <Panel key={category} className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <div className="space-y-1">
            {families.map((family) => {
              const count = family.getItems
                ? family.getItems().length
                : pluginCatalog.getByFamily(family.family).length;

              return (
                <button
                  key={family.family}
                  onClick={() => {
                    setSelectedFamilyId(family.family);
                    setSelectedItemId(null);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                    selectedFamilyId === family.family
                      ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon name={family.icon} size={16} />
                    <span className="font-medium">{family.label}</span>
                    <span className="ml-auto text-xs text-neutral-500">{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      ))}

      {/* Legacy widget stats */}
      <Panel className="space-y-3">
        <h3 className="text-xs font-medium text-neutral-500 uppercase">Overlay Widgets</h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
            <div className="text-lg font-bold">{overlayWidgets.getAll().length}</div>
            <div className="text-xs text-neutral-500">Overlay</div>
          </div>
          <div className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
            <div className="text-lg font-bold">{blockWidgets.getAll().length}</div>
            <div className="text-xs text-neutral-500">Blocks</div>
          </div>
          <div className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
            <div className="text-lg font-bold">{chromeWidgets.getAll().length}</div>
            <div className="text-xs text-neutral-500">Chrome</div>
          </div>
        </div>
      </Panel>
    </div>
  );

  const preview = selectedFamily ? (
    <Panel className="h-full overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Icon name={selectedFamily.icon} size={20} />
        <div>
          <h3 className="text-sm font-semibold">{selectedFamily.label}</h3>
          <p className="text-xs text-neutral-500">{selectedFamily.description}</p>
        </div>
        <span className="ml-auto px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-sm">
          {items.length} items
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <FamilyTable
          config={selectedFamily}
          items={items}
          selectedId={selectedItemId}
          onSelect={setSelectedItemId}
        />
      </div>
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <p className="text-neutral-500">Select a family to browse</p>
    </Panel>
  );

  const inspector = selectedItem && selectedFamily ? (
    <FamilyItemInspector config={selectedFamily} item={selectedItem} />
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <div className="text-center text-neutral-500">
        <p className="text-sm">Select an item to view details</p>
      </div>
    </Panel>
  );

  return (
    <SurfaceWorkbench
      title=""
      showHeader={false}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}
