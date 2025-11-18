/**
 * Centralized validation utilities for node editors
 * Provides consistent validation logic and error reporting
 */

import type {
  Choice,
  ChoiceConfig,
  Condition,
  ConditionConfig,
  MiniGameConfig,
  SeductionConfig,
  VideoConfig,
  ValidationResult,
} from './editorTypes';

/**
 * Validates choice configuration
 */
export function validateChoiceConfig(config: ChoiceConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.choices || config.choices.length === 0) {
    errors.push('At least one choice is required');
  }

  config.choices.forEach((choice, index) => {
    if (!choice.text || choice.text.trim() === '') {
      errors.push(`Choice ${index + 1}: Text is required`);
    }
    if (!choice.id) {
      errors.push(`Choice ${index + 1}: ID is required`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates condition configuration
 */
export function validateConditionConfig(config: ConditionConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.conditions || config.conditions.length === 0) {
    errors.push('At least one condition is required');
  }

  config.conditions.forEach((cond, index) => {
    if (!cond.variable || cond.variable.trim() === '') {
      errors.push(`Condition ${index + 1}: Variable is required`);
    }
    if (!cond.operator) {
      errors.push(`Condition ${index + 1}: Operator is required`);
    }
    if (cond.value === undefined || cond.value === '') {
      errors.push(`Condition ${index + 1}: Value is required`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates mini-game configuration
 */
export function validateMiniGameConfig(config: MiniGameConfig): ValidationResult {
  const errors: string[] = [];

  if (config.rounds < 1 || config.rounds > 100) {
    errors.push('Rounds must be between 1 and 100');
  }

  if (config.timeLimit < 1 || config.timeLimit > 600) {
    errors.push('Time limit must be between 1 and 600 seconds');
  }

  if (config.gameType === 'sceneGizmo' && config.gizmoConfig) {
    if (config.gizmoConfig.zoneCount < 1 || config.gizmoConfig.zoneCount > 20) {
      errors.push('Zone count must be between 1 and 20');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates seduction configuration
 */
export function validateSeductionConfig(config: SeductionConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.stages || config.stages.length === 0) {
    errors.push('At least one stage is required');
  }

  config.stages.forEach((stage, index) => {
    if (stage.requiredAffinity < 0 || stage.requiredAffinity > 100) {
      errors.push(`Stage ${index + 1}: Affinity must be between 0 and 100`);
    }
    if (!stage.name || stage.name.trim() === '') {
      errors.push(`Stage ${index + 1}: Name is required`);
    }
  });

  if (!config.affinityCheckFlag || config.affinityCheckFlag.trim() === '') {
    errors.push('Affinity check flag is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates video configuration
 */
export function validateVideoConfig(config: VideoConfig): ValidationResult {
  const errors: string[] = [];

  if (config.selectionKind === 'pool' && !config.filterTags) {
    errors.push('Filter tags are required for pool selection');
  }

  if (config.advanceMinutes !== undefined && (config.advanceMinutes < 0 || config.advanceMinutes > 1440)) {
    errors.push('Advance minutes must be between 0 and 1440 (24 hours)');
  }

  if (config.npcId !== undefined && config.npcId < 0) {
    errors.push('NPC ID must be a positive number');
  }

  config.progressionSteps.forEach((step, index) => {
    if (!step.label || step.label.trim() === '') {
      errors.push(`Step ${index + 1}: Label is required`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard to check if choices array is valid
 */
export function isValidChoiceArray(value: unknown): value is Choice[] {
  if (!Array.isArray(value)) return false;

  return value.every(
    (choice) =>
      typeof choice === 'object' &&
      choice !== null &&
      'id' in choice &&
      'text' in choice &&
      typeof choice.id === 'string' &&
      typeof choice.text === 'string'
  );
}

/**
 * Type guard to check if conditions array is valid
 */
export function isValidConditionArray(value: unknown): value is Condition[] {
  if (!Array.isArray(value)) return false;

  return value.every(
    (cond) =>
      typeof cond === 'object' &&
      cond !== null &&
      'variable' in cond &&
      'operator' in cond &&
      'value' in cond
  );
}

/**
 * Logs validation errors with context
 */
export function logValidationError(editorName: string, message: string): void {
  console.warn(`[${editorName}] ${message}`);
}
