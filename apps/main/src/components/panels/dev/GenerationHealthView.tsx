/**
 * Generation Health View
 *
 * Developer tool for viewing the validation status of all generation nodes
 * across a project or world. Helps identify misconfigured nodes before runtime.
 *
 * @dev_tool
 * @use_cases
 * - Pre-deployment health checks
 * - Identifying problematic generation configurations
 * - Bulk validation across multiple scenes/graphs
 */

import { useState, useEffect } from 'react';
import type { GenerationNodeConfig, GenerationValidationResult } from '@/types';
import {
  validateGenerationNode,
  getValidationStatus,
  getValidationSummary,
  type ValidationStatus,
} from '@pixsim7/game.engine';

interface GenerationNodeHealth {
  nodeId: string;
  nodeName?: string;
  sceneId?: string;
  sceneName?: string;
  config: GenerationNodeConfig;
  validation: GenerationValidationResult;
  status: ValidationStatus;
}

interface GenerationHealthViewProps {
  /** Optional filter by world ID */
  worldId?: string;
  /** Optional filter by scene ID */
  sceneId?: string;
  /** Generation nodes to validate */
  nodes: Array<{
    id: string;
    name?: string;
    sceneId?: string;
    sceneName?: string;
    config: GenerationNodeConfig;
  }>;
}

export function GenerationHealthView({
  worldId,
  sceneId,
  nodes,
}: GenerationHealthViewProps) {
  const [nodeHealth, setNodeHealth] = useState<GenerationNodeHealth[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'ok'>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Validate all nodes
  useEffect(() => {
    const healthData = nodes.map((node) => {
      const validation = validateGenerationNode(node.config, {
        // TODO: Pass actual world and user prefs
        world: undefined,
        userPrefs: undefined,
      });

      return {
        nodeId: node.id,
        nodeName: node.name,
        sceneId: node.sceneId,
        sceneName: node.sceneName,
        config: node.config,
        validation,
        status: getValidationStatus(validation),
      };
    });

    setNodeHealth(healthData);

    // Auto-expand nodes with errors
    const errored = new Set(
      healthData.filter((h) => h.status === 'error').map((h) => h.nodeId)
    );
    setExpandedNodes(errored);
  }, [nodes]);

  // Filter nodes based on selected filter
  const filteredNodes = nodeHealth.filter((node) => {
    if (filter === 'all') return true;
    return node.status === filter;
  });

  // Calculate summary stats
  const stats = {
    total: nodeHealth.length,
    errors: nodeHealth.filter((n) => n.status === 'error').length,
    warnings: nodeHealth.filter((n) => n.status === 'warning').length,
    ok: nodeHealth.filter((n) => n.status === 'ok').length,
  };

  function toggleExpanded(nodeId: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            Generation Health Monitor
          </h2>
          <p className="text-sm text-neutral-500">
            Validation status for all generation nodes
            {worldId && ` in world ${worldId}`}
            {sceneId && ` in scene ${sceneId}`}
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === 'all'
                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === 'error'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
            }`}
          >
            Errors ({stats.errors})
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === 'warning'
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                : 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600 dark:text-yellow-400'
            }`}
          >
            Warnings ({stats.warnings})
          </button>
          <button
            onClick={() => setFilter('ok')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === 'ok'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400'
            }`}
          >
            OK ({stats.ok})
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded">
          <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
            {stats.total}
          </div>
          <div className="text-xs text-neutral-500">Total Nodes</div>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">
            {stats.errors}
          </div>
          <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
        </div>
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {stats.warnings}
          </div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400">Warnings</div>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
            {stats.ok}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">Healthy</div>
        </div>
      </div>

      {/* Node List */}
      <div className="space-y-2">
        {filteredNodes.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            {filter === 'all'
              ? 'No generation nodes found'
              : `No nodes with ${filter} status`}
          </div>
        ) : (
          filteredNodes.map((node) => (
            <div
              key={node.nodeId}
              className="border border-neutral-200 dark:border-neutral-700 rounded overflow-hidden"
            >
              {/* Node Header */}
              <button
                onClick={() => toggleExpanded(node.nodeId)}
                className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-750"
              >
                <div className="flex items-center gap-3">
                  {/* Status Badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      node.status === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : node.status === 'warning'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    }`}
                  >
                    {node.status === 'error' && '❌'}
                    {node.status === 'warning' && '⚠️'}
                    {node.status === 'ok' && '✅'}
                  </span>

                  {/* Node Info */}
                  <div className="text-left">
                    <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {node.nodeName || node.nodeId}
                    </div>
                    {node.sceneName && (
                      <div className="text-xs text-neutral-500">
                        Scene: {node.sceneName}
                      </div>
                    )}
                  </div>

                  {/* Config Summary */}
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">
                      {node.config.generationType}
                    </span>
                    <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">
                      {node.config.strategy}
                    </span>
                  </div>
                </div>

                {/* Summary */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    {getValidationSummary(node.validation)}
                  </span>
                  <span className="text-neutral-400">
                    {expandedNodes.has(node.nodeId) ? '▼' : '▶'}
                  </span>
                </div>
              </button>

              {/* Node Details */}
              {expandedNodes.has(node.nodeId) && (
                <div className="p-4 bg-white dark:bg-neutral-900 space-y-3">
                  {/* Errors */}
                  {node.validation.errors.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1.5">
                        ❌ Errors ({node.validation.errors.length})
                      </div>
                      <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                        {node.validation.errors.map((error, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="mt-0.5">•</span>
                            <span>{error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {node.validation.warnings.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1.5">
                        ⚠️ Warnings ({node.validation.warnings.length})
                      </div>
                      <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                        {node.validation.warnings.map((warning, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="mt-0.5">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {node.validation.suggestions.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">
                        💡 Suggestions ({node.validation.suggestions.length})
                      </div>
                      <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                        {node.validation.suggestions.map((suggestion, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="mt-0.5">•</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* All clear */}
                  {node.status === 'ok' && (
                    <div className="text-xs text-green-600 dark:text-green-400 text-center py-2">
                      ✅ All validation checks passed
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {stats.errors > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <div className="text-sm font-semibold text-red-700 dark:text-red-300">
            ⚠️ Action Required
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
            {stats.errors} generation node{stats.errors > 1 ? 's have' : ' has'} validation
            errors that must be fixed before deployment.
          </div>
        </div>
      )}
    </div>
  );
}
