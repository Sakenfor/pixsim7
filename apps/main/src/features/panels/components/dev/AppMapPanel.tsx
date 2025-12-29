/**
 * AppMapPanel - Live visualization of app architecture, features, and plugins
 *
 * Provides an interactive view of:
 * - Registered features, routes, and actions
 * - Plugin ecosystem with filtering and search
 * - Tool and surface registries
 * - Feature-plugin relationships
 * - System health metrics
 */

import React, {
  useState,
  useMemo,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  useFeatures,
  useFeatureRoutes,
  useActions,
  type FeatureCapability,
  type RouteCapability,
} from '@lib/capabilities';
import {
  listAllPlugins,
  filterByKind,
  filterByOrigin,
  searchPlugins,
  getPluginCounts,
  getOriginCounts,
  getPluginHealth,
  getFeatureUsageStats,
  type PluginKind,
  type PluginOrigin,
} from '@lib/plugins/catalog';

// Split views
import { FeaturesView } from './appMap/FeaturesView';
import { PluginsView } from './appMap/PluginsView';
import { StatsView } from './appMap/StatsView';
import { RegistriesView } from './appMap/RegistriesView';

// Other panels
import { DependencyGraphPanel } from './DependencyGraphPanel';
import { CapabilityTestingPanel } from './CapabilityTestingPanel';
import { BackendArchitecturePanel } from './BackendArchitecturePanel';

// =============================================================================
// Error Boundary
// =============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class AppMapErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppMapPanel crashed:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          <h2 className="font-bold mb-2">AppMapPanel Crashed</h2>
          <pre className="text-xs overflow-auto whitespace-pre-wrap mb-2">
            {this.state.error?.message}
          </pre>
          <pre className="text-xs overflow-auto whitespace-pre-wrap opacity-70">
            {this.state.error?.stack}
          </pre>
          {this.state.errorInfo && (
            <pre className="text-xs overflow-auto whitespace-pre-wrap mt-2 opacity-50">
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            onClick={() =>
              this.setState({ hasError: false, error: null, errorInfo: null })
            }
            className="mt-4 px-3 py-1 bg-red-600 text-white rounded"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Tab Types
// =============================================================================

type TabId = 'features' | 'plugins' | 'registries' | 'graph' | 'testing' | 'stats' | 'backend';

interface TabConfig {
  id: TabId;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'features', label: 'Features & Routes' },
  { id: 'plugins', label: 'Plugin Ecosystem' },
  { id: 'registries', label: 'Registries' },
  { id: 'graph', label: 'Dependency Graph' },
  { id: 'testing', label: 'Capability Testing' },
  { id: 'stats', label: 'Statistics' },
  { id: 'backend', label: 'Backend Architecture' },
];

// =============================================================================
// Main Component
// =============================================================================

export function AppMapPanel() {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<PluginOrigin | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('features');

  // Data from capability registry
  const allFeatures = useFeatures();
  const allActions = useActions();
  const selectedFeatureRoutes = useFeatureRoutes(selectedFeatureId || '');

  // Collect all routes from all features
  const allRoutes = useMemo(() => {
    const routes: RouteCapability[] = [];
    allFeatures.forEach((feature) => {
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
    return allActions.filter((a) => a.featureId === selectedFeatureId);
  }, [allActions, selectedFeatureId]);

  // Statistics
  const pluginCounts = useMemo(() => getPluginCounts(), []);
  const originCounts = useMemo(() => getOriginCounts(allPlugins), [allPlugins]);
  const pluginHealth = useMemo(() => getPluginHealth(allPlugins), [allPlugins]);
  const featureUsageStats = useMemo(
    () => getFeatureUsageStats(allPlugins),
    [allPlugins]
  );

  const selectedFeature = allFeatures.find((f) => f.id === selectedFeatureId);

  // Export app map data
  const handleExport = () => {
    const appMapData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      features: allFeatures.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        category: f.category,
        icon: f.icon,
        priority: f.priority,
        routes: f.routes?.map((r) => ({
          path: r.path,
          name: r.name,
          description: r.description,
          protected: r.protected,
          showInNav: r.showInNav,
        })),
      })),
      actions: allActions.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        featureId: a.featureId,
        shortcut: a.shortcut,
      })),
      plugins: allPlugins.map((p) => ({
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

    const blob = new Blob([JSON.stringify(appMapData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-map-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppMapErrorBoundary>
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
          <div className="flex gap-2 mt-4 flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
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

          {activeTab === 'registries' && <RegistriesView />}

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

          {activeTab === 'backend' && <BackendArchitecturePanel />}
        </div>
      </div>
    </AppMapErrorBoundary>
  );
}
