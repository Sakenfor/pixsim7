import { useState, useEffect, useCallback } from 'react';
import type { OperationType } from '@lib/registries';

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

export interface GenerationDevControllerOptions {
  workspaceId?: number;
  worldId?: number;
  highlightGenerationId?: number;
}

/**
 * Hook: useGenerationDevController
 *
 * Centralizes the data loading and state management logic for GenerationDevPanel:
 * - Fetches generations, provider health, and cache stats.
 * - Manages filters, loading state, and selected generation.
 *
 * This keeps the panel component mostly focused on layout and rendering.
 */
export function useGenerationDevController(options: GenerationDevControllerOptions) {
  const { workspaceId, worldId, highlightGenerationId } = options;

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState<string>('all');

  const loadGenerations = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspace_id', workspaceId.toString());
      if (worldId) params.set('world_id', worldId.toString());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (operationFilter !== 'all') params.set('operation_type', operationFilter);
      params.set('limit', '50');
      params.set('_', 'dev-list');

      const response = await fetch(`/api/v1/generations?${params}`);
      const data = await response.json();
      const gens: Generation[] = data.generations || [];
      setGenerations(gens);

      // Auto-select highlighted generation
      if (highlightGenerationId) {
        const highlighted = gens.find((g) => g.id === highlightGenerationId);
        if (highlighted) {
          setSelectedGeneration(highlighted);
        }
      }
    } catch (error) {
      console.error('Failed to load generations:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, worldId, statusFilter, operationFilter, highlightGenerationId]);

  const loadProviderHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/generations/telemetry/providers?_=health');
      const data = await response.json();
      setProviderHealth(data.providers || []);
    } catch (error) {
      console.error('Failed to load provider health:', error);
    }
  }, []);

  const loadCacheStats = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/generations/cache/stats?_=cache');
      const data = await response.json();
      setCacheStats(data);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  }, []);

  // Initial + filter-based loading
  useEffect(() => {
    loadGenerations();
    loadProviderHealth();
    loadCacheStats();
  }, [loadGenerations, loadProviderHealth, loadCacheStats]);

  return {
    generations,
    providerHealth,
    cacheStats,
    loading,
    selectedGeneration,
    setSelectedGeneration,
    statusFilter,
    setStatusFilter,
    operationFilter,
    setOperationFilter,
    reloadGenerations: loadGenerations,
  };
}

