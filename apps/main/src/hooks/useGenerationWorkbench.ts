import { useState, useMemo, useEffect } from 'react';
import { useControlCenterStore, type ControlCenterState } from '../stores/controlCenterStore';
import { useGenerationSettingsStore } from '../stores/generationSettingsStore';
import { useProviders } from './useProviders';
import { useProviderSpecs } from './useProviderSpecs';
import type { ParamSpec } from '../components/control/DynamicParamForm';

export type OperationType = ControlCenterState['operationType'];

/**
 * Options for configuring the generation workbench hook.
 */
export interface UseGenerationWorkbenchOptions {
  /**
   * The operation type for parameter spec resolution.
   * Defaults to the operation type from Control Center store.
   */
  operationType?: OperationType;

  /**
   * Override provider ID. If not provided, uses the Control Center store value.
   */
  providerId?: string;

  /**
   * Whether to auto-show settings when options are available.
   * Defaults to true.
   */
  autoShowSettings?: boolean;

  /**
   * Names of parameters to filter out from paramSpecs (e.g., 'prompt', 'image_urls').
   * Defaults to ['prompt', 'image_urls', 'prompts'].
   */
  excludeParams?: string[];
}

/**
 * Return type for the useGenerationWorkbench hook.
 */
export interface GenerationWorkbenchState {
  /** Currently selected provider ID */
  providerId: string | undefined;
  /** Set the provider ID */
  setProvider: (id: string | undefined) => void;
  /** List of available providers */
  providers: Array<{ id: string; name: string }>;
  /** Parameter specifications for the current operation */
  paramSpecs: ParamSpec[];
  /** Current dynamic parameter values */
  dynamicParams: Record<string, any>;
  /** Update dynamic parameters */
  setDynamicParams: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  /** Handle a single param change */
  handleParamChange: (name: string, value: any) => void;
  /** Whether the settings bar should be visible */
  showSettings: boolean;
  /** Toggle settings visibility */
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  /** Toggle settings visibility (convenience) */
  toggleSettings: () => void;
  /** Current preset ID */
  presetId: string | undefined;
  /** Whether generation is in progress */
  generating: boolean;
  /** The effective operation type being used */
  effectiveOperationType: OperationType;
}

/**
 * Hook: useGenerationWorkbench
 *
 * Provides shared state and initialization logic for generation settings.
 * This hook consolidates the common patterns used by QuickGenerateModule
 * and IntimacySceneComposer for managing provider selection, parameter specs,
 * and settings bar visibility.
 *
 * @example
 * ```tsx
 * const {
 *   providerId,
 *   setProvider,
 *   providers,
 *   paramSpecs,
 *   dynamicParams,
 *   handleParamChange,
 *   showSettings,
 *   toggleSettings,
 *   generating,
 * } = useGenerationWorkbench({ operationType: 'text_to_video' });
 * ```
 */
export function useGenerationWorkbench(
  options: UseGenerationWorkbenchOptions = {}
): GenerationWorkbenchState {
  const {
    autoShowSettings = true,
    excludeParams = ['prompt', 'image_urls', 'prompts'],
  } = options;

  // Core state from stores
  const storeOperationType = useControlCenterStore(s => s.operationType);
  const storeProviderId = useControlCenterStore(s => s.providerId);
  const presetId = useControlCenterStore(s => s.presetId);
  const presetParams = useControlCenterStore(s => s.presetParams);
  const generating = useControlCenterStore(s => s.generating);
  const setStoreProvider = useControlCenterStore(s => s.setProvider);

  // Use override or store values
  const operationType = options.operationType ?? storeOperationType;
  const providerId = options.providerId ?? storeProviderId;

  // Settings visibility state
  const [showSettings, setShowSettings] = useState(false);

  // Provider and specs
  const { providers } = useProviders();
  const { specs } = useProviderSpecs(providerId);

  // Dynamic params from settings store
  const dynamicParams = useGenerationSettingsStore(s => s.params);
  const setDynamicParams = useGenerationSettingsStore(s => s.setDynamicParams);

  // Handle provider changes - use store or allow override
  const setProvider = (id: string | undefined) => {
    setStoreProvider(id);
  };

  // Prefer native image_to_image specs when the provider exposes them.
  // Fall back to image_to_video only for providers that don't define
  // image_to_image in their operation_specs.
  const hasNativeImageToImageSpec =
    !!specs?.operation_specs && !!specs.operation_specs['image_to_image'];
  const effectiveOperationType: OperationType =
    operationType === 'image_to_image' && !hasNativeImageToImageSpec
      ? 'image_to_video'
      : operationType;

  // Get parameter specs for current operation
  const paramSpecs = useMemo<ParamSpec[]>(() => {
    if (!specs?.operation_specs) return [];
    const opSpec = specs.operation_specs[effectiveOperationType];
    if (!opSpec?.parameters) return [];

    // Filter out excluded parameters
    const excludeSet = new Set(excludeParams);
    return opSpec.parameters.filter((p: any) => !excludeSet.has(p.name));
  }, [specs, effectiveOperationType, excludeParams]);

  // Auto-show settings for operations with visible options
  const hasVisibleOptions = paramSpecs.length > 0 || operationType === 'image_to_image';
  useEffect(() => {
    if (autoShowSettings && hasVisibleOptions) {
      setShowSettings(true);
    }
  }, [autoShowSettings, hasVisibleOptions, operationType]);

  // Keep primary dynamic params in sync with preset parameters
  useEffect(() => {
    if (!specs?.operation_specs) return;
    const opSpec = specs.operation_specs[effectiveOperationType];
    if (!opSpec?.parameters) return;

    setDynamicParams((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const param of opSpec.parameters as ParamSpec[]) {
        const name = param.name;
        const presetOverride = presetParams[name];

        if (presetOverride !== undefined) {
          if (next[name] !== presetOverride) {
            next[name] = presetOverride;
            changed = true;
          }
          continue;
        }

        let currentValue = next[name];

        if (param.type === 'number' && typeof currentValue === 'string') {
          if (currentValue.trim() === '') {
            if (next[name] !== undefined) {
              delete next[name];
              changed = true;
            }
            continue;
          }

          const numeric = Number(currentValue);
          if (!Number.isNaN(numeric) && next[name] !== numeric) {
            next[name] = numeric;
            currentValue = numeric;
            changed = true;
          }
        }

        if (currentValue === undefined) {
          if (param.default !== undefined && param.default !== null && next[name] !== param.default) {
            next[name] = param.default;
            changed = true;
          }
          continue;
        }

        if (Array.isArray(param.enum) && !param.enum.includes(currentValue)) {
          if (param.default !== undefined) {
            if (next[name] !== param.default) {
              next[name] = param.default;
              changed = true;
            }
          } else {
            delete next[name];
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [presetParams, specs, effectiveOperationType, setDynamicParams]);

  // Handler for dynamic param changes
  const handleParamChange = (name: string, value: any) => {
    setDynamicParams(prev => ({ ...prev, [name]: value }));
  };

  const toggleSettings = () => setShowSettings(prev => !prev);

  return {
    providerId,
    setProvider,
    providers,
    paramSpecs,
    dynamicParams,
    setDynamicParams,
    handleParamChange,
    showSettings,
    setShowSettings,
    toggleSettings,
    presetId,
    generating,
    effectiveOperationType,
  };
}
