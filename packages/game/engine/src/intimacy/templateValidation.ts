/**
 * Template Validation
 *
 * Validate scene and arc templates for common issues before import/export.
 * Pure logic — no browser, React, or API dependencies.
 */

import type {
  IntimacySceneConfig,
  RelationshipProgressionArc,
  RelationshipGate,
} from '@pixsim7/shared.types';

import { TIER_HIERARCHY } from './gateChecking';

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Scene template metadata (kept generic — no React or DOM deps)
 */
export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  category: 'flirt' | 'date' | 'kiss' | 'intimate' | 'custom';
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  author?: string;
  scene: IntimacySceneConfig;
}

/**
 * Arc template metadata
 */
export interface ArcTemplate {
  id: string;
  name: string;
  description: string;
  category: 'romance' | 'friendship' | 'rivalry' | 'custom';
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: 'short' | 'medium' | 'long';
  author?: string;
  arc: RelationshipProgressionArc;
}

/**
 * Validate a scene template
 */
export function validateSceneTemplate(template: SceneTemplate): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!template.id) {
    errors.push('Template must have an ID');
  }
  if (!template.name) {
    errors.push('Template must have a name');
  }
  if (!template.scene) {
    errors.push('Template must have a scene configuration');
    return { valid: false, errors, warnings };
  }

  // Validate scene
  const scene = template.scene;

  if (!scene.sceneType) {
    errors.push('Scene must have a type');
  }

  if (!scene.intensity) {
    errors.push('Scene must have an intensity level');
  }

  if (!scene.contentRating) {
    errors.push('Scene must have a content rating');
  }

  // Check gates
  if (scene.gates.length === 0) {
    warnings.push('Scene has no gates - it will always be accessible');
  }

  for (const [idx, gate] of scene.gates.entries()) {
    const gateResult = validateGateInternal(gate);
    if (!gateResult.valid) {
      errors.push(`Gate ${idx + 1} (${gate.name}): ${gateResult.errors.join(', ')}`);
    }
    warnings.push(...gateResult.warnings.map((w) => `Gate ${idx + 1} (${gate.name}): ${w}`));
  }

  // Check for circular references or impossible conditions
  const hasConflictingGates = checkGateConflicts(scene.gates);
  if (hasConflictingGates.length > 0) {
    warnings.push(...hasConflictingGates);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an arc template
 */
export function validateArcTemplate(template: ArcTemplate): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!template.id) {
    errors.push('Template must have an ID');
  }
  if (!template.name) {
    errors.push('Template must have a name');
  }
  if (!template.arc) {
    errors.push('Template must have an arc configuration');
    return { valid: false, errors, warnings };
  }

  const arc = template.arc;

  if (arc.stages.length === 0) {
    errors.push('Arc must have at least one stage');
  }

  if (!arc.maxContentRating) {
    errors.push('Arc must have a max content rating');
  }

  // Validate stages
  for (const [idx, stage] of arc.stages.entries()) {
    if (!stage.id) {
      errors.push(`Stage ${idx + 1}: Missing ID`);
    }
    if (!stage.name) {
      errors.push(`Stage ${idx + 1}: Missing name`);
    }
    if (!stage.tier) {
      errors.push(`Stage ${idx + 1}: Missing tier`);
    }
    if (!stage.gate) {
      errors.push(`Stage ${idx + 1}: Missing gate`);
    } else {
      const gateResult = validateGateInternal(stage.gate);
      if (!gateResult.valid) {
        errors.push(`Stage ${idx + 1} (${stage.name}) gate: ${gateResult.errors.join(', ')}`);
      }
      warnings.push(...gateResult.warnings.map((w) => `Stage ${idx + 1} (${stage.name}) gate: ${w}`));
    }
  }

  // Check for progression logic
  const progressionIssues = checkProgressionLogic(arc);
  warnings.push(...progressionIssues);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a gate (internal helper)
 */
function validateGateInternal(gate: RelationshipGate): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!gate.id) {
    errors.push('Gate must have an ID');
  }
  if (!gate.name) {
    errors.push('Gate must have a name');
  }

  // Check metric requirements
  if (gate.metricRequirements) {
    const { minAffinity, minTrust, minChemistry, minTension } = gate.metricRequirements;

    if (minAffinity !== undefined && (minAffinity < 0 || minAffinity > 100)) {
      errors.push('minAffinity must be between 0 and 100');
    }
    if (minTrust !== undefined && (minTrust < 0 || minTrust > 100)) {
      errors.push('minTrust must be between 0 and 100');
    }
    if (minChemistry !== undefined && (minChemistry < 0 || minChemistry > 100)) {
      errors.push('minChemistry must be between 0 and 100');
    }
    if (minTension !== undefined && (minTension < 0 || minTension > 100)) {
      errors.push('minTension must be between 0 and 100');
    }
  }

  // Check for conflicting flags
  if (gate.requiredFlags && gate.blockedFlags) {
    const overlap = gate.requiredFlags.filter((f) => gate.blockedFlags!.includes(f));
    if (overlap.length > 0) {
      errors.push(`Conflicting flags: ${overlap.join(', ')} are both required and blocked`);
    }
  }

  // Warning if no requirements
  const hasRequirements =
    gate.requiredTier ||
    gate.requiredIntimacyLevel ||
    gate.metricRequirements ||
    (gate.requiredFlags && gate.requiredFlags.length > 0) ||
    (gate.blockedFlags && gate.blockedFlags.length > 0);

  if (!hasRequirements) {
    warnings.push('Gate has no requirements - it will always be satisfied');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check for conflicting gates
 */
function checkGateConflicts(gates: RelationshipGate[]): string[] {
  const warnings: string[] = [];

  // Check for gates that require conflicting flags
  for (let i = 0; i < gates.length; i++) {
    for (let j = i + 1; j < gates.length; j++) {
      const gate1 = gates[i];
      const gate2 = gates[j];

      // Check if one requires what the other blocks
      if (gate1.requiredFlags && gate2.blockedFlags) {
        const conflicts = gate1.requiredFlags.filter((f) => gate2.blockedFlags!.includes(f));
        if (conflicts.length > 0) {
          warnings.push(
            `Gate "${gate1.name}" requires flags that "${gate2.name}" blocks: ${conflicts.join(', ')}`
          );
        }
      }

      if (gate2.requiredFlags && gate1.blockedFlags) {
        const conflicts = gate2.requiredFlags.filter((f) => gate1.blockedFlags!.includes(f));
        if (conflicts.length > 0) {
          warnings.push(
            `Gate "${gate2.name}" requires flags that "${gate1.name}" blocks: ${conflicts.join(', ')}`
          );
        }
      }
    }
  }

  return warnings;
}

/**
 * Check progression arc logic
 */
function checkProgressionLogic(arc: RelationshipProgressionArc): string[] {
  const warnings: string[] = [];
  const tierOrder = TIER_HIERARCHY as readonly string[];

  for (let i = 1; i < arc.stages.length; i++) {
    const prevTier = arc.stages[i - 1].tier;
    const currTier = arc.stages[i].tier;

    const prevIndex = tierOrder.indexOf(prevTier);
    const currIndex = tierOrder.indexOf(currTier);

    if (prevIndex !== -1 && currIndex !== -1 && currIndex < prevIndex) {
      warnings.push(
        `Stage progression may be illogical: "${arc.stages[i - 1].name}" (${prevTier}) → "${arc.stages[i].name}" (${currTier})`
      );
    }
  }

  // Check for unreachable stages
  for (const [idx, stage] of arc.stages.entries()) {
    if (idx === 0) continue;

    const gate = stage.gate;

    if (gate.requiredTier) {
      const tierIndex = tierOrder.indexOf(gate.requiredTier);
      const maxPrevTier = Math.max(
        ...arc.stages
          .slice(0, idx)
          .map((s) => tierOrder.indexOf(s.tier))
          .filter((i) => i !== -1)
      );

      if (tierIndex > maxPrevTier + 1) {
        warnings.push(
          `Stage "${stage.name}" may be unreachable: requires tier "${gate.requiredTier}" but no previous stage reaches that tier`
        );
      }
    }
  }

  return warnings;
}

/**
 * Validate scene before saving as template
 */
export function validateSceneForTemplate(scene: IntimacySceneConfig): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!scene.sceneType) {
    errors.push('Scene must have a type');
  }

  if (!scene.intensity) {
    errors.push('Scene must have an intensity');
  }

  if (!scene.contentRating) {
    errors.push('Scene must have a content rating');
  }

  if (scene.gates.length === 0) {
    warnings.push('Scene has no gates - consider adding at least one gate for reusability');
  }

  // Validate gates
  for (const gate of scene.gates) {
    const gateResult = validateGateInternal(gate);
    errors.push(...gateResult.errors);
    warnings.push(...gateResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate arc before saving as template
 */
export function validateArcForTemplate(arc: RelationshipProgressionArc): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (arc.stages.length === 0) {
    errors.push('Arc must have at least one stage');
  }

  if (arc.stages.length === 1) {
    warnings.push('Arc has only one stage - consider adding more stages for a complete progression');
  }

  if (!arc.maxContentRating) {
    errors.push('Arc must have a max content rating');
  }

  // Validate stages
  for (const stage of arc.stages) {
    const gateResult = validateGateInternal(stage.gate);
    errors.push(...gateResult.errors);
    warnings.push(...gateResult.warnings);
  }

  // Check progression logic
  warnings.push(...checkProgressionLogic(arc));

  return { valid: errors.length === 0, errors, warnings };
}
