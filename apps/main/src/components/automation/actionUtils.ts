/**
 * Action Builder Utilities
 *
 * Pure helper functions for automation action handling.
 */

import { ActionType, AutomationStatus } from '@/types/automation';
import type { ActionDefinition, AutomationExecution } from '@/types/automation';
import {
  NESTED_ACTION_TYPES,
  ACTION_META,
  CATEGORY_COLORS,
  type ActionMeta,
  type ActionCategory,
  type CategoryColors,
} from './actionConstants';

/**
 * Check if an action type supports nested actions
 */
export function hasNestedActions(type: ActionType): boolean {
  return NESTED_ACTION_TYPES.includes(type);
}

/**
 * Get metadata for an action type
 */
export function getActionMeta(type: ActionType): ActionMeta {
  return ACTION_META[type] || { icon: '❔', label: type, category: 'utility' };
}

/**
 * Get color styling for a category
 */
export function getCategoryColors(category: ActionCategory): CategoryColors {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.utility;
}

/**
 * Generate a human-readable summary for an action
 */
export function getActionSummary(action: ActionDefinition): string {
  const params = action.params || {};

  switch (action.type) {
    case ActionType.WAIT:
      return `${params.seconds || 1}s`;
    case ActionType.LAUNCH_APP:
      return params.package || 'Default app';
    case ActionType.CLICK_COORDS:
      return `(${params.x || 0}, ${params.y || 0})`;
    case ActionType.TYPE_TEXT:
      return params.text
        ? `"${params.text.slice(0, 30)}${params.text.length > 30 ? '...' : ''}"`
        : 'No text';
    case ActionType.SWIPE:
      return `(${params.x1},${params.y1}) → (${params.x2},${params.y2})`;
    case ActionType.WAIT_FOR_ELEMENT:
    case ActionType.CLICK_ELEMENT:
    case ActionType.IF_ELEMENT_EXISTS:
    case ActionType.IF_ELEMENT_NOT_EXISTS: {
      const parts: string[] = [];
      if (params.resource_id) parts.push(`id: ${params.resource_id.split('/').pop()}`);
      if (params.text) parts.push(`text: "${params.text.slice(0, 20)}"`);
      if (params.content_desc) parts.push(`desc: "${params.content_desc.slice(0, 20)}"`);
      if (action.type === ActionType.WAIT_FOR_ELEMENT && params.timeout) {
        parts.push(`${params.timeout}s timeout`);
      }
      if (
        (action.type === ActionType.IF_ELEMENT_EXISTS ||
          action.type === ActionType.IF_ELEMENT_NOT_EXISTS) &&
        params.actions?.length
      ) {
        parts.push(`${params.actions.length} nested`);
      }
      return parts.length > 0 ? parts.join(' • ') : 'No selector';
    }
    case ActionType.REPEAT:
      return `${params.count || 1}× • ${params.actions?.length || 0} nested`;
    case ActionType.PRESS_BACK:
    case ActionType.EMULATOR_BACK:
    case ActionType.PRESS_HOME:
    case ActionType.EXIT_APP:
    case ActionType.SCREENSHOT:
      return '';
    default:
      return Object.keys(params).length > 0 ? JSON.stringify(params) : '';
  }
}

/**
 * Get condition result for IF actions from execution data
 */
export function getConditionResult(
  index: number,
  depth: number,
  execution: AutomationExecution | null | undefined
): boolean | null {
  if (!execution) return null;
  const conditionResults = execution.error_details?.condition_results as
    | Record<string, boolean>
    | undefined;
  if (!conditionResults) return null;

  // Build path key like "2" or "2.0.1"
  // Note: We don't have access to the full path here, so we use index for top-level
  // For nested, this is trickier - we'd need to pass the path down
  const pathKey = String(index);
  if (pathKey in conditionResults) {
    return conditionResults[pathKey];
  }
  return null;
}

/** Action test status */
export type ActionTestStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

/**
 * Get test status for an action (supports nested path matching)
 */
export function getActionTestStatus(
  index: number,
  execution: AutomationExecution | null | undefined,
  depth: number = 0,
  errorPath?: number[]
): ActionTestStatus {
  if (!execution) return 'idle';

  // For FAILED status, check if this action matches the error path
  if (execution.status === AutomationStatus.FAILED) {
    if (errorPath && errorPath.length > depth) {
      // Check if this action is in the error path
      if (errorPath[depth] === index) {
        return 'failed';
      }
    }
    // Not in error path - for top level, mark earlier actions as completed
    if (depth === 0) {
      const errorTopIndex = errorPath?.[0] ?? execution.error_action_index ?? 0;
      if (index < errorTopIndex) return 'completed';
    }
    return 'idle';
  }

  // For COMPLETED status
  if (execution.status === AutomationStatus.COMPLETED) {
    // All actions (including nested) are completed
    return 'completed';
  }

  // For RUNNING status - only track at top level since we don't have nested progress
  if (execution.status === AutomationStatus.RUNNING) {
    if (depth === 0) {
      const currentIndex = execution.current_action_index ?? 0;
      if (index < currentIndex) return 'completed';
      if (index === currentIndex) return 'running';
      return 'pending';
    }
    // For nested: if parent is running, nested are part of it
    return 'idle';
  }

  if (execution.status === AutomationStatus.PENDING) {
    return depth === 0 ? 'pending' : 'idle';
  }

  return 'idle';
}
