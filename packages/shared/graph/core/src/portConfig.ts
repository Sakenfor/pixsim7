/**
 * Port Configuration DSL - Pure Helper Functions
 *
 * Provides DSL helpers for defining node port configurations.
 * Pure functions with no external dependencies.
 */

// Re-export types from shared types package
import type { PortDefinition as RegistryPortDef, PortConfig } from '@pixsim7/shared.types';

export type { PortConfig, RegistryPortDef as PortDefinition };

/**
 * Runtime port definition with all required fields resolved
 */
export interface ResolvedPortDefinition {
  id: string;
  label: string;
  type: 'input' | 'output';
  position: 'top' | 'bottom' | 'left' | 'right';
  color: string;
  required?: boolean;
  description?: string;
}

/**
 * Resolved port configuration for a node
 */
export interface NodePortConfig {
  inputs: ResolvedPortDefinition[];
  outputs: ResolvedPortDefinition[];
}

// ============================================================================
// DSL Helper Functions
// ============================================================================

/**
 * Standard input port at the top
 */
export function standardInput(overrides?: Partial<ResolvedPortDefinition>): ResolvedPortDefinition {
  return {
    id: 'input',
    label: 'In',
    type: 'input',
    position: 'top',
    color: '#3b82f6', // blue
    ...overrides,
  };
}

/**
 * Standard output port at the bottom
 */
export function standardOutput(overrides?: Partial<ResolvedPortDefinition>): ResolvedPortDefinition {
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
 */
export function singleInOut(
  inputOverrides?: Partial<ResolvedPortDefinition>,
  outputOverrides?: Partial<ResolvedPortDefinition>
): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [standardOutput(outputOverrides)],
  };
}

/**
 * DSL Pattern: Left-to-right flow (input left, output right)
 */
export function leftToRightFlow(
  inputOverrides?: Partial<ResolvedPortDefinition>,
  outputOverrides?: Partial<ResolvedPortDefinition>
): NodePortConfig {
  return {
    inputs: [standardInput({ position: 'left', ...inputOverrides })],
    outputs: [standardOutput({ position: 'right', ...outputOverrides })],
  };
}

/**
 * DSL Pattern: Branch node with two conditional outputs
 */
export function branchOutputs(
  trueOutput: Partial<ResolvedPortDefinition> & { id: string; label: string },
  falseOutput: Partial<ResolvedPortDefinition> & { id: string; label: string },
  inputOverrides?: Partial<ResolvedPortDefinition>
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
 * DSL Pattern: Branch with fallback (3 outputs)
 */
export function branchWithFallback(
  successOutput: Partial<ResolvedPortDefinition> & { id: string; label: string },
  failureOutput: Partial<ResolvedPortDefinition> & { id: string; label: string },
  fallbackOverrides?: Partial<ResolvedPortDefinition>,
  inputOverrides?: Partial<ResolvedPortDefinition>
): NodePortConfig {
  const branch = branchOutputs(successOutput, failureOutput, inputOverrides);
  return {
    ...branch,
    outputs: [
      ...branch.outputs,
      standardOutput({ color: '#6b7280', ...fallbackOverrides }), // gray
    ],
  };
}

/**
 * DSL Pattern: Multi-choice outputs
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
    inputOverrides?: Partial<ResolvedPortDefinition>;
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
 */
export function terminalNode(inputOverrides?: Partial<ResolvedPortDefinition>): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [],
  };
}

/**
 * DSL Pattern: Source node (no inputs)
 */
export function sourceNode(outputOverrides?: Partial<ResolvedPortDefinition>): NodePortConfig {
  return {
    inputs: [],
    outputs: [standardOutput(outputOverrides)],
  };
}

/**
 * DSL Pattern: Custom ports for complete flexibility
 */
export function customPorts(
  inputs: ResolvedPortDefinition[],
  outputs: ResolvedPortDefinition[]
): NodePortConfig {
  return { inputs, outputs };
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Convert registry port definitions to resolved format
 */
export function resolvePortConfig(portConfig: PortConfig, nodeData?: unknown): NodePortConfig {
  // Dynamic ports take precedence
  if (portConfig.dynamic) {
    const dynamicPorts = portConfig.dynamic(nodeData);
    if (!dynamicPorts) {
      return { inputs: [], outputs: [] };
    }
    return convertToResolved(dynamicPorts.inputs || [], dynamicPorts.outputs || []);
  }

  // Static ports
  return convertToResolved(portConfig.inputs, portConfig.outputs);
}

/**
 * Convert registry PortDefinition[] to ResolvedPortDefinition[]
 */
function convertToResolved(
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

// ============================================================================
// Position Utilities
// ============================================================================

/**
 * Get CSS position style for a port based on index
 */
export function getPortPositionStyle(
  portDef: ResolvedPortDefinition,
  index: number,
  total: number
): { top?: string; bottom?: string; left?: string; right?: string } {
  const position = portDef.position;

  if (position === 'right' || position === 'left') {
    // Distribute vertically
    const spacing = 100 / (total + 1);
    const offset = spacing * (index + 1);
    return { [position]: '0', top: `${offset}%` };
  }

  if (position === 'top' || position === 'bottom') {
    // Distribute horizontally
    const spacing = 100 / (total + 1);
    const offset = spacing * (index + 1);
    return { [position]: '0', left: `${offset}%` };
  }

  return {};
}

// ============================================================================
// Registry Integration
// ============================================================================

import { nodeTypeRegistry } from './nodeTypeRegistry';

/**
 * Get port configuration for a node by looking up its type in the registry
 * Falls back to singleInOut if no port config is found
 */
export function getNodePorts(
  nodeType: string,
  nodeData?: unknown,
  options?: {
    defaultPorts?: NodePortConfig;
    flowDirection?: 'top-to-bottom' | 'left-to-right';
  }
): NodePortConfig {
  // Get node type definition from registry
  const nodeTypeDef = nodeTypeRegistry.getSync(nodeType);

  if (nodeTypeDef?.ports) {
    return resolvePortConfig(nodeTypeDef.ports, nodeData);
  }

  // Use provided default or generate based on flow direction
  if (options?.defaultPorts) {
    return options.defaultPorts;
  }

  // Default based on flow direction
  if (options?.flowDirection === 'left-to-right') {
    return leftToRightFlow();
  }

  return singleInOut();
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate port configuration
 */
export function validatePortConfig(config: NodePortConfig): string[] {
  const errors: string[] = [];
  const inputIds = new Set<string>();
  const outputIds = new Set<string>();
  const validPositions = new Set(['top', 'bottom', 'left', 'right']);

  config.inputs.forEach((port, index) => {
    if (!port.id) {
      errors.push(`Input port at index ${index} missing ID`);
    } else if (inputIds.has(port.id)) {
      errors.push(`Duplicate input ID: ${port.id}`);
    } else {
      inputIds.add(port.id);
    }

    if (!port.label) {
      errors.push(`Input port '${port.id}' missing label`);
    }

    if (!validPositions.has(port.position)) {
      errors.push(`Input port '${port.id}' has invalid position: ${port.position}`);
    }

    if (!port.color || !/^#[0-9a-fA-F]{6}$/.test(port.color)) {
      errors.push(`Input port '${port.id}' has invalid color: ${port.color}`);
    }
  });

  config.outputs.forEach((port, index) => {
    if (!port.id) {
      errors.push(`Output port at index ${index} missing ID`);
    } else if (outputIds.has(port.id)) {
      errors.push(`Duplicate output ID: ${port.id}`);
    } else {
      outputIds.add(port.id);
    }

    if (!port.label) {
      errors.push(`Output port '${port.id}' missing label`);
    }

    if (!validPositions.has(port.position)) {
      errors.push(`Output port '${port.id}' has invalid position: ${port.position}`);
    }

    if (!port.color || !/^#[0-9a-fA-F]{6}$/.test(port.color)) {
      errors.push(`Output port '${port.id}' has invalid color: ${port.color}`);
    }
  });

  return errors;
}
