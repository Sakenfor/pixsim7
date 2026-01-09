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

import type { AppMapMetadata } from '@shared/types';
import React, {
  useState,
  useMemo,
  useEffect,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import {
  useFeatures,
  useFeatureRoutes,
  useRoutes,
  useActions,
} from '@lib/capabilities';
import { pluginCatalog } from '@lib/plugins/pluginSystem';
import {
  fromPluginSystemMetadata,
  type UnifiedPluginDescriptor,
  type UnifiedPluginFamily,
  type UnifiedPluginOrigin,
} from '@lib/plugins/types';

// Split views
import { FeaturesView } from './appMap/FeaturesView';
import { PluginsView } from './appMap/PluginsView';
import { RegistriesView } from './appMap/RegistriesView';
import { StatsView } from './appMap/StatsView';

// Other panels
import { BackendArchitecturePanel } from './BackendArchitecturePanel';
import { CapabilityTestingPanel } from './CapabilityTestingPanel';
import { DependencyGraphPanel } from './DependencyGraphPanel';

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
  const [familyFilter, setFamilyFilter] = useState<UnifiedPluginFamily | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<UnifiedPluginOrigin | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('features');
  const [allPlugins, setAllPlugins] = useState<UnifiedPluginDescriptor[]>([]);

  // Data from capability registry
  const allFeatures = useFeatures();
  const allActions = useActions();
  const allRoutes = useRoutes();
  const selectedFeatureRoutes = useFeatureRoutes(selectedFeatureId || '');

  // Data from plugin catalog
  useEffect(() => {
    const loadPlugins = () => {
      const catalogPlugins = pluginCatalog.getAll();
      setAllPlugins(catalogPlugins.map(fromPluginSystemMetadata));
    };

    loadPlugins();
    const unsubscribe = pluginCatalog.subscribe(loadPlugins);

    return () => {
      unsubscribe();
    };
  }, []);

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    let plugins = allPlugins;

    if (familyFilter !== 'all') {
      plugins = plugins.filter((plugin) => plugin.family === familyFilter);
    }

    if (originFilter !== 'all') {
      plugins = plugins.filter((plugin) => plugin.origin === originFilter);
    }

    if (searchQuery.trim()) {
      plugins = searchPlugins(searchQuery, plugins);
    }

    return plugins;
  }, [allPlugins, familyFilter, originFilter, searchQuery]);

  // Feature-specific actions
  const selectedFeatureActions = useMemo(() => {
    if (!selectedFeatureId) return [];
    return allActions.filter((a) => a.featureId === selectedFeatureId);
  }, [allActions, selectedFeatureId]);

  // Statistics
  const pluginCounts = useMemo(() => getPluginCounts(allPlugins), [allPlugins]);
  const originCounts = useMemo(() => getOriginCounts(allPlugins), [allPlugins]);
  const pluginHealth = useMemo(() => getPluginHealth(allPlugins), [allPlugins]);
  const featureUsageStats = useMemo(() => getFeatureUsageStats(allPlugins), [allPlugins]);

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
        appMap: f.appMap ?? (f.metadata as { appMap?: AppMapMetadata } | undefined)?.appMap,
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
        name: p.name,
        description: p.description,
        family: p.family,
        origin: p.origin,
        category: p.category,
        version: p.version,
        author: p.author,
        tags: p.tags,
        pluginType: p.pluginType,
        bundleFamily: p.bundleFamily,
        permissions: p.permissions,
        capabilities: p.capabilities,
        providesFeatures: p.providesFeatures,
        consumesFeatures: p.consumesFeatures,
        consumesActions: p.consumesActions,
        consumesState: p.consumesState,
        experimental: p.experimental,
        deprecated: p.deprecated,
        isActive: p.isActive,
        canDisable: p.canDisable,
        isBuiltin: p.isBuiltin,
        extensions: p.extensions,
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
              familyFilter={familyFilter}
              originFilter={originFilter}
              searchQuery={searchQuery}
              onFamilyFilterChange={setFamilyFilter}
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

function searchPlugins(
  query: string,
  plugins: UnifiedPluginDescriptor[]
): UnifiedPluginDescriptor[] {
  const trimmed = query.trim();
  if (!trimmed) return plugins;
  const lowerQuery = trimmed.toLowerCase();

  return plugins.filter((plugin) => matchesSearch(plugin, lowerQuery));
}

function matchesSearch(plugin: UnifiedPluginDescriptor, query: string): boolean {
  if (plugin.name.toLowerCase().includes(query)) return true;
  if (plugin.id.toLowerCase().includes(query)) return true;
  if (plugin.description?.toLowerCase().includes(query)) return true;
  if (plugin.category?.toLowerCase().includes(query)) return true;
  if (plugin.author?.toLowerCase().includes(query)) return true;
  if (plugin.tags?.some((tag) => tag.toLowerCase().includes(query))) return true;
  return false;
}

function getPluginCounts(
  plugins: UnifiedPluginDescriptor[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  plugins.forEach((plugin) => {
    counts[plugin.family] = (counts[plugin.family] || 0) + 1;
  });
  return counts;
}

function getOriginCounts(
  plugins: UnifiedPluginDescriptor[]
): Record<UnifiedPluginOrigin, number> {
  const counts: Record<UnifiedPluginOrigin, number> = {
    builtin: 0,
    'plugin-dir': 0,
    'ui-bundle': 0,
    'dev-project': 0,
  };

  plugins.forEach((plugin) => {
    counts[plugin.origin] = (counts[plugin.origin] ?? 0) + 1;
  });

  return counts;
}

function getFeatureUsageStats(
  plugins: UnifiedPluginDescriptor[]
): Record<string, { consumers: number; providers: number; total: number }> {
  const stats: Record<string, { consumers: number; providers: number; total: number }> = {};

  plugins.forEach((plugin) => {
    plugin.consumesFeatures?.forEach((feature) => {
      if (!stats[feature]) {
        stats[feature] = { consumers: 0, providers: 0, total: 0 };
      }
      stats[feature].consumers++;
      stats[feature].total++;
    });

    plugin.providesFeatures?.forEach((feature) => {
      if (!stats[feature]) {
        stats[feature] = { consumers: 0, providers: 0, total: 0 };
      }
      stats[feature].providers++;
      stats[feature].total++;
    });
  });

  return stats;
}

function getPluginHealth(plugins: UnifiedPluginDescriptor[]): {
  totalPlugins: number;
  metadataHealth: {
    withDescription: number;
    withCategory: number;
    withTags: number;
    withVersion: number;
  };
  issues: {
    experimental: number;
    deprecated: number;
  };
} {
  const metadataHealth = {
    withDescription: 0,
    withCategory: 0,
    withTags: 0,
    withVersion: 0,
  };
  const issues = {
    experimental: 0,
    deprecated: 0,
  };

  plugins.forEach((plugin) => {
    if (plugin.description) metadataHealth.withDescription++;
    if (plugin.category) metadataHealth.withCategory++;
    if (plugin.tags && plugin.tags.length > 0) metadataHealth.withTags++;
    if (plugin.version) metadataHealth.withVersion++;
    if (plugin.experimental) issues.experimental++;
    if (plugin.deprecated) issues.deprecated++;
  });

  return {
    totalPlugins: plugins.length,
    metadataHealth,
    issues,
  };
}
