/**
 * Validation Types and Context Definition
 *
 * Separated from component file to satisfy react-refresh eslint rule.
 */

import { createContext } from 'react';

import type { ValidationIssue } from '@domain/sceneBuilder/validation';

import type { IndexedValidationResult } from './useSceneValidation';

export interface NodeValidation {
  issues: ValidationIssue[];
  highestSeverity: 'error' | 'warning' | 'info' | null;
}

export interface ValidationContextValue {
  /** Full validation result with indexed lookups */
  validation: IndexedValidationResult;
  /** Get validation issues for a specific node - O(1) lookup */
  getNodeIssues: (nodeId: string) => NodeValidation;
  /** Check if scene has any errors */
  hasErrors: boolean;
  /** Check if scene has any warnings */
  hasWarnings: boolean;
}

export const ValidationContext = createContext<ValidationContextValue | null>(null);
