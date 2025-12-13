import type { DraftSceneNode } from './index';
import { nodeTypeRegistry, type PortDefinition as RegistryPortDef } from '@lib/registries';

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

    // choice and scene_call are now defined in the registry (builtinNodeTypes.ts)
    // and are handled by getCustomPortConfig() above

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

    // Validate dynamic ports result
    if (!dynamicPorts) {
      console.warn('[portConfig] Dynamic port function returned null/undefined for node type:', node.type);
      return null;
    }

    if (!dynamicPorts.inputs && !dynamicPorts.outputs) {
      console.warn('[portConfig] Dynamic port function returned no inputs or outputs for node type:', node.type);
      return null;
    }

    return convertToNodePortConfig(
      dynamicPorts.inputs || [],
      dynamicPorts.outputs || []
    );
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
