/**
 * GenerationSourceToggle
 *
 * Widget chrome component (NOT a panel) that provides CAP_GENERATION_SOURCE capability.
 * Allows switching between user settings and asset's original generation settings.
 *
 * Usage: Render in widget header/chrome, inside a GenerationScopeProvider.
 */

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@lib/icons';
import { getGeneration } from '@lib/api/generations';
import { fromGenerationResponse, type GenerationModel } from '../models';
import { useGenerationScopeStores } from '../hooks/useGenerationScope';
import {
  CAP_GENERATION_SOURCE,
  useProvideCapability,
  type GenerationSourceMode,
  type GenerationSourceContext,
} from '@features/contextHub';
import type { OperationType } from '@/types/operations';

export interface GenerationSourceToggleProps {
  /** Source generation ID to fetch when in asset mode */
  sourceGenerationId?: number | null;
  /** Callback when mode changes */
  onModeChange?: (mode: GenerationSourceMode) => void;
  /** Whether to auto-switch to asset mode when sourceGenerationId is available */
  autoSwitchToAsset?: boolean;
}

export function GenerationSourceToggle({
  sourceGenerationId,
  onModeChange,
  autoSwitchToAsset = false,
}: GenerationSourceToggleProps) {
  const [mode, setMode] = useState<GenerationSourceMode>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceGeneration, setSourceGeneration] = useState<GenerationModel | null>(null);

  const { useSessionStore, id: scopeId } = useGenerationScopeStores();

  const available = typeof sourceGenerationId === 'number' && Number.isFinite(sourceGenerationId);

  // Fetch generation when switching to asset mode
  useEffect(() => {
    if (mode !== 'asset' || !available || !sourceGenerationId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getGeneration(sourceGenerationId)
      .then((response) => {
        if (cancelled) return;
        const gen = fromGenerationResponse(response);
        setSourceGeneration(gen);

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
          state.setPresetParams(gen.canonicalParams || gen.rawParams || {});
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
        setMode('user'); // Fall back to user mode
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, available, sourceGenerationId, useSessionStore]);

  // Reset when sourceGenerationId changes
  useEffect(() => {
    setSourceGeneration(null);
    setError(null);
    if (!available && mode === 'asset') {
      setMode('user');
    }
    // Auto-switch to asset mode if requested and available
    if (autoSwitchToAsset && available && mode === 'user') {
      setMode('asset');
    }
  }, [sourceGenerationId, available, autoSwitchToAsset]);

  const handleModeChange = useCallback(
    (newMode: GenerationSourceMode) => {
      if (newMode === 'asset' && !available) return;
      setMode(newMode);
      onModeChange?.(newMode);
    },
    [available, onModeChange]
  );

  const resetToUser = useCallback(() => {
    setMode('user');
    setSourceGeneration(null);
    setError(null);
    onModeChange?.('user');
  }, [onModeChange]);

  // Build capability value
  const capabilityValue: GenerationSourceContext = {
    mode,
    setMode: handleModeChange,
    available,
    loading,
    error,
    sourceGeneration: sourceGeneration
      ? {
          id: sourceGeneration.id,
          prompt: sourceGeneration.finalPrompt || '',
          operationType: sourceGeneration.operationType,
          providerId: sourceGeneration.providerId,
          params: sourceGeneration.canonicalParams || sourceGeneration.rawParams || {},
        }
      : null,
    resetToUser,
  };

  useProvideCapability<GenerationSourceContext>(
    CAP_GENERATION_SOURCE,
    {
      id: `generation-source:${scopeId}`,
      label: 'Generation Source',
      priority: 50,
      isAvailable: () => true,
      getValue: () => capabilityValue,
    },
    [mode, available, loading, error, sourceGeneration, scopeId]
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
