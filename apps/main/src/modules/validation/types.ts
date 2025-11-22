/**
 * Shared validation types for scene graphs and arc graphs
 *
 * This module provides unified validation types that can be used across
 * different graph layers (scene graphs, arc graphs, character graphs).
 *
 * Design principles:
 * - Single source of truth for validation structure
 * - Type safety across all graph validation
 * - UI consistency through shared severity rendering
 */

/**
 * Scene graph validation issue types
 */
export type SceneValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'empty-media'
  | 'invalid-selection'
  | 'no-nodes';

/**
 * Arc graph validation issue types
 */
export type ArcValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'broken-scene-reference'
  | 'broken-quest-reference'
  | 'broken-character-reference'
  | 'invalid-requirements'
  | 'orphaned-node';

/**
 * Union type for all validation issue types
 */
export type ValidationIssueType = SceneValidationIssueType | ArcValidationIssueType;

/**
 * Validation issue structure
 * Used by both scene graphs and arc graphs for consistent error reporting
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  details?: string;
}

/**
 * Validation result structure
 * Provides categorized issues for easy filtering and display
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Severity levels for UI rendering
 * Provides consistent visual styling across all validation panels
 */
export const SEVERITY_COLORS = {
  error: {
    bg: 'bg-red-500',
    text: 'text-red-500',
    icon: '🔴',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-amber-500',
    icon: '⚠️',
  },
  info: {
    bg: 'bg-blue-500',
    text: 'text-blue-500',
    icon: 'ℹ️',
  },
} as const;
