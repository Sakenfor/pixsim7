/**
 * Interaction Validation
 *
 * Comprehensive validation for interaction definitions with helpful
 * error messages for designers.
 */

import type {
  NpcInteractionDefinition,
  InteractionGating,
  InteractionOutcome,
  InteractionSurface,
} from '@pixsim7/types';

export interface ValidationError {
  /** Field path (e.g., "gating.relationship.minAffinity") */
  field: string;
  /** Error message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Suggested fix */
  suggestion?: string;
}

export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationError[];
  /** Info messages */
  info: ValidationError[];
}

/**
 * Validate an interaction definition
 */
export function validateInteraction(
  definition: NpcInteractionDefinition
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const info: ValidationError[] = [];

  // Required fields
  if (!definition.id || definition.id.trim() === '') {
    errors.push({
      field: 'id',
      message: 'Interaction ID is required',
      severity: 'error',
      suggestion: 'Provide a unique identifier like "greet_sophia" or "quest_start_001"',
    });
  } else if (!/^[a-zA-Z0-9_:-]+$/.test(definition.id)) {
    errors.push({
      field: 'id',
      message: 'Interaction ID contains invalid characters',
      severity: 'error',
      suggestion: 'Use only letters, numbers, underscores, hyphens, and colons',
    });
  }

  if (!definition.label || definition.label.trim() === '') {
    errors.push({
      field: 'label',
      message: 'Interaction label is required',
      severity: 'error',
      suggestion: 'Provide a user-friendly label like "Greet Sophia" or "Accept Quest"',
    });
  } else if (definition.label.length > 50) {
    warnings.push({
      field: 'label',
      message: 'Label is very long and may be truncated in UI',
      severity: 'warning',
      suggestion: `Consider shortening to under 50 characters (current: ${definition.label.length})`,
    });
  }

  if (!definition.surface) {
    errors.push({
      field: 'surface',
      message: 'Interaction surface is required',
      severity: 'error',
      suggestion: 'Specify how this interaction should be displayed: "inline", "dialogue", "scene", "notification", or "menu"',
    });
  }

  // Validate gating
  if (definition.gating) {
    const gatingErrors = validateGating(definition.gating, definition.id);
    errors.push(...gatingErrors.filter((e) => e.severity === 'error'));
    warnings.push(...gatingErrors.filter((e) => e.severity === 'warning'));
    info.push(...gatingErrors.filter((e) => e.severity === 'info'));
  }

  // Validate outcome
  if (definition.outcome) {
    const outcomeErrors = validateOutcome(definition.outcome, definition.id, definition.surface);
    errors.push(...outcomeErrors.filter((e) => e.severity === 'error'));
    warnings.push(...outcomeErrors.filter((e) => e.severity === 'warning'));
    info.push(...outcomeErrors.filter((e) => e.severity === 'info'));
  } else {
    warnings.push({
      field: 'outcome',
      message: 'Interaction has no outcome defined',
      severity: 'warning',
      suggestion: 'Consider adding relationship changes, flag updates, or other effects',
    });
  }

  // NPC can initiate without appropriate surface
  if (definition.npcCanInitiate && definition.surface === 'menu') {
    warnings.push({
      field: 'npcCanInitiate',
      message: 'NPCs cannot initiate menu-surface interactions',
      severity: 'warning',
      suggestion: 'Use "inline", "dialogue", or "notification" for NPC-initiated interactions',
    });
  }

  // Priority validation
  if (definition.priority !== undefined) {
    if (definition.priority < 0 || definition.priority > 100) {
      warnings.push({
        field: 'priority',
        message: 'Priority should be between 0 and 100',
        severity: 'warning',
        suggestion: `Current priority: ${definition.priority}. Lower priorities may not be visible.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

/**
 * Validate interaction gating rules
 */
function validateGating(gating: InteractionGating, interactionId: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Relationship gating
  if (gating.relationship) {
    const rel = gating.relationship;

    // Check for conflicting requirements
    if (rel.minTier && rel.maxTier) {
      errors.push({
        field: 'gating.relationship',
        message: 'Both minTier and maxTier are specified',
        severity: 'warning',
        suggestion: 'This will only show for a narrow tier range. Is this intentional?',
      });
    }

    // Validate metric ranges
    if (rel.minAffinity !== undefined && (rel.minAffinity < 0 || rel.minAffinity > 100)) {
      errors.push({
        field: 'gating.relationship.minAffinity',
        message: 'Affinity must be between 0 and 100',
        severity: 'error',
        suggestion: `Current value: ${rel.minAffinity}`,
      });
    }

    if (rel.minTrust !== undefined && (rel.minTrust < 0 || rel.minTrust > 100)) {
      errors.push({
        field: 'gating.relationship.minTrust',
        message: 'Trust must be between 0 and 100',
        severity: 'error',
        suggestion: `Current value: ${rel.minTrust}`,
      });
    }

    if (rel.minChemistry !== undefined && (rel.minChemistry < 0 || rel.minChemistry > 100)) {
      errors.push({
        field: 'gating.relationship.minChemistry',
        message: 'Chemistry must be between 0 and 100',
        severity: 'error',
        suggestion: `Current value: ${rel.minChemistry}`,
      });
    }

    if (rel.maxTension !== undefined && (rel.maxTension < 0 || rel.maxTension > 100)) {
      errors.push({
        field: 'gating.relationship.maxTension',
        message: 'Tension must be between 0 and 100',
        severity: 'error',
        suggestion: `Current value: ${rel.maxTension}`,
      });
    }

    // Very high requirements warning
    if (rel.minAffinity && rel.minAffinity > 80) {
      errors.push({
        field: 'gating.relationship.minAffinity',
        message: 'Very high affinity requirement',
        severity: 'info',
        suggestion: 'This interaction will only be available late in the relationship',
      });
    }
  }

  // Time of day gating
  if (gating.timeOfDay) {
    const tod = gating.timeOfDay;

    if (tod.minHour !== undefined && (tod.minHour < 0 || tod.minHour > 23)) {
      errors.push({
        field: 'gating.timeOfDay.minHour',
        message: 'Hour must be between 0 and 23',
        severity: 'error',
        suggestion: `Current value: ${tod.minHour}`,
      });
    }

    if (tod.maxHour !== undefined && (tod.maxHour < 0 || tod.maxHour > 23)) {
      errors.push({
        field: 'gating.timeOfDay.maxHour',
        message: 'Hour must be between 0 and 23',
        severity: 'error',
        suggestion: `Current value: ${tod.maxHour}`,
      });
    }

    if (tod.minHour !== undefined && tod.maxHour !== undefined && tod.minHour > tod.maxHour) {
      errors.push({
        field: 'gating.timeOfDay',
        message: 'minHour is greater than maxHour',
        severity: 'error',
        suggestion: 'For overnight windows, use two separate time ranges or periods instead',
      });
    }
  }

  // Cooldown
  if (gating.cooldownSeconds !== undefined) {
    if (gating.cooldownSeconds < 0) {
      errors.push({
        field: 'gating.cooldownSeconds',
        message: 'Cooldown cannot be negative',
        severity: 'error',
        suggestion: 'Remove cooldown or set to a positive value',
      });
    }

    if (gating.cooldownSeconds > 86400 * 7) {
      // More than 1 week
      errors.push({
        field: 'gating.cooldownSeconds',
        message: 'Cooldown is very long (over 1 week)',
        severity: 'warning',
        suggestion: `Current: ${Math.floor(gating.cooldownSeconds / 86400)} days. Is this intentional?`,
      });
    }
  }

  // Flag validation
  if (gating.requiredFlags && gating.forbiddenFlags) {
    const overlap = gating.requiredFlags.filter((f) =>
      gating.forbiddenFlags!.includes(f)
    );
    if (overlap.length > 0) {
      errors.push({
        field: 'gating',
        message: 'Same flag is both required and forbidden',
        severity: 'error',
        suggestion: `Conflicting flags: ${overlap.join(', ')}`,
      });
    }
  }

  return errors;
}

/**
 * Validate interaction outcome
 */
function validateOutcome(
  outcome: InteractionOutcome,
  interactionId: string,
  surface: InteractionSurface
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Relationship deltas
  if (outcome.relationshipDeltas) {
    const deltas = outcome.relationshipDeltas;

    // Check for very large changes
    if (deltas.affinity && Math.abs(deltas.affinity) > 20) {
      errors.push({
        field: 'outcome.relationshipDeltas.affinity',
        message: 'Very large affinity change',
        severity: 'warning',
        suggestion: `Change of ${deltas.affinity} may progress relationship too quickly`,
      });
    }

    if (deltas.trust && Math.abs(deltas.trust) > 20) {
      errors.push({
        field: 'outcome.relationshipDeltas.trust',
        message: 'Very large trust change',
        severity: 'warning',
        suggestion: `Change of ${deltas.trust} may progress relationship too quickly`,
      });
    }

    if (deltas.chemistry && Math.abs(deltas.chemistry) > 20) {
      errors.push({
        field: 'outcome.relationshipDeltas.chemistry',
        message: 'Very large chemistry change',
        severity: 'warning',
        suggestion: `Change of ${deltas.chemistry} may progress relationship too quickly`,
      });
    }

    // Check for conflicting changes
    if (deltas.affinity && deltas.affinity < 0 && deltas.chemistry && deltas.chemistry > 0) {
      errors.push({
        field: 'outcome.relationshipDeltas',
        message: 'Affinity decreases but chemistry increases',
        severity: 'info',
        suggestion: 'This is unusual but valid for complex relationships',
      });
    }
  }

  // Scene launch validation
  if (outcome.sceneLaunch) {
    if (surface !== 'scene' && surface !== 'dialogue') {
      errors.push({
        field: 'outcome.sceneLaunch',
        message: 'Scene launch from non-scene surface',
        severity: 'warning',
        suggestion: 'Consider using "scene" surface for interactions that launch scenes',
      });
    }

    if (!outcome.sceneLaunch.sceneId && !outcome.sceneLaunch.sceneIntentId) {
      errors.push({
        field: 'outcome.sceneLaunch',
        message: 'Scene launch requires sceneId or sceneIntentId',
        severity: 'error',
        suggestion: 'Specify which scene to launch',
      });
    }
  }

  // Generation launch validation
  if (outcome.generationLaunch) {
    if (!outcome.generationLaunch.dialogueRequest && !outcome.generationLaunch.actionBlockIds) {
      errors.push({
        field: 'outcome.generationLaunch',
        message: 'Generation launch requires dialogueRequest or actionBlockIds',
        severity: 'error',
        suggestion: 'Specify what to generate',
      });
    }

    if (outcome.generationLaunch.dialogueRequest && surface !== 'dialogue') {
      errors.push({
        field: 'outcome.generationLaunch',
        message: 'Dialogue generation from non-dialogue surface',
        severity: 'info',
        suggestion: 'Consider using "dialogue" surface for dialogue interactions',
      });
    }
  }

  // Inventory changes validation
  if (outcome.inventoryChanges) {
    if (outcome.inventoryChanges.add) {
      for (const item of outcome.inventoryChanges.add) {
        if (!item.itemId) {
          errors.push({
            field: 'outcome.inventoryChanges.add',
            message: 'Item to add is missing itemId',
            severity: 'error',
            suggestion: 'Each inventory change must specify itemId',
          });
        }
      }
    }

    if (outcome.inventoryChanges.remove) {
      for (const item of outcome.inventoryChanges.remove) {
        if (!item.itemId) {
          errors.push({
            field: 'outcome.inventoryChanges.remove',
            message: 'Item to remove is missing itemId',
            severity: 'error',
            suggestion: 'Each inventory change must specify itemId',
          });
        }
      }
    }
  }

  // Success message
  if (!outcome.successMessage) {
    errors.push({
      field: 'outcome.successMessage',
      message: 'No success message defined',
      severity: 'info',
      suggestion: 'Consider adding feedback for the player',
    });
  }

  return errors;
}

/**
 * Format validation result as human-readable string
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✅ Validation passed');
  } else {
    lines.push('❌ Validation failed');
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const error of result.errors) {
      lines.push(`  • ${error.field}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`    → ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const warning of result.warnings) {
      lines.push(`  • ${warning.field}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`    → ${warning.suggestion}`);
      }
    }
  }

  if (result.info.length > 0) {
    lines.push('\nInfo:');
    for (const info of result.info) {
      lines.push(`  • ${info.field}: ${info.message}`);
      if (info.suggestion) {
        lines.push(`    → ${info.suggestion}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Validate multiple interactions and report duplicates
 */
export function validateInteractionSet(
  definitions: NpcInteractionDefinition[]
): {
  results: Map<string, ValidationResult>;
  duplicateIds: string[];
  totalErrors: number;
  totalWarnings: number;
} {
  const results = new Map<string, ValidationResult>();
  const idCounts = new Map<string, number>();
  const duplicateIds: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  // Check for duplicate IDs
  for (const def of definitions) {
    const count = idCounts.get(def.id) || 0;
    idCounts.set(def.id, count + 1);
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      duplicateIds.push(id);
    }
  }

  // Validate each interaction
  for (const def of definitions) {
    const result = validateInteraction(def);
    results.set(def.id, result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  return {
    results,
    duplicateIds,
    totalErrors,
    totalWarnings,
  };
}
