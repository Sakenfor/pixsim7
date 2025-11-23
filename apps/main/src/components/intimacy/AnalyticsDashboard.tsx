/**
 * Analytics Dashboard
 *
 * Visual dashboard for viewing intimacy scene and progression arc analytics.
 * Shows usage patterns, success rates, and engagement metrics.
 *
 * @see apps/main/src/lib/intimacy/analytics.ts
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 11)
 */

import React, { useState, useEffect } from 'react';
import {
  getSceneAnalyticsSummary,
  getArcAnalyticsSummary,
  clearAnalytics,
  exportAnalytics,
  importAnalytics,
  type SceneAnalyticsSummary,
  type ArcAnalyticsSummary,
} from '../../lib/intimacy/analytics';

interface AnalyticsDashboardProps {
  /** Callback when dashboard is closed */
  onClose?: () => void;
}

export function AnalyticsDashboard({ onClose }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'scenes' | 'arcs'>('scenes');
  const [sceneAnalytics, setSceneAnalytics] = useState<SceneAnalyticsSummary | null>(null);
  const [arcAnalytics, setArcAnalytics] = useState<ArcAnalyticsSummary | null>(null);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setSceneAnalytics(getSceneAnalyticsSummary());
    setArcAnalytics(getArcAnalyticsSummary());
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
      clearAnalytics();
      refreshData();
    }
  };

  const handleExport = () => {
    const json = exportAnalytics();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intimacy_analytics_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          importAnalytics(text);
          refreshData();
          alert('Analytics imported successfully!');
        } catch (error) {
          alert('Failed to import analytics: ' + (error as Error).message);
        }
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              📊 Analytics Dashboard
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              View usage patterns and engagement metrics for intimacy content
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshData}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              🔄 Refresh
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              💾 Export
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              📥 Import
            </button>
            <button
              onClick={handleClearData}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              🗑️ Clear
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-neutral-700">
        <button
          onClick={() => setActiveTab('scenes')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'scenes'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Scene Analytics
        </button>
        <button
          onClick={() => setActiveTab('arcs')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'arcs'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Arc Analytics
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'scenes' && sceneAnalytics && (
          <SceneAnalyticsView analytics={sceneAnalytics} />
        )}
        {activeTab === 'arcs' && arcAnalytics && (
          <ArcAnalyticsView analytics={arcAnalytics} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Scene Analytics View
// ============================================================================

function SceneAnalyticsView({ analytics }: { analytics: SceneAnalyticsSummary }) {
  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Scenes"
          value={analytics.totalScenes}
          icon="🎬"
        />
        <StatCard
          label="Total Attempts"
          value={analytics.totalAttempts}
          icon="▶️"
        />
        <StatCard
          label="Completion Rate"
          value={`${analytics.completionRate.toFixed(1)}%`}
          icon="✓"
          valueColor="text-green-600 dark:text-green-400"
        />
      </div>

      {/* Scene Type Distribution */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Scene Type Distribution
        </h3>
        <div className="space-y-2">
          {Object.entries(analytics.sceneTypeDistribution).map(([type, count]) => (
            <div key={type} className="flex items-center gap-3">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 w-24">
                {type}
              </div>
              <div className="flex-1 h-6 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{
                    width: `${(count / analytics.totalAttempts) * 100}%`,
                  }}
                />
              </div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 w-16 text-right">
                {count} ({((count / analytics.totalAttempts) * 100).toFixed(1)}%)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Most Used Scenes */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Most Used Scenes
        </h3>
        {analytics.mostUsedScenes.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No scene usage data yet
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.mostUsedScenes.map((scene, idx) => (
              <div key={scene.sceneId} className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800 rounded">
                <div className="text-sm font-bold text-neutral-500 w-8">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {scene.sceneName}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Type: {scene.sceneType}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {scene.attempts}
                  </div>
                  <div className="text-xs text-neutral-500">attempts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gate Blockages */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Top Gate Blockages
        </h3>
        {analytics.gateBlockages.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No gate blockage data yet
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.gateBlockages.map((gate, idx) => (
              <div key={`${gate.sceneId}_${gate.gateId}`} className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded">
                <div className="text-sm font-bold text-red-500 w-8">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {gate.gateName}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Scene: {gate.sceneName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {gate.blockCount}
                  </div>
                  <div className="text-xs text-neutral-500">blocks</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Arc Analytics View
// ============================================================================

function ArcAnalyticsView({ analytics }: { analytics: ArcAnalyticsSummary }) {
  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Arcs"
          value={analytics.totalArcs}
          icon="⭐"
        />
        <StatCard
          label="Stage Entries"
          value={analytics.totalStageEntries}
          icon="→"
        />
        <StatCard
          label="Completion Rate"
          value={`${analytics.completionRate.toFixed(1)}%`}
          icon="✓"
          valueColor="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Avg Stages Completed"
          value={analytics.averageStagesCompleted.toFixed(1)}
          icon="📈"
        />
      </div>

      {/* Most Completed Arcs */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Most Completed Arcs
        </h3>
        {analytics.mostCompletedArcs.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No arc completion data yet
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.mostCompletedArcs.map((arc, idx) => (
              <div key={arc.arcId} className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded">
                <div className="text-sm font-bold text-green-500 w-8">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {arc.arcName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {arc.completions}
                  </div>
                  <div className="text-xs text-neutral-500">completions</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stage Completion Rates */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Stage Completion Rates
        </h3>
        {analytics.stageCompletionRates.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No stage data yet
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.stageCompletionRates.map((stage) => (
              <div key={stage.stageName} className="flex items-center gap-3">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 w-40">
                  {stage.stageName}
                </div>
                <div className="flex-1 h-6 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${stage.completionRate}%`,
                    }}
                  />
                </div>
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 w-32 text-right">
                  {stage.completions}/{stage.attempts} ({stage.completionRate.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abandonment Points */}
      <div className="border dark:border-neutral-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
          Top Abandonment Points
        </h3>
        {analytics.abandonmentPoints.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No abandonment data yet
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.abandonmentPoints.map((point, idx) => (
              <div key={`${point.arcId}_${point.stageId}`} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded">
                <div className="text-sm font-bold text-amber-500 w-8">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {point.stageName}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Arc: {point.arcName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {point.abandonments}
                  </div>
                  <div className="text-xs text-neutral-500">abandonments</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  valueColor = 'text-neutral-900 dark:text-neutral-100',
}: {
  label: string;
  value: string | number;
  icon: string;
  valueColor?: string;
}) {
  return (
    <div className="border dark:border-neutral-700 rounded-lg p-4">
      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
        <span className="mr-2">{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}
