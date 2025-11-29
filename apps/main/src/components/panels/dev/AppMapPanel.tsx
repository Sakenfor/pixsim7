import React, { useState, useMemo } from 'react';
import {
  useFeatures,
  useFeatureRoutes,
  useActions,
  type FeatureCapability,
  type RouteCapability,
  type ActionCapability,
} from '@/lib/capabilities';
import {
  listAllPlugins,
  filterByKind,
  filterByOrigin,
  searchPlugins,
  getPluginCounts,
  getOriginCounts,
  getPluginHealth,
  getFeatureUsageStats,
  type PluginMeta,
  type PluginKind,
  type PluginOrigin,
} from '@/lib/plugins/catalog';
import { DependencyGraphPanel } from './DependencyGraphPanel';
import { CapabilityTestingPanel } from './CapabilityTestingPanel';
import { BackendArchitecturePanel } from './BackendArchitecturePanel';

/**
 * AppMapPanel - Live visualization of app architecture, features, and plugins
 *
 * Provides an interactive view of:
 * - Registered features, routes, and actions
 * - Plugin ecosystem with filtering and search
 * - Feature-plugin relationships
 * - System health metrics
 */
export function AppMapPanel() {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<PluginOrigin | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'features' | 'plugins' | 'graph' | 'testing' | 'stats' | 'backend'>('features');

  // Data from capability registry
  const allFeatures = useFeatures();
  const allActions = useActions();
  const selectedFeatureRoutes = useFeatureRoutes(selectedFeatureId || '');

  // Collect all routes from all features
  const allRoutes = useMemo(() => {
    const routes: RouteCapability[] = [];
    allFeatures.forEach(feature => {
      if (feature.routes) {
        routes.push(...feature.routes);
      }
    });
    return routes;
  }, [allFeatures]);

  // Data from plugin catalog
  const allPlugins = useMemo(() => listAllPlugins(), []);

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    let plugins = allPlugins;

    if (kindFilter !== 'all') {
      plugins = filterByKind(kindFilter, plugins);
    }

    if (originFilter !== 'all') {
      plugins = filterByOrigin(originFilter, plugins);
    }

    if (searchQuery.trim()) {
      plugins = searchPlugins(searchQuery, plugins);
    }

    return plugins;
  }, [allPlugins, kindFilter, originFilter, searchQuery]);

  // Feature-specific actions
  const selectedFeatureActions = useMemo(() => {
    if (!selectedFeatureId) return [];
    return allActions.filter(a => a.featureId === selectedFeatureId);
  }, [allActions, selectedFeatureId]);

  // Statistics
  const pluginCounts = useMemo(() => getPluginCounts(), []);
  const originCounts = useMemo(() => getOriginCounts(allPlugins), [allPlugins]);
  const pluginHealth = useMemo(() => getPluginHealth(allPlugins), [allPlugins]);
  const featureUsageStats = useMemo(() => getFeatureUsageStats(allPlugins), [allPlugins]);

  const selectedFeature = allFeatures.find(f => f.id === selectedFeatureId);

  // Export app map data
  const handleExport = () => {
    const appMapData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      features: allFeatures.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        category: f.category,
        icon: f.icon,
        priority: f.priority,
        routes: f.routes?.map(r => ({
          path: r.path,
          name: r.name,
          description: r.description,
          protected: r.protected,
          showInNav: r.showInNav,
        })),
      })),
      actions: allActions.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        featureId: a.featureId,
        shortcut: a.shortcut,
      })),
      plugins: allPlugins.map(p => ({
        id: p.id,
        label: p.label,
        description: p.description,
        kind: p.kind,
        origin: p.origin,
        category: p.category,
        version: p.version,
        author: p.author,
        tags: p.tags,
        providesFeatures: p.providesFeatures,
        consumesFeatures: p.consumesFeatures,
        experimental: p.experimental,
        deprecated: p.deprecated,
      })),
      stats: {
        featureCount: allFeatures.length,
        actionCount: allActions.length,
        pluginCount: allPlugins.length,
        routeCount: allRoutes.length,
        pluginCounts,
        originCounts,
        featureUsageStats,
      },
    };

    const blob = new Blob([JSON.stringify(appMapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-map-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              App Map
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Live visualization of features, routes, actions, and plugins
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">{allFeatures.length}</span> features
              {' • '}
              <span className="font-medium">{allPlugins.length}</span> plugins
            </div>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('features')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'features'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Features & Routes
          </button>
          <button
            onClick={() => setActiveTab('plugins')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'plugins'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Plugin Ecosystem
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'graph'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Dependency Graph
          </button>
          <button
            onClick={() => setActiveTab('testing')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'testing'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Capability Testing
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'backend'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Backend Architecture
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'features' && (
          <FeaturesView
            features={allFeatures}
            selectedFeature={selectedFeature}
            selectedFeatureRoutes={selectedFeatureRoutes}
            selectedFeatureActions={selectedFeatureActions}
            onSelectFeature={setSelectedFeatureId}
          />
        )}

        {activeTab === 'plugins' && (
          <PluginsView
            allPlugins={allPlugins}
            filteredPlugins={filteredPlugins}
            kindFilter={kindFilter}
            originFilter={originFilter}
            searchQuery={searchQuery}
            onKindFilterChange={setKindFilter}
            onOriginFilterChange={setOriginFilter}
            onSearchQueryChange={setSearchQuery}
          />
        )}

        {activeTab === 'graph' && (
          <DependencyGraphPanel features={allFeatures} plugins={allPlugins} />
        )}

        {activeTab === 'testing' && (
          <CapabilityTestingPanel
            features={allFeatures}
            routes={allRoutes}
            actions={allActions}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            pluginCounts={pluginCounts}
            originCounts={originCounts}
            pluginHealth={pluginHealth}
            featureUsageStats={featureUsageStats}
            allFeatures={allFeatures}
            allActions={allActions}
          />
        )}

        {activeTab === 'backend' && (
          <BackendArchitecturePanel />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Features View
// ============================================================================

interface FeaturesViewProps {
  features: FeatureCapability[];
  selectedFeature?: FeatureCapability;
  selectedFeatureRoutes: RouteCapability[];
  selectedFeatureActions: ActionCapability[];
  onSelectFeature: (id: string | null) => void;
}

function FeaturesView({
  features,
  selectedFeature,
  selectedFeatureRoutes,
  selectedFeatureActions,
  onSelectFeature,
}: FeaturesViewProps) {
  const featuresByCategory = useMemo(() => {
    const grouped: Record<string, FeatureCapability[]> = {};
    features.forEach(f => {
      const cat = f.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    });
    return grouped;
  }, [features]);

  const categories = Object.keys(featuresByCategory).sort();

  return (
    <div className="flex h-full">
      {/* Feature List */}
      <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto">
        <div className="p-4 space-y-6">
          {categories.map(category => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {featuresByCategory[category].map(feature => (
                  <button
                    key={feature.id}
                    onClick={() => onSelectFeature(feature.id)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selectedFeature?.id === feature.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {feature.icon && <span>{feature.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{feature.name}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {feature.id}
                        </div>
                      </div>
                      {feature.priority !== undefined && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          {feature.priority}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Details */}
      <div className="flex-1 overflow-y-auto">
        {selectedFeature ? (
          <div className="p-6 space-y-6">
            {/* Feature Header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                {selectedFeature.icon && (
                  <span className="text-3xl">{selectedFeature.icon}</span>
                )}
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {selectedFeature.name}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {selectedFeature.id}
                  </p>
                </div>
              </div>
              {selectedFeature.description && (
                <p className="text-neutral-700 dark:text-neutral-300">
                  {selectedFeature.description}
                </p>
              )}
            </div>

            {/* Routes */}
            {selectedFeatureRoutes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Routes ({selectedFeatureRoutes.length})
                </h3>
                <div className="space-y-2">
                  {selectedFeatureRoutes.map((route, i) => (
                    <div
                      key={i}
                      className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {route.icon && <span>{route.icon}</span>}
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                          {route.path}
                        </code>
                        {route.protected && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                            protected
                          </span>
                        )}
                        {route.showInNav && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            in nav
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {route.name}
                      </div>
                      {route.description && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          {route.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {selectedFeatureActions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Actions ({selectedFeatureActions.length})
                </h3>
                <div className="space-y-2">
                  {selectedFeatureActions.map(action => (
                    <div
                      key={action.id}
                      className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {action.icon && <span>{action.icon}</span>}
                        <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                          {action.id}
                        </code>
                        {action.shortcut && (
                          <kbd className="text-xs px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded font-mono">
                            {action.shortcut}
                          </kbd>
                        )}
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {action.name}
                      </div>
                      {action.description && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          {action.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a feature to view details
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Plugins View
// ============================================================================

interface PluginsViewProps {
  allPlugins: PluginMeta[];
  filteredPlugins: PluginMeta[];
  kindFilter: PluginKind | 'all';
  originFilter: PluginOrigin | 'all';
  searchQuery: string;
  onKindFilterChange: (kind: PluginKind | 'all') => void;
  onOriginFilterChange: (origin: PluginOrigin | 'all') => void;
  onSearchQueryChange: (query: string) => void;
}

function PluginsView({
  allPlugins,
  filteredPlugins,
  kindFilter,
  originFilter,
  searchQuery,
  onKindFilterChange,
  onOriginFilterChange,
  onSearchQueryChange,
}: PluginsViewProps) {
  const pluginKinds: Array<PluginKind | 'all'> = [
    'all',
    'session-helper',
    'interaction',
    'node-type',
    'gallery-tool',
    'world-tool',
    'ui-plugin',
    'generation-ui',
  ];

  const pluginOrigins: Array<PluginOrigin | 'all'> = [
    'all',
    'builtin',
    'plugins-dir',
    'ui-bundle',
    'dev',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search plugins..."
          className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Kind Filter */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 self-center">
            Kind:
          </span>
          {pluginKinds.map(kind => (
            <button
              key={kind}
              onClick={() => onKindFilterChange(kind)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                kindFilter === kind
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {kind}
            </button>
          ))}
        </div>

        {/* Origin Filter */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 self-center">
            Origin:
          </span>
          {pluginOrigins.map(origin => (
            <button
              key={origin}
              onClick={() => onOriginFilterChange(origin)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                originFilter === origin
                  ? 'bg-blue-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {origin}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Showing {filteredPlugins.length} of {allPlugins.length} plugins
        </div>
      </div>

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {filteredPlugins.map(plugin => (
            <PluginCard key={`${plugin.kind}-${plugin.id}`} plugin={plugin} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginMeta }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors text-left"
      >
        <div className="flex items-start gap-3">
          {plugin.icon && <span className="text-xl">{plugin.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {plugin.label}
              </span>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                {plugin.kind}
              </span>
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded">
                {plugin.origin}
              </span>
              {plugin.experimental && (
                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded">
                  experimental
                </span>
              )}
              {plugin.deprecated && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded">
                  deprecated
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-neutral-600 dark:text-neutral-400 mb-1">
              {plugin.id}
            </div>
            {plugin.description && (
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {plugin.description}
              </p>
            )}
          </div>
          <span className="text-neutral-400">
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {plugin.category && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">Category:</span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">{plugin.category}</span>
              </div>
            )}
            {plugin.version && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">Version:</span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">{plugin.version}</span>
              </div>
            )}
            {plugin.author && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">Author:</span>
                <span className="ml-2 text-neutral-900 dark:text-neutral-100">{plugin.author}</span>
              </div>
            )}
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Enabled:</span>
              <span className="ml-2 text-neutral-900 dark:text-neutral-100">
                {plugin.enabled !== false ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Tags */}
          {plugin.tags && plugin.tags.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Tags:</div>
              <div className="flex gap-1 flex-wrap">
                {plugin.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feature Dependencies */}
          {(plugin.providesFeatures?.length || plugin.consumesFeatures?.length) && (
            <div className="space-y-2">
              {plugin.providesFeatures && plugin.providesFeatures.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Provides Features:
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {plugin.providesFeatures.map(f => (
                      <code key={f} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded font-mono">
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {plugin.consumesFeatures && plugin.consumesFeatures.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Consumes Features:
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {plugin.consumesFeatures.map(f => (
                      <code key={f} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded font-mono">
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source */}
          <div>
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Source:</div>
            <code className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
              {plugin.source.registry}
              {plugin.source.modulePath && ` (${plugin.source.modulePath})`}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stats View
// ============================================================================

interface StatsViewProps {
  pluginCounts: Record<string, number>;
  originCounts: Record<string, number>;
  pluginHealth: ReturnType<typeof getPluginHealth>;
  featureUsageStats: Record<string, { consumers: number; providers: number; total: number }>;
  allFeatures: FeatureCapability[];
  allActions: ActionCapability[];
}

function StatsView({
  pluginCounts,
  originCounts,
  pluginHealth,
  featureUsageStats,
  allFeatures,
  allActions,
}: StatsViewProps) {
  return (
    <div className="overflow-y-auto p-6 space-y-8">
      {/* Overview */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          System Overview
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Features"
            value={allFeatures.length}
            icon="🎯"
          />
          <StatCard
            label="Actions"
            value={allActions.length}
            icon="⚡"
          />
          <StatCard
            label="Total Plugins"
            value={pluginHealth.totalPlugins}
            icon="🔌"
          />
        </div>
      </div>

      {/* Plugins by Kind */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Plugins by Kind
        </h3>
        <div className="space-y-2">
          {Object.entries(pluginCounts).map(([kind, count]) => (
            <div
              key={kind}
              className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md"
            >
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{kind}</span>
              <span className="text-neutral-600 dark:text-neutral-400">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plugins by Origin */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Plugins by Origin
        </h3>
        <div className="space-y-2">
          {Object.entries(originCounts).map(([origin, count]) => (
            <div
              key={origin}
              className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md"
            >
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{origin}</span>
              <span className="text-neutral-600 dark:text-neutral-400">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Usage */}
      {Object.keys(featureUsageStats).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Feature Usage by Plugins
          </h3>
          <div className="space-y-2">
            {Object.entries(featureUsageStats)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([featureId, stats]) => (
                <div
                  key={featureId}
                  className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md"
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                      {featureId}
                    </code>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {stats.total} plugins
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
                    <span>{stats.providers} providers</span>
                    <span>{stats.consumers} consumers</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Plugin Health */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Plugin Health
        </h3>
        <div className="space-y-3">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              Metadata Completeness
            </div>
            <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
              <div>With description: {pluginHealth.metadataHealth.withDescription}</div>
              <div>With category: {pluginHealth.metadataHealth.withCategory}</div>
              <div>With tags: {pluginHealth.metadataHealth.withTags}</div>
              <div>With version: {pluginHealth.metadataHealth.withVersion}</div>
            </div>
          </div>

          {pluginHealth.issues.experimental > 0 && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-md">
              <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
                {pluginHealth.issues.experimental} experimental plugins
              </div>
            </div>
          )}

          {pluginHealth.issues.deprecated > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-md">
              <div className="text-sm font-medium text-red-900 dark:text-red-100">
                {pluginHealth.issues.deprecated} deprecated plugins
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
    </div>
  );
}
