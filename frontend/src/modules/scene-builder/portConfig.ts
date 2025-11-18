import type { DraftSceneNode } from './index';
import { nodeTypeRegistry, type PortDefinition as RegistryPortDef } from '@pixsim7/types';
import type {
  ChoiceNodeMetadata,
  SceneCallNodeMetadata,
} from './nodeMetadataTypes';

// Re-export DSL helpers and types for convenience
export {
  type PortDefinition,
  type NodePortConfig,
  standardInput,
  standardOutput,
  singleInOut,
  branchOutputs,
  branchWithFallback,
  multiChoiceOutputs,
  terminalNode,
  customPorts,
  validatePortConfig,
} from './portConfigDsl';

import {
  singleInOut,
  branchOutputs,
  branchWithFallback,
  multiChoiceOutputs,
  terminalNode,
  type NodePortConfig,
} from './portConfigDsl';

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
      // Read choices from node metadata (type-safe)
      const metadata = node.metadata as ChoiceNodeMetadata | undefined;
      const choices = metadata?.choices || [];

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
      // Read return points from node metadata (type-safe)
      const metadata = node.metadata as SceneCallNodeMetadata | undefined;
      const returnPoints = metadata?.returnPoints || [];

      // Default return point if none configured
      if (returnPoints.length === 0) {
        return singleInOut(
          undefined,
          { id: 'default', label: 'Return' }
        );
      }

      const returnData = returnPoints.map((rp, index) => ({
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

    case 'generation':
      // Generation has success/failure branches plus a default fallback
      return branchWithFallback(
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
 * Adds the 'type' field and default colors/positions
 */
function convertToNodePortConfig(
  inputs?: RegistryPortDef[],
  outputs?: RegistryPortDef[]
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
