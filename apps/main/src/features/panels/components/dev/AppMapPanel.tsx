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

import type { ArchitectureGraphV1 } from '@pixsim7/shared.api.model';
import type { AppMapMetadata } from '@pixsim7/shared.types';
import { Button, SidebarContentLayout } from '@pixsim7/shared.ui';
import React, {
  useState,
  useMemo,
  useEffect,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import { canRunCodegen } from '@lib/auth/userRoles';
import {
  type ActionCapability,
  type FeatureCapability,
  type RouteCapability,
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

import { useAuthStore } from '@/stores/authStore';

// Split views
import { FeaturesView } from './appMap/FeaturesView';
import { JourneysView } from './appMap/JourneysView';
import { loadArchitectureGraph, type GraphLoadSource } from './appMap/loadArchitectureGraph';
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
// Section Types
// =============================================================================

type SectionId = 'features' | 'plugins' | 'registries' | 'graph' | 'journeys' | 'testing' | 'stats' | 'backend';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'registries', label: 'Registries' },
  { id: 'graph', label: 'Dep Graph' },
  { id: 'journeys', label: 'Journeys' },
  { id: 'testing', label: 'Testing' },
  { id: 'stats', label: 'Statistics' },
  { id: 'backend', label: 'Backend' },
];

// =============================================================================
// Main Component
// =============================================================================

export function AppMapPanel() {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [familyFilter, setFamilyFilter] = useState<UnifiedPluginFamily | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<UnifiedPluginOrigin | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<SectionId>('features');
  const [allPlugins, setAllPlugins] = useState<UnifiedPluginDescriptor[]>([]);

  // Architecture graph (unified backend + frontend data)
  const [graphData, setGraphData] = useState<ArchitectureGraphV1 | null>(null);
  const [graphSource, setGraphSource] = useState<GraphLoadSource | null>(null);

  useEffect(() => {
    loadArchitectureGraph().then((result) => {
      setGraphData(result.graph);
      setGraphSource(result.loadSource);
    });
  }, []);

  // Devtools codegen link (permission + DEV mode)
  const user = useAuthStore((s) => s.user);
  const showCodegenLink = import.meta.env.DEV && canRunCodegen(user);
  const codegenUrl = '/dev/developer-tasks?task=app-map';

  // Data from capability registry
  const allFeatures = useFeatures();
  const allActions = useActions();
  const allRoutes = useRoutes();
  const localSelectedFeatureRoutes = useFeatureRoutes(selectedFeatureId || '');

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

  // Feature-specific actions
  const localSelectedFeatureActions = useMemo(() => {
    if (!selectedFeatureId) return [];
    return allActions.filter((a) => a.featureId === selectedFeatureId);
  }, [allActions, selectedFeatureId]);

  // Prefer architecture graph data when available, fall back to local registries.
  const graphEntries = graphData?.frontend?.entries ?? [];
  const graphPlugins = graphData?.backend?.plugins ?? [];
  const graphWarnings = graphData?.metrics?.drift_warnings ?? [];
  const useGraphFeatures = graphEntries.length > 0;
  const useGraphPlugins = graphPlugins.length > 0;

  const graphFeatureRoutesById = useMemo(() => {
    const byId: Record<string, RouteCapability[]> = {};
    for (const entry of graphEntries) {
      const entryId = entry.id;
      if (!entryId) continue;
      byId[entryId] = (entry.routes ?? []).map((path) => ({
        path,
        name: path,
        description: 'Route reference from ArchitectureGraph',
        featureId: entryId,
      }));
    }
    return byId;
  }, [graphEntries]);

  const graphFeatureCapabilities = useMemo<FeatureCapability[]>(() => {
    return graphEntries.map((entry) => ({
      id: entry.id,
      name: entry.label || entry.id,
      description: 'Feature metadata from ArchitectureGraph',
      category: 'architecture',
      appMap: {
        docs: entry.docs ?? [],
        frontend: entry.frontend ?? [],
        backend: entry.backend ?? [],
        notes: entry.notes ?? [],
      },
      metadata: {
        sources: entry.sources ?? [],
      },
      routes: graphFeatureRoutesById[entry.id] ?? [],
    }));
  }, [graphEntries, graphFeatureRoutesById]);

  const graphPluginDescriptors = useMemo<UnifiedPluginDescriptor[]>(() => {
    return graphPlugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      family: 'helper',
      origin: 'plugin-dir',
      category: 'backend',
      tags: ['backend-route-plugin'],
      permissions: plugin.permissions ?? [],
      canDisable: true,
      isActive: true,
      isBuiltin: true,
    }));
  }, [graphPlugins]);

  const displayedFeatures = useGraphFeatures ? graphFeatureCapabilities : allFeatures;
  const displayedPlugins = useGraphPlugins ? graphPluginDescriptors : allPlugins;

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    let plugins = displayedPlugins;

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
  }, [displayedPlugins, familyFilter, originFilter, searchQuery]);

  const selectedFeature = displayedFeatures.find((f) => f.id === selectedFeatureId);
  const selectedFeatureRoutes = useMemo<RouteCapability[]>(() => {
    if (!selectedFeatureId) return [];
    if (useGraphFeatures) {
      return graphFeatureRoutesById[selectedFeatureId] ?? [];
    }
    return localSelectedFeatureRoutes;
  }, [selectedFeatureId, useGraphFeatures, graphFeatureRoutesById, localSelectedFeatureRoutes]);

  const selectedFeatureActions = useMemo<ActionCapability[]>(() => {
    if (!selectedFeatureId) return [];
    if (useGraphFeatures) return [];
    return localSelectedFeatureActions;
  }, [selectedFeatureId, useGraphFeatures, localSelectedFeatureActions]);

  // Statistics
  const pluginCounts = useMemo(() => getPluginCounts(displayedPlugins), [displayedPlugins]);
  const originCounts = useMemo(() => getOriginCounts(displayedPlugins), [displayedPlugins]);
  const pluginHealth = useMemo(() => getPluginHealth(displayedPlugins), [displayedPlugins]);
  const featureUsageStats = useMemo(() => getFeatureUsageStats(displayedPlugins), [displayedPlugins]);
  const docsUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_DOCS_URL as string | undefined;
    if (envUrl && envUrl.trim()) {
      return envUrl.trim().replace(/\/+$/, '');
    }
    if (typeof window === 'undefined') {
      return '';
    }
    const { protocol, host } = window.location;
    if (host.startsWith('app.')) {
      return `${protocol}//${host.replace(/^app\./, 'docs.')}`;
    }
    return '';
  }, []);

  // Export app map data
  const handleExport = () => {
    const appMapData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: graphSource ?? 'local_registry',
      features: displayedFeatures.map((f) => {
        const featureRoutes = useGraphFeatures
          ? (f.routes ?? [])
          : allRoutes.filter((r) => r.featureId === f.id);
        const featureMeta = f.metadata as {
          appMap?: AppMapMetadata;
          updatedAt?: string;
          changeNote?: string;
          featureHighlights?: string[];
        } | undefined;
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          category: f.category,
          icon: f.icon,
          priority: f.priority,
          appMap: f.appMap ?? featureMeta?.appMap,
          updatedAt: (f as { updatedAt?: string }).updatedAt ?? featureMeta?.updatedAt,
          changeNote: (f as { changeNote?: string }).changeNote ?? featureMeta?.changeNote,
          featureHighlights:
            (f as { featureHighlights?: string[] }).featureHighlights ??
            featureMeta?.featureHighlights,
          routes: featureRoutes.map((r) => ({
            path: r.path,
            name: r.name,
            description: r.description,
            protected: r.protected,
            showInNav: r.showInNav,
          })),
        };
      }),
      actions: (useGraphFeatures ? [] : allActions).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        featureId: a.featureId,
        shortcut: a.shortcut,
      })),
      plugins: displayedPlugins.map((p) => ({
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
        updatedAt: p.updatedAt,
        changeNote: p.changeNote,
        featureHighlights: p.featureHighlights,
        isActive: p.isActive,
        canDisable: p.canDisable,
        isBuiltin: p.isBuiltin,
        extensions: p.extensions,
      })),
      stats: {
        featureCount: displayedFeatures.length,
        actionCount: useGraphFeatures ? 0 : allActions.length,
        pluginCount: displayedPlugins.length,
        routeCount: useGraphFeatures
          ? displayedFeatures.reduce((acc, feature) => acc + (feature.routes?.length ?? 0), 0)
          : allRoutes.length,
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
      <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
        {/* Compact header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-medium">{displayedFeatures.length}</span> features
            <span className="mx-0.5">|</span>
            <span className="font-medium">{displayedPlugins.length}</span> plugins
            {graphSource && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  graphSource === 'backend'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                }`}
                title={
                  graphSource === 'backend'
                    ? `Live graph from backend (${graphData?.sources.backend.generated_at ?? ''})`
                    : 'Using local fallback — backend offline'
                }
              >
                {graphSource === 'backend' ? 'Live' : 'Offline'}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <Button size="sm" variant="secondary" onClick={handleExport}>
              Export
            </Button>
            {docsUrl ? (
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                Docs
              </a>
            ) : null}
            {showCodegenLink ? (
              <a
                href={codegenUrl}
                className="px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                Codegen
              </a>
            ) : null}
          </div>
        </div>

        {graphWarnings.length > 0 && (
          <div className="px-3 py-1.5 border-b border-yellow-200 bg-yellow-50 text-[11px] text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
            {graphWarnings.map((warning) => (
              <div key={`${warning.code}-${warning.message}`}>
                [{warning.severity}] {warning.message}
              </div>
            ))}
          </div>
        )}

        {/* Sidebar + Content */}
        <SidebarContentLayout
          sections={SECTIONS}
          activeSectionId={activeSection}
          onSelectSection={(id) => setActiveSection(id as SectionId)}
          sidebarWidth="w-28"
          variant="light"
        >
          <div className="h-full overflow-hidden">
            {activeSection === 'features' && (
              <FeaturesView
                features={displayedFeatures}
                selectedFeature={selectedFeature}
                selectedFeatureRoutes={selectedFeatureRoutes}
                selectedFeatureActions={selectedFeatureActions}
                onSelectFeature={setSelectedFeatureId}
              />
            )}

            {activeSection === 'plugins' && (
              <PluginsView
                allPlugins={displayedPlugins}
                filteredPlugins={filteredPlugins}
                familyFilter={familyFilter}
                originFilter={originFilter}
                searchQuery={searchQuery}
                onFamilyFilterChange={setFamilyFilter}
                onOriginFilterChange={setOriginFilter}
                onSearchQueryChange={setSearchQuery}
              />
            )}

            {activeSection === 'registries' && <RegistriesView />}

            {activeSection === 'graph' && (
              <DependencyGraphPanel features={displayedFeatures} plugins={displayedPlugins} />
            )}

            {activeSection === 'journeys' && <JourneysView />}

            {activeSection === 'testing' && (
              <CapabilityTestingPanel
                features={allFeatures}
                routes={allRoutes}
                actions={allActions}
              />
            )}

            {activeSection === 'stats' && (
              <StatsView
                pluginCounts={pluginCounts}
                originCounts={originCounts}
                pluginHealth={pluginHealth}
                featureUsageStats={featureUsageStats}
                allFeatures={displayedFeatures}
                allActions={useGraphFeatures ? [] : allActions}
              />
            )}

            {activeSection === 'backend' && <BackendArchitecturePanel />}
          </div>
        </SidebarContentLayout>
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
