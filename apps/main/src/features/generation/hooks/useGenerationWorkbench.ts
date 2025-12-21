import { useMemo, useEffect, useCallback } from 'react';
import { useGenerationScopeStores } from './useGenerationScope';
import { useProviders } from '@features/providers';
import { useProviderSpecs } from '@features/providers';
import type { ParamSpec } from '../components/control/DynamicParamForm';
import type { OperationType } from '@/types/operations';

// Re-export for backwards compatibility
export type { OperationType };

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
  /** Set settings visibility */
  setShowSettings: (show: boolean) => void;
  /** Toggle settings visibility */
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

  const { useSessionStore, useSettingsStore } = useGenerationScopeStores();

  // Core state from stores
  const storeOperationType = useSessionStore((s) => s.operationType);
  const storeProviderId = useSessionStore((s) => s.providerId);
  const presetId = useSessionStore((s) => s.presetId);
  const presetParams = useSessionStore((s) => s.presetParams);
  const generating = useSessionStore((s) => s.generating);
  const setStoreProvider = useSessionStore((s) => s.setProvider);

  // Use override or store values
  const operationType = options.operationType ?? storeOperationType;
  const providerId = options.providerId ?? storeProviderId;

  // Dynamic params and settings visibility from settings store
  const dynamicParams = useSettingsStore((s) => s.params);
  const setDynamicParams = useSettingsStore((s) => s.setDynamicParams);
  const showSettings = useSettingsStore((s) => s.showSettings);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const toggleSettings = useSettingsStore((s) => s.toggleSettings);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);
  const setActiveOperationType = useSettingsStore((s) => s.setActiveOperationType);
  const activeOperationType = useSettingsStore((s) => s.activeOperationType);

  // Sync operation type to settings store for per-operation params
  useEffect(() => {
    if (hasHydrated && operationType !== activeOperationType) {
      setActiveOperationType(operationType);
    }
  }, [hasHydrated, operationType, activeOperationType, setActiveOperationType]);

  const resolvedProviderId = useMemo(() => {
    if (providerId) {
      return providerId;
    }
    const modelValue = dynamicParams?.model;
    if (typeof modelValue === 'string' && isPixverseModel(modelValue)) {
      return 'pixverse';
    }
    // Default to pixverse when no provider is explicitly selected
    // This ensures specs are always available for the UI
    return 'pixverse';
  }, [providerId, dynamicParams?.model]);

  // Provider and specs
  const { providers } = useProviders();
  const { specs } = useProviderSpecs(resolvedProviderId);

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
  // Only auto-show on first load, not on every render (respect user's persisted preference)
  const hasVisibleOptions = paramSpecs.length > 0 || operationType === 'image_to_image';
  useEffect(() => {
    // Wait for hydration before auto-showing to respect persisted preference
    if (!hasHydrated) return;
    // Only auto-show if settings are currently hidden and we have options
    // This respects the user's choice if they previously collapsed settings
    if (autoShowSettings && hasVisibleOptions && !showSettings) {
      // Don't auto-show - let user control visibility after first hydration
      // setShowSettings(true);
    }
  }, [autoShowSettings, hasVisibleOptions, operationType, hasHydrated, showSettings]);

  // Keep primary dynamic params in sync with preset parameters
  useEffect(() => {
    // Wait for hydration before syncing defaults to avoid overwriting persisted values
    if (!hasHydrated) return;
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
  }, [hasHydrated, presetParams, specs, effectiveOperationType, setDynamicParams]);

  // Handler for dynamic param changes
  const handleParamChange = useCallback((name: string, value: any) => {
    setDynamicParams(prev => ({ ...prev, [name]: value }));
  }, [setDynamicParams]);

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

function isPixverseModel(value: string): boolean {
  const normalized = value.toLowerCase();
  const PIXVERSE_VIDEO_MODELS = ['v3.5', 'v4', 'v5', 'v5.5', 'v6'];
  const PIXVERSE_IMAGE_MODELS = ['qwen-image', 'gemini-3.0', 'gemini-2.5-flash', 'seedream-4.0'];
  return (
    PIXVERSE_VIDEO_MODELS.some((prefix) => normalized.startsWith(prefix)) ||
    PIXVERSE_IMAGE_MODELS.includes(normalized)
  );
}
