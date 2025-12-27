import { useMemo, useEffect, useCallback, useRef } from 'react';
import { useGenerationScopeStores } from './useGenerationScope';
import { useProviders } from '@features/providers';
import { useProviderSpecs } from '@features/providers';
import { useProviderIdForModel } from '@features/providers';
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
   * Defaults to common prompt/asset inputs (prompt(s), negative_prompt, image/video URLs,
   * source_asset_id(s), composition_assets).
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
  /** Handle a single param change with type coercion */
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

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Coerce a value to match the expected param type.
 * Called on input change to normalize values immediately.
 */
function coerceParamValue(value: any, spec: ParamSpec | undefined): any {
  if (spec?.type === 'number' && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? value : numeric;
  }
  return value;
}

/**
 * Apply preset overrides to params.
 * Returns new params object if changes were made, otherwise returns input.
 */
function applyPresetOverrides(
  params: Record<string, any>,
  presetParams: Record<string, any>,
  specParams: ParamSpec[]
): Record<string, any> {
  let changed = false;
  const next = { ...params };

  for (const spec of specParams) {
    const presetValue = presetParams[spec.name];
    if (presetValue !== undefined && next[spec.name] !== presetValue) {
      next[spec.name] = presetValue;
      changed = true;
    }
  }

  return changed ? next : params;
}

/**
 * Validate params against specs and apply defaults.
 * - Removes invalid enum values
 * - Applies defaults for undefined values
 * Returns new params object if changes were made, otherwise returns input.
 */
function validateAndApplyDefaults(
  params: Record<string, any>,
  specParams: ParamSpec[],
  presetParams: Record<string, any>
): Record<string, any> {
  let changed = false;
  const next = { ...params };

  for (const spec of specParams) {
    const { name } = spec;

    // Skip if preset controls this value
    if (presetParams[name] !== undefined) continue;

    const currentValue = next[name];

    // Apply default if undefined
    if (currentValue === undefined) {
      if (spec.default !== undefined && spec.default !== null) {
        next[name] = spec.default;
        changed = true;
      }
      continue;
    }

    // Validate enum values
    if (Array.isArray(spec.enum) && !spec.enum.includes(currentValue)) {
      if (spec.default !== undefined) {
        next[name] = spec.default;
      } else {
        delete next[name];
      }
      changed = true;
    }
  }

  return changed ? next : params;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook: useGenerationWorkbench
 *
 * Provides shared state and initialization logic for generation settings.
 * This hook consolidates the common patterns used by QuickGenerateModule
 * and IntimacySceneComposer for managing provider selection, parameter specs,
 * and settings bar visibility.
 *
 * Responsibilities:
 * - Provider/specs resolution (UI layer)
 * - Settings visibility management
 * - Preset application
 * - Param validation against specs
 *
 * NOTE: This hook does NOT handle generation validation or API calls.
 * That's handled by quickGenerateLogic and useQuickGenerateController.
 */
export function useGenerationWorkbench(
  options: UseGenerationWorkbenchOptions = {}
): GenerationWorkbenchState {
  const {
    autoShowSettings = true,
    excludeParams = [
      'prompt',
      'prompts',
      'negative_prompt',
      'image_url',
      'image_urls',
      'video_url',
      'original_video_id',
      'source_asset_id',
      'source_asset_ids',
      'composition_assets',
    ],
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

  const inferredProviderId = useProviderIdForModel(dynamicParams?.model as string | undefined);
  const resolvedProviderId = useMemo(() => {
    if (providerId) return providerId;
    if (inferredProviderId) return inferredProviderId;
    return 'pixverse';
  }, [providerId, inferredProviderId]);

  // Provider and specs
  const { providers } = useProviders();
  const { specs } = useProviderSpecs(resolvedProviderId);

  const setProvider = (id: string | undefined) => {
    setStoreProvider(id);
  };

  // Prefer native image_to_image specs when the provider exposes them
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

    const excludeSet = new Set(excludeParams);
    return opSpec.parameters.filter((p: any) => !excludeSet.has(p.name));
  }, [specs, effectiveOperationType, excludeParams]);

  // Create a map for quick spec lookup in handleParamChange
  const paramSpecMap = useMemo(() => {
    const map = new Map<string, ParamSpec>();
    for (const spec of paramSpecs) {
      map.set(spec.name, spec);
    }
    return map;
  }, [paramSpecs]);

  // Track previous preset to detect changes
  const prevPresetParamsRef = useRef(presetParams);

  // Effect 1: Apply preset overrides when presetParams change
  useEffect(() => {
    if (!hasHydrated) return;

    const prevPreset = prevPresetParamsRef.current;
    prevPresetParamsRef.current = presetParams;

    // Only run if presetParams actually changed
    if (prevPreset === presetParams) return;

    if (!specs?.operation_specs) return;
    const opSpec = specs.operation_specs[effectiveOperationType];
    if (!opSpec?.parameters) return;

    setDynamicParams((prev) => applyPresetOverrides(prev, presetParams, opSpec.parameters));
  }, [hasHydrated, presetParams, specs, effectiveOperationType, setDynamicParams]);

  // Effect 2: Validate params and apply defaults when specs change
  useEffect(() => {
    if (!hasHydrated) return;
    if (!specs?.operation_specs) return;
    const opSpec = specs.operation_specs[effectiveOperationType];
    if (!opSpec?.parameters) return;

    setDynamicParams((prev) =>
      validateAndApplyDefaults(prev, opSpec.parameters, presetParams)
    );
  }, [hasHydrated, specs, effectiveOperationType, setDynamicParams, presetParams]);

  // Handler for dynamic param changes - coerces types on input
  const handleParamChange = useCallback(
    (name: string, value: any) => {
      const spec = paramSpecMap.get(name);
      const coercedValue = coerceParamValue(value, spec);
      setDynamicParams((prev) => ({ ...prev, [name]: coercedValue }));
    },
    [paramSpecMap, setDynamicParams]
  );

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
