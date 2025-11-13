import type { DraftSceneNode } from './index';

/**
 * Port Configuration System
 *
 * Defines which input/output ports each node type should have
 */

export interface PortDefinition {
  id: string;
  label: string;
  type: 'input' | 'output';
  position: 'top' | 'bottom' | 'left' | 'right';
  color: string; // For visual distinction
  required?: boolean; // Must be connected
  description?: string;
}

export interface NodePortConfig {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

/**
 * Get port configuration for a specific node
 */
export function getNodePorts(node: DraftSceneNode): NodePortConfig {
  switch (node.type) {
    case 'video':
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6', // blue
          },
        ],
        outputs: [
          {
            id: 'default',
            label: 'Next',
            type: 'output',
            position: 'bottom',
            color: '#10b981', // green
            description: 'Continue to next node',
          },
        ],
      };

    case 'choice': {
      // Read choices from node metadata
      const choices = (node.metadata as any)?.choices as Array<{
        id: string;
        text: string;
        color?: string;
      }> || [];

      const outputs = choices.length > 0
        ? choices.map((choice, index) => ({
            id: choice.id,
            label: choice.text || `Choice ${index + 1}`,
            type: 'output' as const,
            position: 'right' as const,
            color: choice.color || '#8b5cf6', // Use custom color or default purple
            description: `Player chooses: ${choice.text}`,
          }))
        : [
            // Default outputs if no choices configured
            {
              id: 'choice_1',
              label: 'Choice 1',
              type: 'output' as const,
              position: 'right' as const,
              color: '#8b5cf6',
            },
            {
              id: 'choice_2',
              label: 'Choice 2',
              type: 'output' as const,
              position: 'right' as const,
              color: '#8b5cf6',
            },
          ];

      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs,
      };
    }

    case 'condition':
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [
          {
            id: 'true',
            label: 'True',
            type: 'output',
            position: 'right',
            color: '#10b981', // green
            description: 'Condition evaluates to true',
          },
          {
            id: 'false',
            label: 'False',
            type: 'output',
            position: 'right',
            color: '#ef4444', // red
            description: 'Condition evaluates to false',
          },
        ],
      };

    case 'scene_call': {
      const callNode = node as any; // SceneCallNodeData
      const returnPoints = callNode.returnPoints || [];

      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: returnPoints.length > 0
          ? returnPoints.map((rp: any, index: number) => ({
              id: rp.id,
              label: rp.label || `Return ${index + 1}`,
              type: 'output' as const,
              position: 'right' as const,
              color: rp.color || '#a855f7', // purple variants
              description: rp.description,
            }))
          : [
              {
                id: 'default',
                label: 'Return',
                type: 'output' as const,
                position: 'bottom' as const,
                color: '#10b981',
              },
            ],
      };
    }

    case 'return':
      // Return nodes are terminal within a scene (no outputs)
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [], // No outputs - exits the scene
      };

    case 'end':
      // End nodes are terminal (no outputs)
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [], // No outputs - game ends
      };

    case 'generation':
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [
          {
            id: 'success',
            label: 'Success',
            type: 'output',
            position: 'right',
            color: '#10b981',
            description: 'Generation succeeded',
          },
          {
            id: 'failure',
            label: 'Failed',
            type: 'output',
            position: 'right',
            color: '#ef4444',
            description: 'Generation failed',
          },
          {
            id: 'default',
            label: 'Next',
            type: 'output',
            position: 'bottom',
            color: '#6b7280',
          },
        ],
      };

    case 'node_group':
      // Groups act as containers - simple pass-through
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [
          {
            id: 'output',
            label: 'Out',
            type: 'output',
            position: 'bottom',
            color: '#10b981',
          },
        ],
      };

    default:
      // Fallback for unknown node types
      return {
        inputs: [
          {
            id: 'input',
            label: 'In',
            type: 'input',
            position: 'top',
            color: '#3b82f6',
          },
        ],
        outputs: [
          {
            id: 'default',
            label: 'Out',
            type: 'output',
            position: 'bottom',
            color: '#10b981',
          },
        ],
      };
  }
}

/**
 * Helper to get position style for a port based on index
 */
export function getPortPosition(
  portDef: PortDefinition,
  index: number,
  total: number
): { top?: string; bottom?: string; left?: string; right?: string } {
  const position = portDef.position;

  if (position === 'right' || position === 'left') {
    // Distribute vertically
    const spacing = 100 / (total + 1);
    const offset = spacing * (index + 1);
    return { [`${position}`]: '0', top: `${offset}%` };
  }

  if (position === 'top' || position === 'bottom') {
    // Distribute horizontally
    const spacing = 100 / (total + 1);
    const offset = spacing * (index + 1);
    return { [`${position}`]: '0', left: `${offset}%` };
  }

  return {};
}
