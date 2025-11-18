import type { DraftSceneNode } from './index';
import { nodeTypeRegistry } from '@pixsim7/types';

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
 * Port Configuration DSL - Helper Functions
 *
 * These functions provide a mini DSL for defining common port patterns
 * without repeating boilerplate code.
 *
 * Custom node types can import and use these helpers to define their ports:
 *
 * @example
 * import { singleInOut, branchOutputs } from './portConfig';
 *
 * nodeTypeRegistry.register({
 *   id: 'my_custom_node',
 *   name: 'My Custom Node',
 *   defaultData: {},
 *   ports: {
 *     dynamic: (node) => singleInOut()
 *   }
 * });
 */

/** Standard input port at the top */
export function standardInput(overrides?: Partial<PortDefinition>): PortDefinition {
  return {
    id: 'input',
    label: 'In',
    type: 'input',
    position: 'top',
    color: '#3b82f6', // blue
    ...overrides,
  };
}

/** Standard output port at the bottom */
export function standardOutput(overrides?: Partial<PortDefinition>): PortDefinition {
  return {
    id: 'default',
    label: 'Next',
    type: 'output',
    position: 'bottom',
    color: '#10b981', // green
    ...overrides,
  };
}

/**
 * DSL Pattern: Single input/output (passthrough)
 * Common for simple sequential nodes like video, node_group
 */
export function singleInOut(
  inputOverrides?: Partial<PortDefinition>,
  outputOverrides?: Partial<PortDefinition>
): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [standardOutput(outputOverrides)],
  };
}

/**
 * DSL Pattern: Branch node with two conditional outputs
 * Used for binary decisions (condition, generation with success/failure)
 */
export function branchOutputs(
  trueOutput: Partial<PortDefinition> & { id: string; label: string },
  falseOutput: Partial<PortDefinition> & { id: string; label: string },
  inputOverrides?: Partial<PortDefinition>
): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [
      {
        type: 'output',
        position: 'right',
        color: '#10b981', // green
        ...trueOutput,
      },
      {
        type: 'output',
        position: 'right',
        color: '#ef4444', // red
        ...falseOutput,
      },
    ],
  };
}

/**
 * DSL Pattern: Multi-choice outputs
 * Used for nodes with dynamic outputs based on metadata (choice, scene_call)
 */
export function multiChoiceOutputs(
  choices: Array<{
    id: string;
    label: string;
    color?: string;
    description?: string;
  }>,
  options?: {
    position?: 'right' | 'bottom' | 'left';
    defaultColor?: string;
    inputOverrides?: Partial<PortDefinition>;
  }
): NodePortConfig {
  const position = options?.position || 'right';
  const defaultColor = options?.defaultColor || '#8b5cf6'; // purple

  const outputs = choices.map(choice => ({
    id: choice.id,
    label: choice.label,
    type: 'output' as const,
    position,
    color: choice.color || defaultColor,
    description: choice.description,
  }));

  return {
    inputs: [standardInput(options?.inputOverrides)],
    outputs,
  };
}

/**
 * DSL Pattern: Terminal node (no outputs)
 * Used for end nodes and return nodes
 */
export function terminalNode(inputOverrides?: Partial<PortDefinition>): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [],
  };
}

/**
 * Get port configuration for a specific node
 */
export function getNodePorts(node: DraftSceneNode): NodePortConfig {
  // Check if node type has custom port configuration in registry
  const customConfig = getCustomPortConfig(node);
  if (customConfig) {
    return customConfig;
  }

  switch (node.type) {
    case 'video':
      return singleInOut(
        undefined,
        { description: 'Continue to next node' }
      );

    case 'choice': {
      // Read choices from node metadata
      const choices = (node.metadata as any)?.choices as Array<{
        id: string;
        text: string;
        color?: string;
      }> || [];

      // Default choices if none configured
      const choicesData = choices.length > 0
        ? choices.map((choice, index) => ({
            id: choice.id,
            label: choice.text || `Choice ${index + 1}`,
            color: choice.color,
            description: `Player chooses: ${choice.text}`,
          }))
        : [
            { id: 'choice_1', label: 'Choice 1' },
            { id: 'choice_2', label: 'Choice 2' },
          ];

      return multiChoiceOutputs(choicesData);
    }

    case 'condition':
      return branchOutputs(
        {
          id: 'true',
          label: 'True',
          description: 'Condition evaluates to true',
        },
        {
          id: 'false',
          label: 'False',
          description: 'Condition evaluates to false',
        }
      );

    case 'scene_call': {
      const callNode = node as any; // SceneCallNodeData
      const returnPoints = callNode.returnPoints || [];

      // Default return point if none configured
      if (returnPoints.length === 0) {
        return singleInOut(
          undefined,
          { id: 'default', label: 'Return' }
        );
      }

      const returnData = returnPoints.map((rp: any, index: number) => ({
        id: rp.id,
        label: rp.label || `Return ${index + 1}`,
        color: rp.color || '#a855f7', // purple variants
        description: rp.description,
      }));

      return multiChoiceOutputs(returnData, {
        defaultColor: '#a855f7',
      });
    }

    case 'return':
      return terminalNode();

    case 'end':
      return terminalNode();

    case 'generation': {
      // Generation is a special case: branch + default fallback
      const branch = branchOutputs(
        {
          id: 'success',
          label: 'Success',
          description: 'Generation succeeded',
        },
        {
          id: 'failure',
          label: 'Failed',
          description: 'Generation failed',
        }
      );

      // Add a third default output
      return {
        ...branch,
        outputs: [
          ...branch.outputs,
          standardOutput({ color: '#6b7280' }), // gray
        ],
      };
    }

    case 'node_group':
      return singleInOut(
        undefined,
        { id: 'output', label: 'Out' }
      );

    default:
      // Fallback for unknown node types
      return singleInOut(
        undefined,
        { label: 'Out' }
      );
  }
}

/**
 * Get custom port configuration from node type registry
 * This allows node types to define their own port configurations
 */
function getCustomPortConfig(node: DraftSceneNode): NodePortConfig | null {
  // Get node type definition from registry
  const nodeTypeDef = nodeTypeRegistry.getSync(node.type);
  if (!nodeTypeDef?.ports) {
    return null;
  }

  const portConfig = nodeTypeDef.ports;

  // If dynamic port generator is provided, use it
  if (portConfig.dynamic) {
    const dynamicPorts = portConfig.dynamic(node);
    return convertToNodePortConfig(dynamicPorts.inputs, dynamicPorts.outputs);
  }

  // Otherwise use static port definitions
  return convertToNodePortConfig(portConfig.inputs, portConfig.outputs);
}

/**
 * Convert registry port definitions to NodePortConfig format
 */
function convertToNodePortConfig(
  inputs?: Array<{
    id: string;
    label: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    color?: string;
    required?: boolean;
    description?: string;
  }>,
  outputs?: Array<{
    id: string;
    label: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    color?: string;
    description?: string;
  }>
): NodePortConfig {
  return {
    inputs: (inputs || []).map(input => ({
      id: input.id,
      label: input.label,
      type: 'input' as const,
      position: input.position || 'top',
      color: input.color || '#3b82f6',
      required: input.required,
      description: input.description,
    })),
    outputs: (outputs || []).map(output => ({
      id: output.id,
      label: output.label,
      type: 'output' as const,
      position: output.position || 'bottom',
      color: output.color || '#10b981',
      description: output.description,
    })),
  };
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
