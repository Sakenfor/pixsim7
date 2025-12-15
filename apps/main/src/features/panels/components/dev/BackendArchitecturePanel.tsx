import React, { useState, useEffect } from "react";

interface BackendArchitectureData {
  version: string;
  routes: Array<{
    path: string;
    methods: string[];
    name: string;
    tags: string[];
  }>;
  capabilities: Array<{
    name: string;
    file: string;
    category: string;
    description: string;
    methods: string[];
    permission: string;
    exists: boolean;
    path: string;
  }>;
  services: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
    description: string;
    sub_services: Array<{
      name: string;
      path: string;
      lines: number;
      responsibility: string;
      exists: boolean;
    }>;
  }>;
  plugins: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    permissions: string[];
    path: string;
  }>;
  metrics: {
    total_routes: number;
    route_tags: Record<string, number>;
    total_services: number;
    total_sub_services: number;
    avg_sub_service_lines: number;
    total_plugins: number;
    unique_permissions: number;
    permission_usage: Record<string, number>;
    modernized_plugins: number;
  };
}

interface BackendArchitecturePanelProps {}

export function BackendArchitecturePanel({}: BackendArchitecturePanelProps) {
  const [data, setData] = useState<BackendArchitectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<
    "services" | "routes" | "capabilities" | "permissions"
  >("services");

  useEffect(() => {
    fetchArchitectureData();
  }, []);

  const fetchArchitectureData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/dev/architecture/map");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch backend architecture:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading backend architecture...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-red-600 dark:text-red-400">
          Failed to load backend architecture
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {error}
        </div>
        <button
          onClick={fetchArchitectureData}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Architecture Metrics */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Services"
            value={data.metrics.total_services}
            sublabel={`${data.metrics.total_sub_services} sub-services`}
            icon="🏗️"
          />
          <MetricCard
            label="Routes"
            value={data.metrics.total_routes}
            sublabel={`${Object.keys(data.metrics.route_tags).length} tags`}
            icon="🛣️"
          />
          <MetricCard
            label="Plugins"
            value={data.metrics.modernized_plugins}
            sublabel={`of ${data.metrics.total_plugins} total`}
            icon="🔌"
          />
          <MetricCard
            label="Avg Module Size"
            value={`${data.metrics.avg_sub_service_lines}`}
            sublabel="lines"
            icon="📏"
          />
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 px-4 py-2 flex gap-2">
        <button
          onClick={() => setActiveView("services")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === "services"
              ? "bg-blue-500 text-white"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          Service Composition
        </button>
        <button
          onClick={() => setActiveView("routes")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === "routes"
              ? "bg-blue-500 text-white"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          Routes & Capabilities
        </button>
        <button
          onClick={() => setActiveView("capabilities")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === "capabilities"
              ? "bg-blue-500 text-white"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          Capability APIs
        </button>
        <button
          onClick={() => setActiveView("permissions")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === "permissions"
              ? "bg-blue-500 text-white"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          Permission Matrix
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeView === "services" && <ServicesView services={data.services} />}
        {activeView === "routes" && (
          <RoutesView routes={data.routes} plugins={data.plugins} />
        )}
        {activeView === "capabilities" && (
          <CapabilitiesView capabilities={data.capabilities} />
        )}
        {activeView === "permissions" && (
          <PermissionsView plugins={data.plugins} metrics={data.metrics} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Services View (Composition Tree)
// ============================================================================

interface ServicesViewProps {
  services: BackendArchitectureData["services"];
}

function ServicesView({ services }: ServicesViewProps) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Service Composition Tree
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Shows how large "God Object" services have been split into focused
          sub-services with single responsibilities. Composition layers maintain
          backward compatibility.
        </p>
      </div>

      <div className="space-y-4">
        {services.map((service) => (
          <div
            key={service.id}
            className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
          >
            {/* Service Header */}
            <div className="bg-neutral-50 dark:bg-neutral-800 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {service.name}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded font-medium">
                      {service.type}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                    {service.description}
                  </p>
                  <code className="text-xs font-mono text-neutral-500 dark:text-neutral-500">
                    {service.path}
                  </code>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {service.sub_services.length}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    sub-services
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-services */}
            <div className="p-4 space-y-2">
              {service.sub_services.map((sub, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 flex items-center justify-center font-mono text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {sub.name}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded">
                        {sub.lines} lines
                      </span>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                      {sub.responsibility}
                    </p>
                    <code className="text-xs font-mono text-neutral-500 dark:text-neutral-500">
                      {sub.path}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {services.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No service composition data available
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Routes View
// ============================================================================

interface RoutesViewProps {
  routes: BackendArchitectureData["routes"];
  plugins: BackendArchitectureData["plugins"];
}

function RoutesView({ routes, plugins }: RoutesViewProps) {
  // Group routes by tag
  const routesByTag: Record<string, typeof routes> = {};
  routes.forEach((route) => {
    route.tags.forEach((tag) => {
      if (!routesByTag[tag]) routesByTag[tag] = [];
      routesByTag[tag].push(route);
    });
  });

  const tags = Object.keys(routesByTag).sort();

  // Find plugin for a given route path
  const findPluginForRoute = (path: string) => {
    // Simple heuristic: match path prefix to plugin ID
    return plugins.find(
      (p) => path.includes(p.id.replace("_", "-")) || path.includes(p.id),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          API Routes & Plugin Mapping
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          All registered FastAPI routes grouped by tag, with plugin permissions.
        </p>
      </div>

      <div className="space-y-6">
        {tags.map((tag) => (
          <div key={tag}>
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                {tag}
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">
                ({routesByTag[tag].length} routes)
              </span>
            </h4>
            <div className="space-y-1">
              {routesByTag[tag].map((route, idx) => {
                const plugin = findPluginForRoute(route.path);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex gap-1">
                        {route.methods.map((method) => (
                          <span
                            key={method}
                            className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                              method === "GET"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                : method === "POST"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                  : method === "PUT" || method === "PATCH"
                                    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                                    : method === "DELETE"
                                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                      : "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            {method}
                          </span>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <code className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                          {route.path}
                        </code>
                        {plugin && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              Plugin: {plugin.name}
                            </span>
                            {plugin.permissions.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {plugin.permissions.map((perm) => (
                                  <span
                                    key={perm}
                                    className="text-xs px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded font-mono"
                                  >
                                    {perm}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {routes.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No routes found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Capabilities View
// ============================================================================

interface CapabilitiesViewProps {
  capabilities: BackendArchitectureData["capabilities"];
}

function CapabilitiesView({ capabilities }: CapabilitiesViewProps) {
  // Group by category
  const capsByCategory: Record<string, typeof capabilities> = {};
  capabilities.forEach((cap) => {
    if (!capsByCategory[cap.category]) capsByCategory[cap.category] = [];
    capsByCategory[cap.category].push(cap);
  });

  const categories = Object.keys(capsByCategory).sort();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Capability APIs
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Available capability APIs that PluginContext provides to routes. These
          form the clean architecture layer between routes and domain logic.
        </p>
      </div>

      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category}>
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2 uppercase text-neutral-500 dark:text-neutral-400">
              {category}
            </h4>
            <div className="space-y-2">
              {capsByCategory[category].map((cap, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {cap.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded font-mono">
                          {cap.permission}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                        {cap.description}
                      </p>
                      <code className="text-xs font-mono text-neutral-500 dark:text-neutral-500">
                        {cap.path}
                      </code>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      Methods:
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {cap.methods.map((method) => (
                        <code
                          key={method}
                          className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-mono"
                        >
                          {method}()
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {capabilities.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No capabilities found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Permissions View
// ============================================================================

interface PermissionsViewProps {
  plugins: BackendArchitectureData["plugins"];
  metrics: BackendArchitectureData["metrics"];
}

function PermissionsView({ plugins, metrics }: PermissionsViewProps) {
  // Get all unique permissions
  const allPermissions = Array.from(
    new Set(plugins.flatMap((p) => p.permissions)),
  ).sort();

  // Build permission matrix
  const matrix: Array<{
    permission: string;
    count: number;
    plugins: string[];
  }> = allPermissions.map((perm) => ({
    permission: perm,
    count: metrics.permission_usage[perm] || 0,
    plugins: plugins
      .filter((p) => p.permissions.includes(perm))
      .map((p) => p.name),
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Permission Matrix
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Shows which permissions are declared by which plugins. PluginContext
          checks these permissions before allowing capability API operations.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Unique Permissions"
          value={metrics.unique_permissions}
          sublabel="declared"
          icon="🔐"
        />
        <MetricCard
          label="Total Uses"
          value={Object.values(metrics.permission_usage).reduce(
            (a, b) => a + b,
            0,
          )}
          sublabel="across plugins"
          icon="📊"
        />
        <MetricCard
          label="Modernized Plugins"
          value={metrics.modernized_plugins}
          sublabel={`of ${metrics.total_plugins}`}
          icon="✅"
        />
      </div>

      <div className="space-y-2">
        {matrix
          .sort((a, b) => b.count - a.count)
          .map((item) => (
            <div
              key={item.permission}
              className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                    {item.permission}
                  </code>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                    {item.count} {item.count === 1 ? "plugin" : "plugins"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {item.plugins.map((plugin) => (
                  <span
                    key={plugin}
                    className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded"
                  >
                    {plugin}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>

      {allPermissions.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No permissions found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function MetricCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  icon: string;
}) {
  return (
    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {sublabel}
        </div>
      )}
    </div>
  );
}
