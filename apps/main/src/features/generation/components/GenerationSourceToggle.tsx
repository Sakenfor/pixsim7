/**
 * GenerationSourceToggle
 *
 * Widget chrome component (NOT a panel) that provides CAP_GENERATION_SOURCE capability.
 * Allows switching between user settings and asset's original generation settings.
 *
 * This is a CONTROLLED component - mode is passed in, not managed internally.
 *
 * Usage: Render in widget header/chrome, inside a GenerationScopeProvider.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

import { getGeneration } from '@lib/api/generations';
import { Icon } from '@lib/icons';

import {
  CAP_GENERATION_SOURCE,
  useProvideCapability,
  type GenerationSourceMode,
  type GenerationSourceContext,
} from '@features/contextHub';

import type { OperationType } from '@/types/operations';

import { useGenerationScopeStores } from '../hooks/useGenerationScope';
import { fromGenerationResponse, type GenerationModel } from '../models';

const EMPTY_PARAMS: Record<string, unknown> = {};

export interface GenerationSourceToggleProps {
  /** Current mode (controlled) */
  mode: GenerationSourceMode;
  /** Callback when user changes mode */
  onModeChange: (mode: GenerationSourceMode) => void;
  /** Source generation ID to fetch when in asset mode */
  sourceGenerationId?: number | null;
}

export function GenerationSourceToggle({
  mode,
  onModeChange,
  sourceGenerationId,
}: GenerationSourceToggleProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceGeneration, setSourceGeneration] = useState<GenerationModel | null>(null);
  // Track which generation ID we've fetched to avoid refetching same data
  const [fetchedGenerationId, setFetchedGenerationId] = useState<number | null>(null);

  const { useSessionStore, useSettingsStore, id: scopeId } = useGenerationScopeStores();

  const available = typeof sourceGenerationId === 'number' && Number.isFinite(sourceGenerationId);

  // Fetch generation when in asset mode and we have a new sourceGenerationId
  useEffect(() => {
    if (mode !== 'asset' || !available || !sourceGenerationId) {
      return;
    }

    // Already fetched this generation
    if (fetchedGenerationId === sourceGenerationId && sourceGeneration) {
      return;
    }

    let cancelled = false;
    const currentScopeId = scopeId; // Capture for stale check

    setLoading(true);
    setError(null);

    getGeneration(sourceGenerationId)
      .then((response) => {
        if (cancelled) return;

        // Check if scope changed during fetch
        const nowScopeId = useSessionStore.getState ? scopeId : currentScopeId;
        if (nowScopeId !== currentScopeId) {
          return; // Scope changed, discard result
        }

        const gen = fromGenerationResponse(response);
        setSourceGeneration(gen);
        setFetchedGenerationId(sourceGenerationId);

        // Populate scoped stores (single source of truth for asset mode)
        const state = useSessionStore.getState();
        state.setPrompt(gen.finalPrompt || '');
        if (gen.operationType) {
          state.setOperationType(gen.operationType as OperationType);
        }
        if (gen.providerId) {
          state.setProvider(gen.providerId);
        }
        if (gen.canonicalParams || gen.rawParams) {
          (useSettingsStore as any).getState().setDynamicParams(gen.canonicalParams || gen.rawParams || {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Handle permission errors gracefully
        if (err?.status === 403) {
          setError('You do not have access to this generation');
        } else {
          setError('Failed to load original settings');
        }
        // Fall back to user mode on error
        onModeChange('user');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, available, sourceGenerationId, useSessionStore, scopeId, fetchedGenerationId, sourceGeneration, onModeChange]);

  // Reset fetched data when sourceGenerationId changes
  useEffect(() => {
    if (sourceGenerationId !== fetchedGenerationId) {
      setSourceGeneration(null);
      setFetchedGenerationId(null);
      setError(null);
    }
  }, [sourceGenerationId, fetchedGenerationId]);

  // Reset to user mode if asset becomes unavailable while in asset mode
  useEffect(() => {
    if (!available && mode === 'asset') {
      onModeChange('user');
    }
  }, [available, mode, onModeChange]);

  const handleModeChange = useCallback(
    (newMode: GenerationSourceMode) => {
      if (newMode === 'asset' && !available) return;
      onModeChange(newMode);
    },
    [available, onModeChange]
  );

  const resetToUser = useCallback(() => {
    setSourceGeneration(null);
    setFetchedGenerationId(null);
    setError(null);
    onModeChange('user');
  }, [onModeChange]);

  const sourceGenerationSummary = useMemo(() => {
    if (!sourceGeneration) return null;
    return {
      id: sourceGeneration.id,
      prompt: sourceGeneration.finalPrompt || '',
      operationType: sourceGeneration.operationType,
      providerId: sourceGeneration.providerId,
      params: sourceGeneration.canonicalParams ?? sourceGeneration.rawParams ?? EMPTY_PARAMS,
    };
  }, [sourceGeneration]);

  // Build capability value (memoized to avoid useSyncExternalStore loops)
  const capabilityValue: GenerationSourceContext = useMemo(() => ({
    mode,
    setMode: handleModeChange,
    available,
    loading,
    error,
    sourceGeneration: sourceGenerationSummary,
    resetToUser,
  }), [mode, handleModeChange, available, loading, error, sourceGenerationSummary, resetToUser]);

  useProvideCapability<GenerationSourceContext>(
    CAP_GENERATION_SOURCE,
    {
      id: `generation-source:${scopeId}`,
      label: 'Generation Source',
      priority: 50,
      isAvailable: () => true,
      getValue: () => capabilityValue,
    },
    [capabilityValue, scopeId]
  );

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md bg-neutral-100 dark:bg-neutral-800 p-0.5">
        <button
          onClick={() => handleModeChange('asset')}
          disabled={!available}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
            mode === 'asset'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : available
                ? 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                : 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
          }`}
          title={
            available
              ? 'Use original generation settings'
              : 'No source generation for this asset'
          }
        >
          Asset
        </button>
        <button
          onClick={() => handleModeChange('user')}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
            mode === 'user'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          title="Use Control Center settings"
        >
          My Settings
        </button>
      </div>
      {loading && <Icon name="loader" size={12} className="animate-spin text-neutral-400" />}
      {error && (
        <span className="text-[10px] text-red-500" title={error}>
          <Icon name="alert-circle" size={12} />
        </span>
      )}
    </div>
  );
}

export type { GenerationSourceMode, GenerationSourceContext };
