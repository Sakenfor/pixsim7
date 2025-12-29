/**
 * RegistriesView - Registries tab for App Map
 *
 * Shows all BaseRegistry extensions with their registered items.
 * Provides visibility into the tool and surface registries.
 */

import { useState, useMemo, useSyncExternalStore } from 'react';

// Tool registries
import { galleryToolRegistry } from '@features/gallery/lib/core/types';
import { brainToolRegistry } from '@features/brainTools/lib/types';
import { worldToolRegistry } from '@features/worldTools/lib/types';

// Surface registries
import { gallerySurfaceRegistry } from '@features/gallery/lib/core/surfaceRegistry';
import { gizmoSurfaceRegistry } from '@features/gizmos/lib/core/surfaceRegistry';

// Interaction registry (dynamically loaded plugin interactions)
import { interactionRegistry } from '@lib/game/interactions/types';
import type { InteractionPlugin, BaseInteractionConfig } from '@lib/game/interactions/types';

// Types
import type { GalleryToolPlugin } from '@features/gallery/lib/core/types';
import type { BrainToolPlugin } from '@features/brainTools/lib/types';
import type { WorldToolPlugin } from '@features/worldTools/lib/types';
import type { GallerySurfaceDefinition } from '@features/gallery/lib/core/surfaceRegistry';
import type { GizmoSurfaceDefinition } from '@features/gizmos/lib/core/surfaceRegistry';
import type { Identifiable } from '@lib/core/BaseRegistry';

/**
 * Registry metadata for display
 */
interface RegistryInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'tools' | 'surfaces' | 'interactions' | 'other';
  getItems: () => Identifiable[];
  subscribe: (cb: () => void) => () => void;
  renderItem: (item: Identifiable) => React.ReactNode;
}

/**
 * Define all registries to display
 */
const REGISTRIES: RegistryInfo[] = [
  {
    id: 'gallery-tools',
    name: 'Gallery Tools',
    description: 'Tools for asset management and visualization',
    icon: '🖼️',
    category: 'tools',
    getItems: () => galleryToolRegistry.getAll(),
    subscribe: (cb) => galleryToolRegistry.subscribe(cb),
    renderItem: (item) => <GalleryToolItem tool={item as GalleryToolPlugin} />,
  },
  {
    id: 'brain-tools',
    name: 'Brain Tools',
    description: 'NPC brain analysis and debugging tools',
    icon: '🧠',
    category: 'tools',
    getItems: () => brainToolRegistry.getAll(),
    subscribe: (cb) => brainToolRegistry.subscribe(cb),
    renderItem: (item) => <BrainToolItem tool={item as BrainToolPlugin} />,
  },
  {
    id: 'world-tools',
    name: 'World Tools',
    description: 'Game world interaction and management tools',
    icon: '🌍',
    category: 'tools',
    getItems: () => worldToolRegistry.getAll(),
    subscribe: (cb) => worldToolRegistry.subscribe(cb),
    renderItem: (item) => <WorldToolItem tool={item as WorldToolPlugin} />,
  },
  {
    id: 'gallery-surfaces',
    name: 'Gallery Surfaces',
    description: 'Different views/modes for the asset gallery',
    icon: '📐',
    category: 'surfaces',
    getItems: () => gallerySurfaceRegistry.getAll(),
    subscribe: (cb) => gallerySurfaceRegistry.subscribe(cb),
    renderItem: (item) => <GallerySurfaceItem surface={item as GallerySurfaceDefinition} />,
  },
  {
    id: 'gizmo-surfaces',
    name: 'Gizmo Surfaces',
    description: 'UI surfaces for gizmos and debug dashboards',
    icon: '🔮',
    category: 'surfaces',
    getItems: () => gizmoSurfaceRegistry.getAll(),
    subscribe: (cb) => gizmoSurfaceRegistry.subscribe(cb),
    renderItem: (item) => <GizmoSurfaceItem surface={item as GizmoSurfaceDefinition} />,
  },
  {
    id: 'interactions',
    name: 'Interactions',
    description: 'Game interactions from plugins (pickpocket, stealth, etc.)',
    icon: '🎮',
    category: 'interactions',
    getItems: () => interactionRegistry.getAll().map((p) => ({ id: p.id, ...p })),
    // Note: InteractionRegistry doesn't have subscribe yet - items won't auto-update
    subscribe: () => () => {},
    renderItem: (item) => (
      <InteractionPluginItem plugin={item as unknown as InteractionPlugin<BaseInteractionConfig>} />
    ),
  },
];

export function RegistriesView() {
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(
    REGISTRIES[0]?.id ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'tools' | 'surfaces' | 'interactions'>('all');

  const filteredRegistries = useMemo(() => {
    if (categoryFilter === 'all') return REGISTRIES;
    return REGISTRIES.filter((r) => r.category === categoryFilter);
  }, [categoryFilter]);

  const selectedRegistry = REGISTRIES.find((r) => r.id === selectedRegistryId);

  return (
    <div className="flex h-full">
      {/* Registry List */}
      <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        {/* Category Filter */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex gap-2">
            {(['all', 'tools', 'surfaces', 'interactions'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Registry List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredRegistries.map((registry) => (
            <RegistryListItem
              key={registry.id}
              registry={registry}
              isSelected={selectedRegistryId === registry.id}
              onSelect={() => setSelectedRegistryId(registry.id)}
            />
          ))}
        </div>

        {/* Summary Stats */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
          <RegistrySummary registries={REGISTRIES} />
        </div>
      </div>

      {/* Registry Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedRegistry ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{selectedRegistry.icon}</span>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    {selectedRegistry.name}
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {selectedRegistry.description}
                  </p>
                </div>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Items */}
            <RegistryItemList
              registry={selectedRegistry}
              searchQuery={searchQuery}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a registry to view items
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Registry list item with live count
 */
function RegistryListItem({
  registry,
  isSelected,
  onSelect,
}: {
  registry: RegistryInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Subscribe to registry changes for live updates
  const count = useSyncExternalStore(
    registry.subscribe,
    () => registry.getItems().length
  );

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-md transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-750'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{registry.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {registry.name}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {registry.category}
          </div>
        </div>
        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm font-medium rounded">
          {count}
        </span>
      </div>
    </button>
  );
}

/**
 * Registry items list with live updates
 */
function RegistryItemList({
  registry,
  searchQuery,
}: {
  registry: RegistryInfo;
  searchQuery: string;
}) {
  // Subscribe to registry changes
  const items = useSyncExternalStore(
    registry.subscribe,
    () => registry.getItems()
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const searchable = JSON.stringify(item).toLowerCase();
      return searchable.includes(query);
    });
  }, [items, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
        Showing {filteredItems.length} of {items.length} items
      </div>
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <div key={item.id}>{registry.renderItem(item)}</div>
        ))}
        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            {items.length === 0
              ? 'No items registered'
              : 'No items match your search'}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Summary of all registries
 */
function RegistrySummary({ registries }: { registries: RegistryInfo[] }) {
  // Get live counts for all registries
  const counts = registries.map((r) => ({
    id: r.id,
    count: useSyncExternalStore(r.subscribe, () => r.getItems().length),
  }));

  const total = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="text-xs text-neutral-600 dark:text-neutral-400">
      <span className="font-medium">{total}</span> total items across{' '}
      <span className="font-medium">{registries.length}</span> registries
    </div>
  );
}

// =============================================================================
// Item Renderers
// =============================================================================

function GalleryToolItem({ tool }: { tool: GalleryToolPlugin }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {tool.icon && <span className="text-lg">{tool.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {tool.name}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {tool.id}
            </div>
          </div>
          {tool.category && (
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
              {tool.category}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          <div className="text-neutral-700 dark:text-neutral-300">
            {tool.description}
          </div>
          {tool.supportedSurfaces && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Surfaces: </span>
              {tool.supportedSurfaces.join(', ')}
            </div>
          )}
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Visibility: </span>
            {tool.whenVisible ? 'Conditional' : 'Always'}
          </div>
        </div>
      )}
    </div>
  );
}

function BrainToolItem({ tool }: { tool: BrainToolPlugin }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {tool.icon && <span className="text-lg">{tool.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {tool.name}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {tool.id}
            </div>
          </div>
          {tool.category && (
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded">
              {tool.category}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          {tool.description && (
            <div className="text-neutral-700 dark:text-neutral-300">
              {tool.description}
            </div>
          )}
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Visibility: </span>
            {tool.whenVisible ? 'Conditional' : 'Always'}
          </div>
        </div>
      )}
    </div>
  );
}

function WorldToolItem({ tool }: { tool: WorldToolPlugin }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {tool.icon && <span className="text-lg">{tool.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {tool.name}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {tool.id}
            </div>
          </div>
          {tool.category && (
            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
              {tool.category}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          <div className="text-neutral-700 dark:text-neutral-300">
            {tool.description}
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Visibility: </span>
            {tool.whenVisible ? 'Conditional' : 'Always'}
          </div>
        </div>
      )}
    </div>
  );
}

function GallerySurfaceItem({ surface }: { surface: GallerySurfaceDefinition }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {surface.icon && <span className="text-lg">{surface.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {surface.label}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {surface.id}
            </div>
          </div>
          {surface.category && (
            <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded">
              {surface.category}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          {surface.description && (
            <div className="text-neutral-700 dark:text-neutral-300">
              {surface.description}
            </div>
          )}
          {surface.supportsMediaTypes && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Media types: </span>
              {surface.supportsMediaTypes.join(', ')}
            </div>
          )}
          {surface.routePath && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Route: </span>
              <code className="text-xs">{surface.routePath}</code>
            </div>
          )}
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Selection: </span>
            {surface.supportsSelection ? 'Supported' : 'Not supported'}
          </div>
        </div>
      )}
    </div>
  );
}

function GizmoSurfaceItem({ surface }: { surface: GizmoSurfaceDefinition }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {surface.icon && <span className="text-lg">{surface.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {surface.label}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {surface.id}
            </div>
          </div>
          {surface.category && (
            <span className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-xs rounded">
              {surface.category}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          {surface.description && (
            <div className="text-neutral-700 dark:text-neutral-300">
              {surface.description}
            </div>
          )}
          {surface.supportsContexts && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Contexts: </span>
              {surface.supportsContexts.join(', ')}
            </div>
          )}
          {surface.tags && surface.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {surface.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-4 text-xs">
            {surface.panelComponent && (
              <span className="text-green-600 dark:text-green-400">Panel</span>
            )}
            {surface.overlayComponent && (
              <span className="text-blue-600 dark:text-blue-400">Overlay</span>
            )}
            {surface.hudComponent && (
              <span className="text-purple-600 dark:text-purple-400">HUD</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InteractionPluginItem({ plugin }: { plugin: InteractionPlugin<BaseInteractionConfig> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {plugin.icon && <span className="text-lg">{plugin.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {plugin.name}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {plugin.id}
            </div>
          </div>
          {plugin.category && (
            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded">
              {plugin.category}
            </span>
          )}
          {plugin.version && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              v{plugin.version}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          {plugin.description && (
            <div className="text-neutral-700 dark:text-neutral-300">
              {plugin.description}
            </div>
          )}
          {plugin.uiMode && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">UI Mode: </span>
              {plugin.uiMode}
            </div>
          )}
          {plugin.capabilities && (
            <div className="flex gap-2 flex-wrap">
              {plugin.capabilities.opensDialogue && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                  Dialogue
                </span>
              )}
              {plugin.capabilities.modifiesInventory && (
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                  Inventory
                </span>
              )}
              {plugin.capabilities.affectsRelationship && (
                <span className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-xs rounded">
                  Relationship
                </span>
              )}
              {plugin.capabilities.hasRisk && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded">
                  Risk
                </span>
              )}
              {plugin.capabilities.canBeDetected && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs rounded">
                  Detectable
                </span>
              )}
            </div>
          )}
          {plugin.tags && plugin.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {plugin.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {plugin.configFields && plugin.configFields.length > 0 && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Config fields: </span>
              {plugin.configFields.map((f) => f.key).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
