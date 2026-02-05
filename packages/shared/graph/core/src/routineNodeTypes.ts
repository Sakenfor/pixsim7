/**
 * Routine Graph Node Types
 *
 * Defines node types for NPC routine/schedule graphs.
 * Routine graphs model daily schedules with time slots, decisions, and activities.
 */

import { nodeTypeRegistry } from './nodeTypeRegistry';

// Ensure routine node types are only registered once per process
let routineNodeTypesRegistered = false;

// ============================================================================
// Port Configurations for Routine Nodes
// ============================================================================

/** Time slot ports - top-to-bottom flow (schedule progression) */
const timeSlotPorts = {
  inputs: [{ id: 'input', label: 'In', position: 'top' as const, color: '#3b82f6' }],
  outputs: [{ id: 'output', label: 'Next', position: 'bottom' as const, color: '#3b82f6' }],
};

/** Decision node ports - branching based on conditions */
const decisionNodePorts = {
  dynamic: (node: { branches?: Array<{ id: string; label: string; color?: string }> }) => {
    const branches = node.branches;
    if (branches && branches.length > 0) {
      // Named branches from metadata
      return {
        inputs: [{ id: 'input', label: 'In', position: 'top' as const, color: '#f59e0b' }],
        outputs: branches.map(branch => ({
          id: branch.id,
          label: branch.label,
          position: 'bottom' as const,
          color: branch.color || '#f59e0b',
        })),
      };
    }
    // Default: true/false branches
    return {
      inputs: [{ id: 'input', label: 'In', position: 'top' as const, color: '#f59e0b' }],
      outputs: [
        { id: 'true', label: 'Yes', position: 'bottom' as const, color: '#10b981' },
        { id: 'false', label: 'No', position: 'bottom' as const, color: '#ef4444' },
      ],
    };
  },
};

/** Activity ports - simple flow-through */
const activityPorts = {
  inputs: [{ id: 'input', label: 'In', position: 'top' as const, color: '#10b981' }],
  outputs: [{ id: 'output', label: 'Done', position: 'bottom' as const, color: '#10b981' }],
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all routine graph node types (idempotent)
 */
export function registerRoutineNodeTypes() {
  if (routineNodeTypesRegistered) {
    return;
  }
  routineNodeTypesRegistered = true;

  // Time Slot node - represents a time period in the daily schedule
  nodeTypeRegistry.register({
    id: 'time_slot',
    name: 'Time Slot',
    description: 'A time period in the daily schedule',
    icon: '🕐',
    category: 'flow',
    scope: 'custom', // routine scope
    userCreatable: true,
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    defaultData: {
      timeRangeSeconds: { start: 0, end: 3600 },
      preferredActivities: [],
    },
    ports: timeSlotPorts,
    editorComponent: 'TimeSlotNodeEditor',
    rendererComponent: 'TimeSlotNodeRenderer',
    preloadPriority: 5, // Routine-level, common
  });

  // Decision node - conditional branching based on NPC state
  nodeTypeRegistry.register({
    id: 'decision',
    name: 'Decision',
    description: 'Conditional branch based on NPC state or conditions',
    icon: '🔀',
    category: 'logic',
    scope: 'custom', // routine scope
    userCreatable: true,
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    defaultData: {
      decisionConditions: [],
      branches: [],
    },
    ports: decisionNodePorts,
    editorComponent: 'DecisionNodeEditor',
    rendererComponent: 'DecisionNodeRenderer',
    preloadPriority: 5, // Routine-level, common
  });

  // Activity node - represents activities available at this point
  nodeTypeRegistry.register({
    id: 'activity',
    name: 'Activity',
    description: 'Activities the NPC can perform',
    icon: '🎯',
    category: 'action',
    scope: 'custom', // routine scope
    userCreatable: true,
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    defaultData: {
      preferredActivities: [],
    },
    ports: activityPorts,
    editorComponent: 'ActivityNodeEditor',
    rendererComponent: 'ActivityNodeRenderer',
    preloadPriority: 5, // Routine-level, common
  });
}

/**
 * Get all routine node type IDs
 */
export function getRoutineNodeTypeIds(): string[] {
  return ['time_slot', 'decision', 'activity'];
}

/**
 * Check if a node type is a routine node type
 */
export function isRoutineNodeType(nodeType: string): boolean {
  return getRoutineNodeTypeIds().includes(nodeType);
}
