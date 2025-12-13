/**
 * useGenerationNodeForm Hook
 *
 * Manages form state for GenerationNodeEditor.
 * Consolidates 20+ useState calls into a single hook with:
 * - Centralized state management
 * - Load from node metadata
 * - Build config for saving
 * - Validation integration
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DraftSceneNode } from '@/modules/scene-builder';
import type {
  GenerationNodeConfig,
  GenerationStrategy,
  StyleRules,
  DurationRule,
  ConstraintSet,
  FallbackConfig,
  GenerationValidationResult,
} from '@lib/registries';
import {
  validateGenerationNode,
  getValidationStatus,
  type ValidationStatus,
} from '@pixsim7/game.engine';

/** Form field values */
export interface GenerationNodeFormValues {
  // Basic
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment';
  purpose: 'gap_fill' | 'variation' | 'adaptive' | 'ambient';
  strategy: GenerationStrategy;
  seedSource: 'playthrough' | 'player' | 'timestamp' | 'fixed' | '';
  enabled: boolean;
  templateId: string;

  // Style
  moodFrom: string;
  moodTo: string;
  pacing: 'slow' | 'medium' | 'fast';
  transitionType: 'gradual' | 'abrupt';

  // Duration
  durationMin: string;
  durationMax: string;
  durationTarget: string;

  // Constraints
  rating: 'G' | 'PG' | 'PG-13' | 'R' | '';
  requiredElements: string;
  avoidElements: string;
  contentRules: string;

  // Fallback
  fallbackMode: 'default_content' | 'skip' | 'retry' | 'placeholder';
  defaultContentId: string;
  maxRetries: string;
  timeoutMs: string;
}

/** Default form values */
const DEFAULT_VALUES: GenerationNodeFormValues = {
  generationType: 'transition',
  purpose: 'gap_fill',
  strategy: 'once',
  seedSource: '',
  enabled: true,
  templateId: '',
  moodFrom: '',
  moodTo: '',
  pacing: 'medium',
  transitionType: 'gradual',
  durationMin: '',
  durationMax: '',
  durationTarget: '',
  rating: '',
  requiredElements: '',
  avoidElements: '',
  contentRules: '',
  fallbackMode: 'placeholder',
  defaultContentId: '',
  maxRetries: '3',
  timeoutMs: '30000',
};

interface UseGenerationNodeFormOptions {
  node: DraftSceneNode;
}

interface UseGenerationNodeFormReturn {
  /** Current form values */
  values: GenerationNodeFormValues;
  /** Set a single field value */
  setField: <K extends keyof GenerationNodeFormValues>(
    field: K,
    value: GenerationNodeFormValues[K]
  ) => void;
  /** Set multiple field values at once */
  setFields: (updates: Partial<GenerationNodeFormValues>) => void;
  /** Reset form to defaults */
  reset: () => void;
  /** Build GenerationNodeConfig from current values */
  buildConfig: () => GenerationNodeConfig;
  /** Validation result */
  validation: GenerationValidationResult;
  /** Validation status */
  validationStatus: ValidationStatus;
  /** Whether form has validation errors */
  hasErrors: boolean;
}

export function useGenerationNodeForm({
  node,
}: UseGenerationNodeFormOptions): UseGenerationNodeFormReturn {
  const [values, setValues] = useState<GenerationNodeFormValues>(DEFAULT_VALUES);

  // Load from node metadata on mount/change
  useEffect(() => {
    const config = (node.metadata as any)?.config as GenerationNodeConfig | undefined;
    if (!config) return;

    setValues({
      generationType: config.generationType,
      purpose: config.purpose,
      strategy: config.strategy,
      seedSource: config.seedSource || '',
      enabled: config.enabled,
      templateId: config.templateId || '',

      // Style
      moodFrom: config.style?.moodFrom || '',
      moodTo: config.style?.moodTo || '',
      pacing: config.style?.pacing || 'medium',
      transitionType: config.style?.transitionType || 'gradual',

      // Duration
      durationMin: config.duration?.min?.toString() || '',
      durationMax: config.duration?.max?.toString() || '',
      durationTarget: config.duration?.target?.toString() || '',

      // Constraints
      rating: config.constraints?.rating || '',
      requiredElements: config.constraints?.requiredElements?.join(', ') || '',
      avoidElements: config.constraints?.avoidElements?.join(', ') || '',
      contentRules: config.constraints?.contentRules?.join('\n') || '',

      // Fallback
      fallbackMode: config.fallback?.mode || 'placeholder',
      defaultContentId: config.fallback?.defaultContentId || '',
      maxRetries: config.fallback?.maxRetries?.toString() || '3',
      timeoutMs: config.fallback?.timeoutMs?.toString() || '30000',
    });
  }, [node]);

  // Set a single field
  const setField = useCallback(
    <K extends keyof GenerationNodeFormValues>(
      field: K,
      value: GenerationNodeFormValues[K]
    ) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Set multiple fields
  const setFields = useCallback((updates: Partial<GenerationNodeFormValues>) => {
    setValues((prev) => ({ ...prev, ...updates }));
  }, []);

  // Reset to defaults
  const reset = useCallback(() => {
    setValues(DEFAULT_VALUES);
  }, []);

  // Build config from current values
  const buildConfig = useCallback((): GenerationNodeConfig => {
    const style: StyleRules = {
      moodFrom: values.moodFrom || undefined,
      moodTo: values.moodTo || undefined,
      pacing: values.pacing,
      transitionType: values.transitionType,
    };

    const duration: DurationRule = {
      min: values.durationMin ? parseFloat(values.durationMin) : undefined,
      max: values.durationMax ? parseFloat(values.durationMax) : undefined,
      target: values.durationTarget ? parseFloat(values.durationTarget) : undefined,
    };

    const constraints: ConstraintSet = {
      rating: values.rating || undefined,
      requiredElements: values.requiredElements
        ? values.requiredElements.split(',').map((e) => e.trim()).filter(Boolean)
        : undefined,
      avoidElements: values.avoidElements
        ? values.avoidElements.split(',').map((e) => e.trim()).filter(Boolean)
        : undefined,
      contentRules: values.contentRules
        ? values.contentRules.split('\n').map((r) => r.trim()).filter(Boolean)
        : undefined,
    };

    const fallback: FallbackConfig = {
      mode: values.fallbackMode,
      defaultContentId: values.defaultContentId || undefined,
      maxRetries: values.maxRetries ? parseInt(values.maxRetries) : undefined,
      timeoutMs: values.timeoutMs ? parseInt(values.timeoutMs) : undefined,
    };

    return {
      generationType: values.generationType,
      purpose: values.purpose,
      style,
      duration,
      constraints,
      strategy: values.strategy,
      seedSource: values.seedSource || undefined,
      fallback,
      templateId: values.templateId || undefined,
      enabled: values.enabled,
      version: 1,
    };
  }, [values]);

  // Run validation
  const validation = useMemo((): GenerationValidationResult => {
    const config = buildConfig();
    return validateGenerationNode(config, {
      world: undefined,
      userPrefs: undefined,
    });
  }, [buildConfig]);

  const validationStatus = useMemo(
    () => getValidationStatus(validation),
    [validation]
  );

  const hasErrors = validation.errors.length > 0;

  return {
    values,
    setField,
    setFields,
    reset,
    buildConfig,
    validation,
    validationStatus,
    hasErrors,
  };
}
