/**
 * Generation Developer Panel (Phase 10)
 *
 * Developer tool for viewing and debugging generation records.
 *
 * Features:
 * - List recent generations with filters
 * - View generation details (params, status, timings)
 * - Provider health metrics
 * - Operation type metrics
 * - Cache statistics
 * - Drill-down to related resources
 *
 * @dev_tool
 * @use_cases
 * - Debugging generation failures
 * - Monitoring provider performance
 * - Inspecting social context in generations
 * - Analyzing cache hit rates
 */

import { useState, useEffect } from 'react';
import type { OperationType } from '@pixsim7/shared.types';

interface Generation {
  id: number;
  operation_type: OperationType;
  provider_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  canonical_params: Record<string, any>;
  reproducible_hash: string;
  prompt_source_type?: string;
}

interface ProviderHealth {
  provider_id: string;
  total_generations: number;
  completed: number;
  failed: number;
  success_rate: number;
  latency_p50?: number;
  latency_p95?: number;
  latency_p99?: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_cost_per_generation: number;
}

interface CacheStats {
  total_cached_generations: number;
  redis_connected: boolean;
}

interface GenerationDevPanelProps {
  /** Optional workspace filter */
  workspaceId?: number;
  /** Optional world filter */
  worldId?: number;
  /** Optional initial generation to highlight */
  highlightGenerationId?: number;
}

export function GenerationDevPanel({
  workspaceId,
  worldId,
  highlightGenerationId,
}: GenerationDevPanelProps) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState<string>('all');

  useEffect(() => {
    loadGenerations();
    loadProviderHealth();
    loadCacheStats();
  }, [workspaceId, statusFilter, operationFilter]);

  const loadGenerations = async () => {
    try {
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspace_id', workspaceId.toString());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (operationFilter !== 'all') params.set('operation_type', operationFilter);
      params.set('limit', '50');

      const response = await fetch(`/api/v1/generations?${params}`);
      const data = await response.json();
      setGenerations(data.generations || []);

      // Auto-select highlighted generation
      if (highlightGenerationId) {
        const highlighted = data.generations.find((g: Generation) => g.id === highlightGenerationId);
        if (highlighted) setSelectedGeneration(highlighted);
      }
    } catch (error) {
      console.error('Failed to load generations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProviderHealth = async () => {
    try {
      const response = await fetch('/api/v1/generations/telemetry/providers');
      const data = await response.json();
      setProviderHealth(data.providers || []);
    } catch (error) {
      console.error('Failed to load provider health:', error);
    }
  };

  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/v1/generations/cache/stats');
      const data = await response.json();
      setCacheStats(data);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  };

  const formatDuration = (gen: Generation): string => {
    if (!gen.started_at || !gen.completed_at) return 'N/A';
    const start = new Date(gen.started_at).getTime();
    const end = new Date(gen.completed_at).getTime();
    const seconds = (end - start) / 1000;
    return `${seconds.toFixed(2)}s`;
  };

  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(4)}`;
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-4">Loading generation data...</div>;
  }

  return (
    <div className="generation-dev-panel h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <h2 className="text-xl font-semibold mb-4">Generation Developer Panel</h2>

        {/* Filters */}
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={operationFilter}
            onChange={(e) => setOperationFilter(e.target.value)}
            className="px-3 py-2 border rounded"
          >
            <option value="all">All Operations</option>
            <option value="text_to_video">Text to Video</option>
            <option value="image_to_video">Image to Video</option>
            <option value="video_extend">Video Extend</option>
          </select>

          <button
            onClick={loadGenerations}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Generation List */}
        <div className="w-1/2 border-r overflow-y-auto">
          {/* Summary Stats */}
          <div className="bg-white border-b p-4">
            <h3 className="font-semibold mb-2">Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Total: {generations.length}</div>
              <div>Completed: {generations.filter(g => g.status === 'completed').length}</div>
              <div>Failed: {generations.filter(g => g.status === 'failed').length}</div>
              <div>Processing: {generations.filter(g => g.status === 'processing').length}</div>
            </div>
          </div>

          {/* Cache Stats */}
          {cacheStats && (
            <div className="bg-white border-b p-4">
              <h3 className="font-semibold mb-2">Cache Statistics</h3>
              <div className="text-sm">
                <div>Cached Generations: {cacheStats.total_cached_generations}</div>
                <div>
                  Redis: <span className={cacheStats.redis_connected ? 'text-green-600' : 'text-red-600'}>
                    {cacheStats.redis_connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Provider Health */}
          {providerHealth.length > 0 && (
            <div className="bg-white border-b p-4">
              <h3 className="font-semibold mb-2">Provider Health</h3>
              <div className="space-y-2 text-sm">
                {providerHealth.map((ph) => (
                  <div key={ph.provider_id} className="border-l-4 border-blue-500 pl-2">
                    <div className="font-medium">{ph.provider_id}</div>
                    <div className="text-gray-600">
                      Success Rate: {(ph.success_rate * 100).toFixed(1)}%
                      {ph.latency_p95 && ` | p95: ${ph.latency_p95.toFixed(1)}s`}
                      {ph.total_cost_usd > 0 && ` | Cost: ${formatCost(ph.total_cost_usd)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generation List */}
          <div className="p-4 space-y-2">
            {generations.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No generations found
              </div>
            ) : (
              generations.map((gen) => (
                <div
                  key={gen.id}
                  onClick={() => setSelectedGeneration(gen)}
                  className={`
                    p-3 border rounded cursor-pointer transition-colors
                    ${selectedGeneration?.id === gen.id ? 'bg-blue-50 border-blue-500' : 'bg-white hover:bg-gray-50'}
                    ${gen.id === highlightGenerationId ? 'ring-2 ring-yellow-400' : ''}
                  `}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-medium">Generation #{gen.id}</div>
                    <span className={`px-2 py-1 text-xs rounded ${getStatusBadgeClass(gen.status)}`}>
                      {gen.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>{gen.operation_type} via {gen.provider_id}</div>
                    <div>Duration: {formatDuration(gen)}</div>
                    <div className="text-xs text-gray-400 truncate">
                      Hash: {gen.reproducible_hash.substring(0, 16)}...
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Generation Details */}
        <div className="w-1/2 overflow-y-auto bg-white p-4">
          {selectedGeneration ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Generation #{selectedGeneration.id}
              </h3>

              {/* Status and Timing */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Status & Timing</h4>
                <div className="text-sm space-y-1">
                  <div>Status: <span className={`px-2 py-1 rounded ${getStatusBadgeClass(selectedGeneration.status)}`}>
                    {selectedGeneration.status}
                  </span></div>
                  <div>Created: {new Date(selectedGeneration.created_at).toLocaleString()}</div>
                  {selectedGeneration.started_at && (
                    <div>Started: {new Date(selectedGeneration.started_at).toLocaleString()}</div>
                  )}
                  {selectedGeneration.completed_at && (
                    <div>Completed: {new Date(selectedGeneration.completed_at).toLocaleString()}</div>
                  )}
                  <div>Duration: {formatDuration(selectedGeneration)}</div>
                </div>
              </div>

              {/* Error */}
              {selectedGeneration.error_message && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-red-600">Error</h4>
                  <div className="text-sm bg-red-50 border border-red-200 p-2 rounded">
                    {selectedGeneration.error_message}
                  </div>
                </div>
              )}

              {/* Canonical Parameters */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Canonical Parameters</h4>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(selectedGeneration.canonical_params, null, 2)}
                </pre>
              </div>

              {/* Social Context */}
              {selectedGeneration.canonical_params.social_context && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Social Context</h4>
                  <div className="text-sm space-y-1">
                    <div>Intimacy: {selectedGeneration.canonical_params.social_context.intimacyBand}</div>
                    <div>Rating: {selectedGeneration.canonical_params.social_context.contentRating}</div>
                    <div>Tier: {selectedGeneration.canonical_params.social_context.relationshipTierId}</div>
                  </div>
                </div>
              )}

              {/* Hash */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Reproducible Hash</h4>
                <div className="text-xs font-mono bg-gray-50 p-2 rounded break-all">
                  {selectedGeneration.reproducible_hash}
                </div>
              </div>

              {/* Prompt Info */}
              {selectedGeneration.prompt_source_type && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Prompt Source</h4>
                  <div className="text-sm">{selectedGeneration.prompt_source_type}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Select a generation to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
