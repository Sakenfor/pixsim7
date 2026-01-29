/**
 * Hook for managing generation presets within a quickgen scope.
 *
 * Provides methods to save the current scope state as a preset,
 * and to load a preset into the current scope.
 */

import { useCallback, useMemo, useState } from 'react';

import { getAsset, fromAssetResponse } from '@features/assets';

import type { GenerationPreset, PresetInputRef, PresetSnapshot } from '../stores/generationPresetStore';
import { useGenerationPresetStore } from '../stores/generationPresetStore';

import { useGenerationScopeStores } from './useGenerationScope';

export interface UseGenerationPresetsResult {
  /** All presets for the current operation type */
  presetsForOperation: GenerationPreset[];

  /** All presets */
  allPresets: GenerationPreset[];

  /** Last used preset for current operation */
  lastUsedPreset: GenerationPreset | undefined;

  /** Whether a preset is currently being loaded */
  loading: boolean;

  /** Save current scope state as a new preset */
  saveCurrentAsPreset: (name: string, description?: string) => GenerationPreset;

  /** Load a preset into the current scope (with sync asset resolver) */
  loadPreset: (presetId: string, resolveAsset: (assetId: number) => AssetModel | null) => boolean;

  /** Load a preset into the current scope (fetches assets from API) */
  loadPresetAsync: (presetId: string) => Promise<boolean>;

  /** Update an existing preset with current scope state */
  updatePresetFromCurrent: (presetId: string) => void;

  /** Delete a preset */
  deletePreset: (presetId: string) => void;

  /** Rename a preset */
  renamePreset: (presetId: string, newName: string) => void;

  /** Duplicate a preset */
  duplicatePreset: (presetId: string, newName: string) => GenerationPreset | undefined;

  /** Get current scope state as a snapshot (for preview) */
  getCurrentSnapshot: () => PresetSnapshot;
}

/**
 * Hook for managing generation presets within the current quickgen scope.
 */
export function useGenerationPresets(): UseGenerationPresetsResult {
  const { useSessionStore, useSettingsStore, useInputStore } = useGenerationScopeStores();
  const [loading, setLoading] = useState(false);

  // Current scope state
  const operationType = useSessionStore((s) => s.operationType);
  const prompt = useSessionStore((s) => s.prompt);
  const setPrompt = useSessionStore((s) => s.setPrompt);
  const setOperationType = useSessionStore((s) => s.setOperationType);

  const params = useSettingsStore((s) => s.params);
  const setDynamicParams = useSettingsStore((s) => s.setDynamicParams);
  const setActiveOperationType = useSettingsStore((s) => s.setActiveOperationType);

  const inputsByOperation = useInputStore((s) => s.inputsByOperation);
  const addInput = useInputStore((s) => s.addInput);
  const clearInputs = useInputStore((s) => s.clearInputs);
  const updateLockedTimestamp = useInputStore((s) => s.updateLockedTimestamp);

  // Preset store
  const presets = useGenerationPresetStore((s) => s.presets);
  const lastUsedByOperation = useGenerationPresetStore((s) => s.lastUsedByOperation);
  const savePreset = useGenerationPresetStore((s) => s.savePreset);
  const updatePreset = useGenerationPresetStore((s) => s.updatePreset);
  const deletePresetAction = useGenerationPresetStore((s) => s.deletePreset);
  const renamePresetAction = useGenerationPresetStore((s) => s.renamePreset);
  const duplicatePresetAction = useGenerationPresetStore((s) => s.duplicatePreset);
  const setLastUsed = useGenerationPresetStore((s) => s.setLastUsed);
  const getPreset = useGenerationPresetStore((s) => s.getPreset);

  // Derived values
  const presetsForOperation = useMemo(
    () => presets.filter((p) => p.operationType === operationType),
    [presets, operationType]
  );

  const lastUsedPreset = useMemo(() => {
    const lastUsedId = lastUsedByOperation[operationType];
    if (!lastUsedId) return undefined;
    return presets.find((p) => p.id === lastUsedId);
  }, [presets, lastUsedByOperation, operationType]);

  // Get current inputs as preset refs
  const getCurrentInputRefs = useCallback((): PresetInputRef[] => {
    const opInputs = inputsByOperation[operationType];
    if (!opInputs) return [];

    return opInputs.items.map((item) => ({
      assetId: item.asset.id,
      lockedTimestamp: item.lockedTimestamp,
    }));
  }, [inputsByOperation, operationType]);

  // Get current state as snapshot
  const getCurrentSnapshot = useCallback((): PresetSnapshot => {
    return {
      operationType,
      prompt,
      inputs: getCurrentInputRefs(),
      params,
    };
  }, [operationType, prompt, params, getCurrentInputRefs]);

  // Save current state as preset
  const saveCurrentAsPreset = useCallback(
    (name: string, description?: string): GenerationPreset => {
      const snapshot = getCurrentSnapshot();
      return savePreset(name, snapshot, description);
    },
    [getCurrentSnapshot, savePreset]
  );

  // Load a preset into current scope
  const loadPreset = useCallback(
    (presetId: string, resolveAsset: (assetId: number) => AssetModel | null): boolean => {
      const preset = getPreset(presetId);
      if (!preset) return false;

      // Set operation type first
      setOperationType(preset.operationType);
      setActiveOperationType(preset.operationType);

      // Set prompt
      setPrompt(preset.prompt);

      // Set params
      setDynamicParams(preset.params);

      // Clear existing inputs and add preset inputs
      clearInputs(preset.operationType);

      for (const inputRef of preset.inputs) {
        const asset = resolveAsset(inputRef.assetId);
        if (asset) {
          addInput({ asset, operationType: preset.operationType });

          // If there's a locked timestamp, we need to update it after adding
          // Note: This requires the input to be added first
          if (inputRef.lockedTimestamp !== undefined) {
            const opInputs = useInputStore.getState().inputsByOperation[preset.operationType];
            const addedItem = opInputs?.items.find((item) => item.asset.id === inputRef.assetId);
            if (addedItem) {
              updateLockedTimestamp(preset.operationType, addedItem.id, inputRef.lockedTimestamp);
            }
          }
        }
      }

      // Mark as last used
      setLastUsed(preset.operationType, presetId);

      return true;
    },
    [
      getPreset,
      setOperationType,
      setActiveOperationType,
      setPrompt,
      setDynamicParams,
      clearInputs,
      addInput,
      updateLockedTimestamp,
      setLastUsed,
      useInputStore,
    ]
  );

  // Load a preset with async asset fetching
  const loadPresetAsync = useCallback(
    async (presetId: string): Promise<boolean> => {
      const preset = getPreset(presetId);
      if (!preset) return false;

      setLoading(true);
      try {
        // Set operation type first
        setOperationType(preset.operationType);
        setActiveOperationType(preset.operationType);

        // Set prompt
        setPrompt(preset.prompt);

        // Set params
        setDynamicParams(preset.params);

        // Clear existing inputs
        clearInputs(preset.operationType);

        // Fetch and add assets
        for (const inputRef of preset.inputs) {
          try {
            const assetResponse = await getAsset(inputRef.assetId);
            const asset = fromAssetResponse(assetResponse);

            addInput({ asset, operationType: preset.operationType });

            // If there's a locked timestamp, update it after adding
            if (inputRef.lockedTimestamp !== undefined) {
              // Small delay to ensure the input is added before we try to update it
              await new Promise((resolve) => setTimeout(resolve, 10));
              const opInputs = useInputStore.getState().inputsByOperation[preset.operationType];
              const addedItem = opInputs?.items.find((item) => item.asset.id === inputRef.assetId);
              if (addedItem) {
                updateLockedTimestamp(preset.operationType, addedItem.id, inputRef.lockedTimestamp);
              }
            }
          } catch (err) {
            console.warn(`[loadPresetAsync] Failed to load asset ${inputRef.assetId}:`, err);
            // Continue loading other assets even if one fails
          }
        }

        // Mark as last used
        setLastUsed(preset.operationType, presetId);

        return true;
      } finally {
        setLoading(false);
      }
    },
    [
      getPreset,
      setOperationType,
      setActiveOperationType,
      setPrompt,
      setDynamicParams,
      clearInputs,
      addInput,
      updateLockedTimestamp,
      setLastUsed,
      useInputStore,
    ]
  );

  // Update preset with current state
  const updatePresetFromCurrent = useCallback(
    (presetId: string) => {
      const snapshot = getCurrentSnapshot();
      updatePreset(presetId, snapshot);
    },
    [getCurrentSnapshot, updatePreset]
  );

  return {
    presetsForOperation,
    allPresets: presets,
    lastUsedPreset,
    loading,
    saveCurrentAsPreset,
    loadPreset,
    loadPresetAsync,
    updatePresetFromCurrent,
    deletePreset: deletePresetAction,
    renamePreset: renamePresetAction,
    duplicatePreset: duplicatePresetAction,
    getCurrentSnapshot,
  };
}
