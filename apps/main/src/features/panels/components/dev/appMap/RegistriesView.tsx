/**
 * RegistriesView - Registries tab for App Map
 *
 * Shows all BaseRegistry extensions with their registered items.
 * Provides visibility into the tool and surface registries.
 */

import { interactionRegistry, type InteractionPlugin, type BaseInteractionConfig } from '@pixsim7/game.engine';
import type { RegistryDescriptor } from '@pixsim7/shared.api.model';
import { FilterPillGroup } from '@pixsim7/shared.ui';
import { useState, useMemo, useRef, useSyncExternalStore, useEffect } from 'react';

import type { Identifiable } from '@lib/core/BaseRegistry';
import { Icon } from '@lib/icons';
import {
  brainToolSelectors,
  galleryToolSelectors,
  gallerySurfaceSelectors,
  gizmoSurfaceSelectors,
  worldToolSelectors,
} from '@lib/plugins/catalogSelectors';
import {
  initializeBlockCatalogResolvers,
  initializeGameCatalogResolvers,
  initializeProjectResolvers,
  initializeSessionResolvers,
  resolverRegistry,
  type ResolverConsumptionRecord,
  type ResolverRunEvent,
} from '@lib/resolvers';

// Catalog selectors (source of truth for gallery/world/brain/gizmo families)

// Types
import type { BrainToolPlugin } from '@features/brainTools/lib/types';
import type { GallerySurfaceDefinition } from '@features/gallery/lib/core/surfaceRegistry';
import type { GalleryToolPlugin } from '@features/gallery/lib/core/types';
import type { GizmoSurfaceDefinition } from '@features/gizmos/lib/core/surfaceRegistry';
import type { WorldToolPlugin } from '@features/worldTools/lib/types';

import { mediaOverlayRegistry, type MediaOverlayTool } from '@/components/media/viewer/overlays';

type RuntimeRegistryCategory = 'tools' | 'surfaces' | 'interactions' | 'resolvers' | 'other';
type RegistrySourceMode = 'runtime' | 'backend';
type BackendRegistryCategory = 'plugins' | 'routes' | 'capabilities' | 'services' | 'runtime' | 'other';
type RegistryLayer = 'backend' | 'frontend';
type RegistryScope = 'catalog' | 'runtime';
type RegistryUpdateMode = 'snapshot' | 'push' | 'poll';

interface RegistryDescriptorLike extends RegistryDescriptor {
  layer?: RegistryLayer | null;
  scope?: RegistryScope | null;
  update_mode?: RegistryUpdateMode | null;
}

interface BackendRegistryViewModel {
  id: string;
  name: string;
  description: string;
  category: BackendRegistryCategory;
  backingSource: string;
  layer: RegistryLayer;
  scope: RegistryScope;
  updateMode: RegistryUpdateMode;
  itemCount: number;
  family?: string | null;
}

interface RegistriesViewProps {
  backendRegistryDescriptors?: RegistryDescriptorLike[];
  backendRuntimeRegistries?: RegistryDescriptorLike[];
}

const BACKEND_CATEGORY_VALUES: readonly BackendRegistryCategory[] = [
  'plugins',
  'routes',
  'capabilities',
  'services',
  'runtime',
  'other',
] as const;

function coerceBackendCategory(raw: string | null | undefined): BackendRegistryCategory {
  if ((BACKEND_CATEGORY_VALUES as readonly string[]).includes(raw ?? '')) {
    return raw as BackendRegistryCategory;
  }
  return 'other';
}

function normalizeBackendRegistry(
  raw: RegistryDescriptorLike,
  fallbackScope: RegistryScope,
): BackendRegistryViewModel {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    category: coerceBackendCategory(raw.category),
    backingSource: raw.backing_source,
    layer: raw.layer ?? 'backend',
    scope: raw.scope ?? fallbackScope,
    updateMode: raw.update_mode ?? 'snapshot',
    itemCount: raw.item_count ?? 0,
    family: raw.family ?? null,
  };
}

function getInteractionRegistryItems(): Identifiable[] {
  return interactionRegistry.getAll().map((plugin) => ({
    id: plugin.id,
    ...plugin,
  }));
}

function createPollingSubscribe(
  getItems: () => Identifiable[],
  intervalMs = 1500,
): (cb: () => void) => () => void {
  return (cb) => {
    let previous = JSON.stringify(getItems());
    const interval = globalThis.setInterval(() => {
      const current = JSON.stringify(getItems());
      if (current !== previous) {
        previous = current;
        cb();
      }
    }, intervalMs);

    return () => {
      globalThis.clearInterval(interval);
    };
  };
}


/**
 * Registry metadata for display
 */
interface RegistryInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: RuntimeRegistryCategory;
  getItems: () => Identifiable[];
  subscribe: (cb: () => void) => () => void;
  renderItem: (item: Identifiable) => React.ReactNode;
  renderDetails?: (searchQuery: string) => React.ReactNode;
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
    getItems: () => galleryToolSelectors.getAll(),
    subscribe: (cb) => galleryToolSelectors.subscribe(cb),
    renderItem: (item) => <GalleryToolItem tool={item as GalleryToolPlugin} />,
  },
  {
    id: 'brain-tools',
    name: 'Brain Tools',
    description: 'NPC brain analysis and debugging tools',
    icon: '🧠',
    category: 'tools',
    getItems: () => brainToolSelectors.getAll(),
    subscribe: (cb) => brainToolSelectors.subscribe(cb),
    renderItem: (item) => <BrainToolItem tool={item as BrainToolPlugin} />,
  },
  {
    id: 'world-tools',
    name: 'World Tools',
    description: 'Game world interaction and management tools',
    icon: '🌍',
    category: 'tools',
    getItems: () => worldToolSelectors.getAll(),
    subscribe: (cb) => worldToolSelectors.subscribe(cb),
    renderItem: (item) => <WorldToolItem tool={item as WorldToolPlugin} />,
  },
  {
    id: 'media-overlays',
    name: 'Media Overlays',
    description: 'Overlay tools available in the media viewer',
    icon: 'OV',
    category: 'tools',
    getItems: () => mediaOverlayRegistry.getSorted(),
    subscribe: (cb) => mediaOverlayRegistry.subscribe(cb),
    renderItem: (item) => <MediaOverlayItem overlay={item as MediaOverlayTool} />,
  },
  {
    id: 'gallery-surfaces',
    name: 'Gallery Surfaces',
    description: 'Different views/modes for the asset gallery',
    icon: '📐',
    category: 'surfaces',
    getItems: () => gallerySurfaceSelectors.getAll(),
    subscribe: (cb) => gallerySurfaceSelectors.subscribe(cb),
    renderItem: (item) => <GallerySurfaceItem surface={item as GallerySurfaceDefinition} />,
  },
  {
    id: 'gizmo-surfaces',
    name: 'Gizmo Surfaces',
    description: 'UI surfaces for gizmos and debug dashboards',
    icon: '🔮',
    category: 'surfaces',
    getItems: () => gizmoSurfaceSelectors.getAll(),
    subscribe: (cb) => gizmoSurfaceSelectors.subscribe(cb),
    renderItem: (item) => <GizmoSurfaceItem surface={item as GizmoSurfaceDefinition} />,
  },
  {
    id: 'resolver-observability',
    name: 'Resolver Observability',
    description: 'Resolver runtime consumption, cache, and consumer diagnostics',
    icon: 'R',
    category: 'resolvers',
    getItems: () => toResolverConsumptionItems(resolverRegistry.getAllConsumption()),
    subscribe: (cb) => resolverRegistry.subscribe(() => cb()),
    renderItem: (item) => <ResolverConsumptionItem row={item as ResolverConsumptionItemRow} />,
    renderDetails: (searchQuery) => <ResolverObservabilityDetails searchQuery={searchQuery} />,
  },
  {
    id: 'interactions',
    name: 'Interactions',
    description: 'Game interactions from plugins (pickpocket, stealth, etc.)',
    icon: '🎮',
    category: 'interactions',
    getItems: getInteractionRegistryItems,
    // InteractionRegistry currently lacks subscribe; poll as a bridge until native events exist.
    subscribe: createPollingSubscribe(getInteractionRegistryItems, 1500),
    renderItem: (item) => (
      <InteractionPluginItem plugin={item as unknown as InteractionPlugin<BaseInteractionConfig>} />
    ),
  },
];

function formatRegistryCategoryLabel(value: string): string {
  return value
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function RegistriesView({
  backendRegistryDescriptors = [],
  backendRuntimeRegistries = [],
}: RegistriesViewProps) {
  const backendRegistries = useMemo<BackendRegistryViewModel[]>(() => {
    const descriptors = backendRegistryDescriptors.map((item) =>
      normalizeBackendRegistry(item, 'catalog')
    );
    const runtime = backendRuntimeRegistries.map((item) =>
      normalizeBackendRegistry(item, 'runtime')
    );
    return [...descriptors, ...runtime];
  }, [backendRegistryDescriptors, backendRuntimeRegistries]);
  const hasBackendRegistries = backendRegistries.length > 0;
  const [sourceMode, setSourceMode] = useState<RegistrySourceMode>('runtime');

  useEffect(() => {
    if (sourceMode === 'backend' && !hasBackendRegistries) {
      setSourceMode('runtime');
    }
  }, [sourceMode, hasBackendRegistries]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-2">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Registry source
        </div>
        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5">
          <button
            onClick={() => setSourceMode('runtime')}
            className={`px-2 py-1 text-xs rounded ${
              sourceMode === 'runtime'
                ? 'bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-600 dark:text-neutral-300'
            }`}
          >
            Runtime
          </button>
          <button
            onClick={() => setSourceMode('backend')}
            disabled={!hasBackendRegistries}
            className={`px-2 py-1 text-xs rounded ${
              sourceMode === 'backend'
                ? 'bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-600 dark:text-neutral-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={hasBackendRegistries ? 'Backend registry descriptors' : 'No backend registry descriptors available'}
          >
            Backend
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {sourceMode === 'backend' ? (
          <BackendRegistriesPanel registries={backendRegistries} />
        ) : (
          <RuntimeRegistriesPanel />
        )}
      </div>
    </div>
  );
}

function RuntimeRegistriesPanel() {
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(
    REGISTRIES[0]?.id ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'tools' | 'surfaces' | 'interactions' | 'resolvers'>('all');

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
          <FilterPillGroup
            options={(['tools', 'surfaces', 'interactions', 'resolvers'] as const).map((cat) => ({
              value: cat,
              label: formatRegistryCategoryLabel(cat),
            }))}
            value={categoryFilter === 'all' ? null : categoryFilter}
            onChange={(v) => setCategoryFilter(v ?? 'all')}
            allLabel="All"
          />
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
                <Icon name={selectedRegistry.icon} size={24} />
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
            {selectedRegistry.renderDetails ? (
              selectedRegistry.renderDetails(searchQuery)
            ) : (
              <RegistryItemList
                registry={selectedRegistry}
                searchQuery={searchQuery}
              />
            )}
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

function BackendRegistriesPanel({ registries }: { registries: BackendRegistryViewModel[] }) {
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(
    registries[0]?.id ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | BackendRegistryCategory>('all');

  const categories = useMemo<BackendRegistryCategory[]>(() => {
    const set = new Set<BackendRegistryCategory>();
    for (const registry of registries) {
      set.add(registry.category);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [registries]);

  const filteredRegistries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return registries.filter((registry) => {
      if (categoryFilter !== 'all' && registry.category !== categoryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        registry.name.toLowerCase().includes(query) ||
        registry.id.toLowerCase().includes(query) ||
        registry.description.toLowerCase().includes(query) ||
        registry.backingSource.toLowerCase().includes(query) ||
        (registry.family?.toLowerCase().includes(query) ?? false) ||
        registry.scope.toLowerCase().includes(query) ||
        registry.layer.toLowerCase().includes(query)
      );
    });
  }, [registries, categoryFilter, searchQuery]);

  useEffect(() => {
    const isStillVisible = filteredRegistries.some((registry) => registry.id === selectedRegistryId);
    if (!isStillVisible) {
      setSelectedRegistryId(filteredRegistries[0]?.id ?? null);
    }
  }, [filteredRegistries, selectedRegistryId]);

  const selectedRegistry = filteredRegistries.find((registry) => registry.id === selectedRegistryId) ?? null;
  const totalItems = registries.reduce((sum, registry) => sum + registry.itemCount, 0);

  return (
    <div className="flex h-full">
      <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
          <FilterPillGroup
            options={categories.map((category) => ({
              value: category,
              label: formatRegistryCategoryLabel(category),
            }))}
            value={categoryFilter === 'all' ? null : categoryFilter}
            onChange={(value) => setCategoryFilter((value as BackendRegistryCategory | null) ?? 'all')}
            allLabel="All"
          />
        </div>
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search descriptors..."
            className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredRegistries.map((registry) => (
            <button
              key={registry.id}
              onClick={() => setSelectedRegistryId(registry.id)}
              className={`w-full text-left p-3 rounded-md border transition-colors ${
                selectedRegistryId === registry.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                  {registry.name}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {registry.itemCount}
                </div>
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {registry.id}
              </div>
              <div className="mt-2 flex gap-1 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-300">
                  {registry.scope}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-300">
                  {registry.layer}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-300">
                  {registry.updateMode}
                </span>
              </div>
            </button>
          ))}
          {filteredRegistries.length === 0 && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-6">
              No backend registry descriptors match the current filter.
            </div>
          )}
        </div>
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">{totalItems}</span> total items across{' '}
          <span className="font-medium">{registries.length}</span> descriptors
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedRegistry ? (
          <>
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {selectedRegistry.name}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                {selectedRegistry.description || 'No description provided.'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <BackendRegistryField label="ID" value={selectedRegistry.id} mono />
              <BackendRegistryField label="Category" value={selectedRegistry.category} />
              <BackendRegistryField label="Layer" value={selectedRegistry.layer} />
              <BackendRegistryField label="Scope" value={selectedRegistry.scope} />
              <BackendRegistryField label="Update mode" value={selectedRegistry.updateMode} />
              <BackendRegistryField label="Backing source" value={selectedRegistry.backingSource} mono />
              <BackendRegistryField label="Item count" value={String(selectedRegistry.itemCount)} />
              {selectedRegistry.family ? (
                <BackendRegistryField label="Family" value={selectedRegistry.family} />
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a backend descriptor to view metadata
          </div>
        )}
      </div>
    </div>
  );
}

function BackendRegistryField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-3 bg-white dark:bg-neutral-900">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className={`text-sm text-neutral-900 dark:text-neutral-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

interface ResolverConsumptionItemRow extends ResolverConsumptionRecord, Identifiable {}

interface ResolverAggregateRow extends Identifiable {
  resolverId: string;
  label?: string;
  owner?: string;
  tags?: string[];
  cachePolicy?: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  cacheHitCalls: number;
  consumerCount: number;
  avgDurationMs: number;
}

function toResolverConsumptionItems(rows: ResolverConsumptionRecord[]): ResolverConsumptionItemRow[] {
  return rows.map((row) => ({
    ...row,
    id: `${row.resolverId}::${row.consumerId}`,
  }));
}

function filterResolverQuery(
  rows: ResolverConsumptionItemRow[],
  query: string,
): ResolverConsumptionItemRow[] {
  if (!query.trim()) return rows;
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    return (
      row.resolverId.toLowerCase().includes(needle) ||
      row.consumerId.toLowerCase().includes(needle) ||
      (row.lastError?.toLowerCase().includes(needle) ?? false)
    );
  });
}

function filterResolverAggregateQuery(rows: ResolverAggregateRow[], query: string): ResolverAggregateRow[] {
  if (!query.trim()) return rows;
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    return (
      row.resolverId.toLowerCase().includes(needle) ||
      (row.label?.toLowerCase().includes(needle) ?? false) ||
      (row.owner?.toLowerCase().includes(needle) ?? false) ||
      (row.tags?.some((tag) => tag.toLowerCase().includes(needle)) ?? false)
    );
  });
}

function ResolverObservabilityDetails({ searchQuery }: { searchQuery: string }) {
  const [events, setEvents] = useState<ResolverRunEvent[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    initializeGameCatalogResolvers();
    initializeSessionResolvers();
    initializeProjectResolvers();
    initializeBlockCatalogResolvers();
    setRefreshTick((current) => current + 1);
  }, []);

  useEffect(() => {
    return resolverRegistry.subscribe((event) => {
      setEvents((previous) => [event, ...previous].slice(0, 100));
      setRefreshTick((current) => current + 1);
    });
  }, []);

  const consumptionRows = useMemo(
    () => filterResolverQuery(
      toResolverConsumptionItems(resolverRegistry.getAllConsumption()),
      searchQuery,
    ),
    [searchQuery, refreshTick],
  );

  const aggregateRows = useMemo(() => {
    const definitions = resolverRegistry.getAll();
    const allConsumption = toResolverConsumptionItems(resolverRegistry.getAllConsumption());
    const statsByResolverId = new Map<
      string,
      {
        totalCalls: number;
        successCalls: number;
        errorCalls: number;
        cacheHitCalls: number;
        consumerCount: number;
        avgDurationMs: number;
      }
    >();

    for (const row of allConsumption) {
      const current = statsByResolverId.get(row.resolverId) ?? {
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        cacheHitCalls: 0,
        consumerCount: 0,
        avgDurationMs: 0,
      };
      current.totalCalls += row.totalCalls;
      current.successCalls += row.successCalls;
      current.errorCalls += row.errorCalls;
      current.cacheHitCalls += row.cacheHitCalls;
      current.consumerCount += 1;
      current.avgDurationMs += row.avgDurationMs;
      statsByResolverId.set(row.resolverId, current);
    }

    const rows: ResolverAggregateRow[] = definitions.map((definition) => {
      const stats = statsByResolverId.get(definition.id);
      const consumerCount = stats?.consumerCount ?? 0;
      const avgDurationMs =
        consumerCount > 0 ? (stats?.avgDurationMs ?? 0) / consumerCount : 0;

      return {
        id: definition.id,
        resolverId: definition.id,
        label: definition.label,
        owner: definition.owner,
        tags: definition.tags,
        cachePolicy: definition.cachePolicy ?? 'none',
        totalCalls: stats?.totalCalls ?? 0,
        successCalls: stats?.successCalls ?? 0,
        errorCalls: stats?.errorCalls ?? 0,
        cacheHitCalls: stats?.cacheHitCalls ?? 0,
        consumerCount,
        avgDurationMs,
      };
    });

    return filterResolverAggregateQuery(rows, searchQuery);
  }, [searchQuery, refreshTick]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const needle = searchQuery.trim().toLowerCase();
    return events.filter((event) => {
      return (
        event.resolverId.toLowerCase().includes(needle) ||
        event.consumerId.toLowerCase().includes(needle) ||
        (event.error?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [events, searchQuery]);

  const totalCalls = consumptionRows.reduce((sum, row) => sum + row.totalCalls, 0);
  const errorCalls = consumptionRows.reduce((sum, row) => sum + row.errorCalls, 0);
  const cacheHitCalls = consumptionRows.reduce((sum, row) => sum + row.cacheHitCalls, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {aggregateRows.length} resolvers, {consumptionRows.length} resolver-consumer links
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              resolverRegistry.clearAllCache();
              setRefreshTick((current) => current + 1);
            }}
            className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium"
          >
            Clear All Cache
          </button>
          <button
            onClick={() => {
              resolverRegistry.clearAllConsumption();
              setRefreshTick((current) => current + 1);
            }}
            className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium"
          >
            Clear Consumption
          </button>
          <button
            onClick={() => setEvents([])}
            className="px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium"
          >
            Clear Events
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResolverMetricCard label="Total Calls" value={String(totalCalls)} />
        <ResolverMetricCard label="Error Calls" value={String(errorCalls)} />
        <ResolverMetricCard
          label="Cache Hit Rate"
          value={totalCalls > 0 ? `${Math.round((cacheHitCalls / totalCalls) * 100)}%` : '0%'}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Registered Resolvers
        </h3>
        <div className="space-y-2">
          {aggregateRows.map((row) => (
            <ResolverAggregateItem key={row.id} row={row} />
          ))}
          {aggregateRows.length === 0 && (
            <div className="text-center py-6 text-sm text-neutral-500 dark:text-neutral-400">
              No resolvers match your filter.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Consumer Usage
        </h3>
        <div className="space-y-2">
          {consumptionRows.map((row) => (
            <ResolverConsumptionItem key={row.id} row={row} />
          ))}
          {consumptionRows.length === 0 && (
            <div className="text-center py-6 text-sm text-neutral-500 dark:text-neutral-400">
              No usage rows yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Live Run Events
        </h3>
        <div className="space-y-2">
          {filteredEvents.slice(0, 30).map((event, index) => (
            <ResolverEventItem key={`${event.startedAt}:${event.resolverId}:${event.consumerId}:${index}`} event={event} />
          ))}
          {filteredEvents.length === 0 && (
            <div className="text-center py-6 text-sm text-neutral-500 dark:text-neutral-400">
              No run events yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ResolverMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-3 bg-white dark:bg-neutral-900">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}

function ResolverAggregateItem({ row }: { row: ResolverAggregateRow }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-3 bg-neutral-50 dark:bg-neutral-800/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-neutral-900 dark:text-neutral-100">
            {row.label ?? row.resolverId}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {row.resolverId}
          </div>
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          owner: {row.owner ?? 'n/a'} | cache: {row.cachePolicy ?? 'none'}
        </div>
      </div>
      <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
        calls {row.totalCalls} | success {row.successCalls} | errors {row.errorCalls} | cache hits{' '}
        {row.cacheHitCalls} | consumers {row.consumerCount} | avg {row.avgDurationMs.toFixed(1)}ms
      </div>
      {row.tags && row.tags.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {row.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2">
        <button
          onClick={() => resolverRegistry.clearResolverCache(row.resolverId)}
          className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium"
        >
          Clear Resolver Cache
        </button>
      </div>
    </div>
  );
}

function ResolverConsumptionItem({ row }: { row: ResolverConsumptionItemRow }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-3 bg-white dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-neutral-900 dark:text-neutral-100">{row.consumerId}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{row.resolverId}</div>
        </div>
        <div
          className={`text-xs font-medium ${
            row.lastStatus === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }`}
        >
          {row.lastStatus}
        </div>
      </div>
      <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
        calls {row.totalCalls} | success {row.successCalls} | errors {row.errorCalls} | cache hits{' '}
        {row.cacheHitCalls} | avg {row.avgDurationMs.toFixed(1)}ms | last {row.lastDurationMs.toFixed(1)}ms
      </div>
      {row.lastError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{row.lastError}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => resolverRegistry.clearConsumptionForConsumer(row.consumerId)}
          className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium"
        >
          Clear Consumer Stats
        </button>
      </div>
    </div>
  );
}

function ResolverEventItem({ event }: { event: ResolverRunEvent }) {
  const timestamp = new Date(event.startedAt).toLocaleTimeString();
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md p-2 bg-neutral-50 dark:bg-neutral-800/50 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-neutral-700 dark:text-neutral-200">
          {event.resolverId}{' <- '}{event.consumerId}
        </div>
        <div
          className={`font-medium ${
            event.status === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }`}
        >
          {event.status}
        </div>
      </div>
      <div className="text-neutral-500 dark:text-neutral-400 mt-1">
        {timestamp} | {event.durationMs.toFixed(1)}ms | cache {event.cacheHit ? 'hit' : 'miss'}
      </div>
      {event.error && (
        <div className="text-red-600 dark:text-red-400 mt-1">{event.error}</div>
      )}
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
        <Icon name={registry.icon} size={20} />
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
  // Subscribe to registry changes — snapshot must be referentially stable
  const snapshotRef = useRef<{ key: string; value: Identifiable[] }>({ key: '', value: [] });
  const items = useSyncExternalStore(
    registry.subscribe,
    () => {
      const current = registry.getItems();
      const key = current.map((i) => i.id).join(',');
      if (key !== snapshotRef.current.key) {
        snapshotRef.current = { key, value: current };
      }
      return snapshotRef.current.value;
    }
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
  // Get live counts for all registries with a single subscription
  const snapshotRef = useRef<{ key: string; value: { id: string; count: number }[] }>({
    key: '',
    value: [],
  });

  const counts = useSyncExternalStore(
    (callback) => {
      const unsubscribers = registries.map((r) => r.subscribe(callback));
      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    },
    () => {
      const items = registries.map((r) => ({
        id: r.id,
        count: r.getItems().length,
      }));
      const key = items.map((i) => `${i.id}:${i.count}`).join(',');
      if (key !== snapshotRef.current.key) {
        snapshotRef.current = { key, value: items };
      }
      return snapshotRef.current.value;
    }
  );

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
          {tool.icon && <Icon name={tool.icon} size={18} />}
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
          {tool.icon && <Icon name={tool.icon} size={18} />}
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
          {tool.icon && <Icon name={tool.icon} size={18} />}
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

function MediaOverlayItem({ overlay }: { overlay: MediaOverlayTool }) {
  const [expanded, setExpanded] = useState(false);
  const uiParts = [
    overlay.Main ? 'main' : null,
    overlay.Toolbar ? 'toolbar' : null,
    overlay.Sidebar ? 'sidebar' : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">OV</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {overlay.label}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {overlay.id}
            </div>
          </div>
          {overlay.shortcut && (
            <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded">
              {overlay.shortcut}
            </span>
          )}
          <span className="text-neutral-400">{expanded ? 'Г-м' : 'Г-'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-sm space-y-2">
          {overlay.description && (
            <div className="text-neutral-700 dark:text-neutral-300">
              {overlay.description}
            </div>
          )}
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Tone: </span>
            {overlay.tone ?? 'default'}
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Priority: </span>
            {overlay.priority ?? 100}
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">UI parts: </span>
            {uiParts || 'none'}
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
          {surface.icon && <Icon name={surface.icon} size={18} />}
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
          {surface.icon && <Icon name={surface.icon} size={18} />}
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
          {plugin.icon && <Icon name={plugin.icon} size={18} />}
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
