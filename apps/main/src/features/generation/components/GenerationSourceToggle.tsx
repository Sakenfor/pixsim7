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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { getGeneration } from '@lib/api/generations';
import { Icon, IconBadge, Icons } from '@lib/icons';
import { IconButton } from '@pixsim7/shared.ui';
import clsx from 'clsx';

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

const SOURCE_MODES: { id: GenerationSourceMode; icon: string; label: string; color: string }[] = [
  { id: 'asset', icon: 'package', label: 'Asset', color: '#D97706' },
  { id: 'user',  icon: 'user',    label: 'My Settings', color: '#2563EB' },
];

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

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = SOURCE_MODES.find(m => m.id === mode) ?? SOURCE_MODES[1];

  return (
    <div ref={dropdownRef} className="relative flex items-center gap-1">
      <IconButton
        bg={current.color}
        size="lg"
        icon={loading
          ? <Icons.loader size={14} className="animate-spin" />
          : <Icon name={current.icon as any} size={14} />
        }
        onClick={() => setOpen(o => !o)}
        title={current.label}
      />

      {error && (
        <span className="text-[10px] text-red-500" title={error}>
          <Icon name="alertCircle" size={12} />
        </span>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] py-1 rounded-lg shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
          {SOURCE_MODES.map(m => {
            const isDisabled = m.id === 'asset' && !available;
            return (
              <button
                key={m.id}
                type="button"
                disabled={isDisabled}
                onClick={() => { handleModeChange(m.id); setOpen(false); }}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-[11px]',
                  isDisabled
                    ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
                  mode === m.id && 'font-semibold'
                )}
                title={m.id === 'asset' && !available ? 'No source generation for this asset' : m.label}
              >
                <IconBadge
                  name={m.icon as any}
                  size={10}
                  bg={m.color}
                  rounded="md"
                  className={clsx('w-4 h-4 shrink-0', isDisabled && 'opacity-40')}
                />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { GenerationSourceMode, GenerationSourceContext };
