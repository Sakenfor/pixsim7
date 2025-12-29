/**
 * StatsView - Statistics tab for App Map
 *
 * Shows system-wide statistics for features, plugins, and health metrics.
 */

import type { FeatureCapability, ActionCapability } from '@lib/capabilities';
import type { getPluginHealth } from '@lib/plugins/catalog';

interface StatsViewProps {
  pluginCounts: Record<string, number>;
  originCounts: Record<string, number>;
  pluginHealth: ReturnType<typeof getPluginHealth>;
  featureUsageStats: Record<
    string,
    { consumers: number; providers: number; total: number }
  >;
  allFeatures: FeatureCapability[];
  allActions: ActionCapability[];
}

export function StatsView({
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
          <StatCard label="Features" value={allFeatures.length} icon="🎯" />
          <StatCard label="Actions" value={allActions.length} icon="⚡" />
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
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {kind}
              </span>
              <span className="text-neutral-600 dark:text-neutral-400">
                {count}
              </span>
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
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {origin}
              </span>
              <span className="text-neutral-600 dark:text-neutral-400">
                {count}
              </span>
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
              <div>
                With description: {pluginHealth.metadataHealth.withDescription}
              </div>
              <div>
                With category: {pluginHealth.metadataHealth.withCategory}
              </div>
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
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
