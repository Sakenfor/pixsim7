import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { useAssetSelectionStore, type SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import type { InputItem } from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';

import type { OperationType } from '@/types/operations';

// Re-export for backwards compatibility
export type { OperationType };

export interface QuickGenerateBindings {
  lastSelectedAsset?: SelectedAsset;
  operationInputs: InputItem[];
  operationInputIndex: number;
  transitionInputs: InputItem[];
  dynamicParams: Record<string, any>;
  setDynamicParams: Dispatch<SetStateAction<Record<string, any>>>;
  prompts: string[];
  setPrompts: Dispatch<SetStateAction<string[]>>;
  transitionDurations: number[];
  setTransitionDurations: Dispatch<SetStateAction<number[]>>;
  removeInput: (operationType: OperationType, inputId: string) => void;
  cycleInputs: (operationType: OperationType, direction?: 'next' | 'prev') => void;
  setInputIndex: (operationType: OperationType, index: number) => void;
}

const EMPTY_INPUTS: InputItem[] = [];

/**
 * Hook: useQuickGenerateBindings
 *
 * Exposes per-operation input state and dynamic params to QuickGenerateModule.
 *
 * This hook manages:
 * - State exposure (inputs, selection, dynamicParams)
 * - source_asset_ids array sync for video_transition
 * - prompts/durations arrays for video_transition
 */
export function useQuickGenerateBindings(
  operationType: OperationType,
): QuickGenerateBindings {
  const lastSelectedAsset = useAssetSelectionStore(s => s.lastSelectedAsset);

  const { useSettingsStore, useInputStore } = useGenerationScopeStores();

  const operationInputs = useInputStore(
    s => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS
  );
  const operationInputIndex = useInputStore(
    s => s.inputsByOperation[operationType]?.currentIndex ?? 1
  );
  const transitionInputs = useInputStore(
    s => s.inputsByOperation.video_transition?.items ?? EMPTY_INPUTS
  );

  const removeInput = useInputStore(s => s.removeInput);
  const cycleInputs = useInputStore(s => s.cycleInputs);
  const setInputIndex = useInputStore(s => s.setInputIndex);

  // Dynamic params from operation_specs (scoped store)
  const dynamicParams = useSettingsStore((s) => s.params);
  const setDynamicParams = useSettingsStore((s) => s.setDynamicParams);

  // Operation-specific array fields for video_transition
  const [prompts, setPrompts] = useState<string[]>([]);
  const [transitionDurations, setTransitionDurations] = useState<number[]>([]);

  // Sync source_asset_ids and prompts/durations arrays for video_transition
  useEffect(() => {
    const currentLength = transitionInputs.length;

    if (currentLength === 0) {
      setPrompts([]);
      setTransitionDurations([]);
      setDynamicParams((prev) => {
        if (!('source_asset_ids' in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next.source_asset_ids;
        return next;
      });
      return;
    }

    setDynamicParams((prev) => ({
      ...prev,
      source_asset_ids: transitionInputs.map((item) => item.asset.id),
    }));

    const numTransitions = Math.max(0, transitionInputs.length - 1);
    setPrompts(prev => {
      const next = [...prev];
      while (next.length < numTransitions) {
        next.push('');
      }
      return next.slice(0, numTransitions);
    });
    setTransitionDurations(prev => {
      const next = [...prev];
      while (next.length < numTransitions) {
        next.push(5);
      }
      return next.slice(0, numTransitions);
    });
  }, [transitionInputs, setDynamicParams]);

  return {
    lastSelectedAsset,
    operationInputs,
    operationInputIndex,
    transitionInputs,
    dynamicParams,
    setDynamicParams,
    prompts,
    setPrompts,
    transitionDurations,
    setTransitionDurations,
    removeInput,
    cycleInputs,
    setInputIndex,
  };
}
