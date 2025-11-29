import React, { useState, useMemo } from 'react';
import { Button } from '@pixsim7/shared.ui';
import {
  useTemplateAnalyticsStore,
  type TemplateUsageStats,
  type RefactoringHint,
} from '../../lib/graph/templateAnalyticsStore';
import { useTemplateStore } from '../../lib/graph/templatesStore';

/**
 * TemplateAnalyticsPanel - Live visualization of template usage analytics
 *
 * Provides insights into:
 * - Template usage patterns across scenes and worlds
 * - Most/least used templates
 * - Refactoring recommendations based on usage
 * - Template health metrics
 */
export function TemplateAnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'hints' | 'raw'>('overview');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'usage' | 'recent' | 'name'>('usage');

  // Analytics data
  const allStats = useTemplateAnalyticsStore((state) => state.getAllTemplateStats());
  const usageRecords = useTemplateAnalyticsStore((state) => state.usageRecords);
  const getTemplateUsage = useTemplateAnalyticsStore((state) => state.getTemplateUsage);
  const getRefactoringHints = useTemplateAnalyticsStore((state) => state.getRefactoringHints);
  const clearAnalytics = useTemplateAnalyticsStore((state) => state.clearAnalytics);
  const clearTemplateAnalytics = useTemplateAnalyticsStore((state) => state.clearTemplateAnalytics);

  // Template metadata
  const getTemplate = useTemplateStore((state) => state.getTemplate);

  // Enrich stats with template names
  const enrichedStats = useMemo(() => {
    return allStats.map((stat) => {
      const template = getTemplate(stat.templateId);
      return {
        ...stat,
        templateName: template?.name || stat.templateId,
        templateSource: template?.source,
        templateCategory: template?.category,
      };
    });
  }, [allStats, getTemplate]);

  // Sort templates
  const sortedStats = useMemo(() => {
    const sorted = [...enrichedStats];

    switch (sortBy) {
      case 'usage':
        sorted.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'recent':
        sorted.sort((a, b) => b.lastUsed - a.lastUsed);
        break;
      case 'name':
        sorted.sort((a, b) => (a.templateName || '').localeCompare(b.templateName || ''));
        break;
    }

    return sorted;
  }, [enrichedStats, sortBy]);

  // Get refactoring hints
  const hints = useMemo(() => {
    const rawHints = getRefactoringHints();
    // Enrich with template names
    return rawHints.map((hint) => {
      const template = getTemplate(hint.templateId);
      return {
        ...hint,
        templateName: template?.name || hint.templateId,
      };
    });
  }, [getRefactoringHints, getTemplate]);

  // Calculate overview metrics
  const overviewMetrics = useMemo(() => {
    const totalInsertions = usageRecords.length;
    const uniqueTemplates = enrichedStats.length;
    const totalNodesInserted = enrichedStats.reduce((sum, stat) => sum + stat.totalNodesInserted, 0);
    const avgNodesPerInsertion = totalInsertions > 0 ? totalNodesInserted / totalInsertions : 0;
    const uniqueScenes = new Set(usageRecords.map((r) => r.sceneId).filter(Boolean)).size;
    const uniqueWorlds = new Set(usageRecords.map((r) => r.worldId).filter((id): id is number => id !== null)).size;

    return {
      totalInsertions,
      uniqueTemplates,
      totalNodesInserted,
      avgNodesPerInsertion,
      uniqueScenes,
      uniqueWorlds,
    };
  }, [usageRecords, enrichedStats]);

  // Get top templates
  const topTemplates = sortedStats.slice(0, 5);

  // Handle clear all analytics
  const handleClearAll = () => {
    if (confirm('Clear all template analytics data? This cannot be undone.')) {
      clearAnalytics();
      setSelectedTemplateId(null);
    }
  };

  // Handle clear template analytics
  const handleClearTemplate = (templateId: string) => {
    const template = getTemplate(templateId);
    const templateName = template?.name || templateId;

    if (confirm(`Clear analytics for "${templateName}"? This cannot be undone.`)) {
      clearTemplateAnalytics(templateId);
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
    }
  };

  // Render severity badge
  const renderSeverityBadge = (severity: 'info' | 'suggestion' | 'recommendation') => {
    const colors = {
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      suggestion: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      recommendation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    };

    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[severity]}`}>
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    );
  };

  // Render hint type icon
  const renderHintIcon = (type: RefactoringHint['type']) => {
    const icons = {
      'high-usage': '🔥',
      'duplicate-pattern': '📋',
      'world-specific': '🌍',
      'underutilized': '💤',
    };
    return icons[type] || '💡';
  };

  // Selected template details
  const selectedTemplate = selectedTemplateId
    ? enrichedStats.find((s) => s.templateId === selectedTemplateId)
    : null;

  const selectedTemplateRecords = selectedTemplateId ? getTemplateUsage(selectedTemplateId) : [];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700 px-6 py-3 bg-neutral-50 dark:bg-neutral-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
            activeTab === 'templates'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          Templates ({enrichedStats.length})
        </button>
        <button
          onClick={() => setActiveTab('hints')}
          className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
            activeTab === 'hints'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          Hints ({hints.length})
        </button>
        <button
          onClick={() => setActiveTab('raw')}
          className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
            activeTab === 'raw'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          Raw Data ({usageRecords.length})
        </button>

        <div className="ml-auto">
          <Button size="sm" variant="secondary" onClick={handleClearAll}>
            Clear All Analytics
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                Template Usage Overview
              </h2>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Total Insertions</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.totalInsertions}
                  </div>
                </div>
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Unique Templates</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.uniqueTemplates}
                  </div>
                </div>
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Total Nodes Inserted</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.totalNodesInserted}
                  </div>
                </div>
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Avg Nodes/Insertion</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.avgNodesPerInsertion.toFixed(1)}
                  </div>
                </div>
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Unique Scenes</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.uniqueScenes}
                  </div>
                </div>
                <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Unique Worlds</div>
                  <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                    {overviewMetrics.uniqueWorlds}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Templates */}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                Most Used Templates
              </h3>
              {topTemplates.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                  No template usage data yet
                </div>
              ) : (
                <div className="space-y-2">
                  {topTemplates.map((stat, index) => (
                    <div
                      key={stat.templateId}
                      className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-750 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedTemplateId(stat.templateId);
                        setActiveTab('templates');
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold text-neutral-400 dark:text-neutral-600">
                              #{index + 1}
                            </span>
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {stat.templateName}
                            </span>
                            {stat.templateCategory && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">
                                {stat.templateCategory}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
                            <span>{stat.usageCount} uses</span>
                            <span>•</span>
                            <span>{stat.uniqueScenes.size} scenes</span>
                            <span>•</span>
                            <span>{stat.avgNodesInserted.toFixed(1)} avg nodes</span>
                          </div>
                        </div>
                        <div className="text-right text-sm text-neutral-500 dark:text-neutral-400">
                          Last used: {new Date(stat.lastUsed).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Hints */}
            {hints.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Recent Refactoring Hints
                </h3>
                <div className="space-y-2">
                  {hints.slice(0, 3).map((hint) => (
                    <div
                      key={hint.id}
                      className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{renderHintIcon(hint.type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {renderSeverityBadge(hint.severity)}
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {hint.templateName}
                            </span>
                          </div>
                          <div className="text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                            {hint.message}
                          </div>
                          {hint.suggestion && (
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">
                              💡 {hint.suggestion}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setActiveTab('hints')}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View all {hints.length} hints →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Template Usage Statistics
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 dark:text-neutral-400">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="usage">Usage Count</option>
                  <option value="recent">Recently Used</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            {sortedStats.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                <div className="text-4xl mb-3">📊</div>
                <div className="text-lg">No template usage data yet</div>
                <div className="text-sm mt-1">Insert templates in your scenes to see analytics here</div>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedStats.map((stat) => {
                  const isSelected = selectedTemplateId === stat.templateId;

                  return (
                    <div
                      key={stat.templateId}
                      className={`border rounded-lg overflow-hidden transition-all ${
                        isSelected
                          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900'
                          : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <div
                        className="p-4 bg-white dark:bg-neutral-800 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-750"
                        onClick={() => setSelectedTemplateId(isSelected ? null : stat.templateId)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-lg text-neutral-900 dark:text-neutral-100">
                                {stat.templateName}
                              </span>
                              {stat.templateCategory && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">
                                  {stat.templateCategory}
                                </span>
                              )}
                              {stat.templateSource && (
                                <span className="px-2 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded">
                                  {stat.templateSource}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearTemplate(stat.templateId);
                            }}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Clear Data
                          </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <div className="text-neutral-600 dark:text-neutral-400">Usage Count</div>
                            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {stat.usageCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-neutral-600 dark:text-neutral-400">Unique Scenes</div>
                            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {stat.uniqueScenes.size}
                            </div>
                          </div>
                          <div>
                            <div className="text-neutral-600 dark:text-neutral-400">Avg Nodes</div>
                            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {stat.avgNodesInserted.toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-neutral-600 dark:text-neutral-400">Last Used</div>
                            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {new Date(stat.lastUsed).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isSelected && selectedTemplateRecords.length > 0 && (
                        <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-900/50">
                          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                            Usage History ({selectedTemplateRecords.length} records)
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {selectedTemplateRecords
                              .sort((a, b) => b.timestamp - a.timestamp)
                              .map((record) => (
                                <div
                                  key={record.id}
                                  className="flex items-center justify-between text-xs p-2 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-neutral-500 dark:text-neutral-400">
                                      {new Date(record.timestamp).toLocaleString()}
                                    </span>
                                    {record.sceneId && (
                                      <span className="text-neutral-600 dark:text-neutral-400">
                                        Scene: {record.sceneId}
                                      </span>
                                    )}
                                    {record.worldId !== null && (
                                      <span className="text-neutral-600 dark:text-neutral-400">
                                        World #{record.worldId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-neutral-600 dark:text-neutral-400">
                                    {record.nodeCount} nodes, {record.edgeCount} edges
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Hints Tab */}
        {activeTab === 'hints' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Refactoring Hints & Recommendations
            </h2>

            {hints.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                <div className="text-4xl mb-3">💡</div>
                <div className="text-lg">No refactoring hints yet</div>
                <div className="text-sm mt-1">Use templates in your scenes to generate insights</div>
              </div>
            ) : (
              <div className="space-y-3">
                {hints.map((hint) => (
                  <div
                    key={hint.id}
                    className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{renderHintIcon(hint.type)}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {renderSeverityBadge(hint.severity)}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {hint.templateName}
                          </span>
                        </div>
                        <div className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                          <strong>Finding:</strong> {hint.message}
                        </div>
                        {hint.details && (
                          <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                            {hint.details}
                          </div>
                        )}
                        {hint.suggestion && (
                          <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-3 rounded mt-2">
                            <strong>💡 Suggestion:</strong> {hint.suggestion}
                          </div>
                        )}
                        {hint.metrics && (
                          <div className="flex items-center gap-4 mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                            {hint.metrics.usageCount !== undefined && (
                              <span>{hint.metrics.usageCount} uses</span>
                            )}
                            {hint.metrics.sceneCount !== undefined && (
                              <span>{hint.metrics.sceneCount} scenes</span>
                            )}
                            {hint.metrics.worldCount !== undefined && (
                              <span>{hint.metrics.worldCount} worlds</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Data Tab */}
        {activeTab === 'raw' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Raw Usage Records
            </h2>

            {usageRecords.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                <div className="text-4xl mb-3">📝</div>
                <div className="text-lg">No usage records yet</div>
              </div>
            ) : (
              <div className="space-y-2">
                {usageRecords
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((record) => {
                    const template = getTemplate(record.templateId);
                    const templateName = template?.name || record.templateId;

                    return (
                      <div
                        key={record.id}
                        className="p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {templateName}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {new Date(record.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                          <div>
                            <span className="font-medium">Template ID:</span> {record.templateId}
                          </div>
                          {record.sceneId && (
                            <div>
                              <span className="font-medium">Scene:</span> {record.sceneId}
                            </div>
                          )}
                          {record.worldId !== null && (
                            <div>
                              <span className="font-medium">World:</span> #{record.worldId}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Nodes:</span> {record.nodeCount}
                          </div>
                          <div>
                            <span className="font-medium">Edges:</span> {record.edgeCount}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
