import type { Connection } from 'reactflow';
import type { DraftSceneNode } from './index';
import { getNodePorts } from './portConfig';

/**
 * Port Connection Validation
 *
 * Validates whether a connection between two ports is allowed
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a connection between two nodes
 */
export function validateConnection(
  connection: Connection,
  sourceNode: DraftSceneNode,
  targetNode: DraftSceneNode
): ValidationResult {
  // Basic validation - must have source and target
  if (!connection.source || !connection.target) {
    return { valid: false, reason: 'Missing source or target' };
  }

  // Can't connect to self
  if (connection.source === connection.target) {
    return { valid: false, reason: 'Cannot connect node to itself' };
  }

  // Get port configurations
  const sourcePorts = getNodePorts(sourceNode);
  const targetPorts = getNodePorts(targetNode);

  const sourceHandle = connection.sourceHandle || 'default';
  const targetHandle = connection.targetHandle || 'input';

  // Validate source port exists
  const sourcePortExists = sourcePorts.outputs.some((p) => p.id === sourceHandle);
  if (!sourcePortExists) {
    return { valid: false, reason: `Source port '${sourceHandle}' does not exist` };
  }

  // Validate target port exists
  const targetPortExists = targetPorts.inputs.some((p) => p.id === targetHandle);
  if (!targetPortExists) {
    return { valid: false, reason: `Target port '${targetHandle}' does not exist` };
  }

  // Node type specific validation
  const sourceType = sourceNode.type as string;
  const targetType = targetNode.type as string;

  // Return nodes can't have outputs
  if (sourceType === 'return') {
    return { valid: false, reason: 'Return nodes cannot have outgoing connections' };
  }

  // End nodes can't have outputs
  if (sourceType === 'end') {
    return { valid: false, reason: 'End nodes cannot have outgoing connections' };
  }

  // Return nodes can't receive connections (they're exits)
  if (targetType === 'return' && sourceType !== 'return') {
    return { valid: false, reason: 'Cannot connect to return nodes (they exit the scene)' };
  }

  // All validation passed
  return { valid: true };
}

/**
 * Get a user-friendly error message for display
 */
export function getValidationMessage(result: ValidationResult): string {
  if (result.valid) return 'Connection allowed';
  return result.reason || 'Connection not allowed';
}

/**
 * Quick check if a connection would be valid (for UI feedback)
 */
export function isConnectionValid(
  connection: Connection,
  sourceNode: DraftSceneNode | undefined,
  targetNode: DraftSceneNode | undefined
): boolean {
  if (!sourceNode || !targetNode) return false;
  const result = validateConnection(connection, sourceNode, targetNode);
  return result.valid;
}
