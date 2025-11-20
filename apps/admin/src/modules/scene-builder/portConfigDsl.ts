/**
 * Port Configuration DSL - Pure Helper Functions
 *
 * This file contains pure DSL helpers with no external dependencies,
 * preventing circular dependency issues when custom node types
 * import these helpers.
 */

export interface PortDefinition {
  id: string;
  label: string;
  type: 'input' | 'output';
  position: 'top' | 'bottom' | 'left' | 'right';
  color: string;
  required?: boolean;
  description?: string;
}

export interface NodePortConfig {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

/**
 * Standard input port at the top
 *
 * @example
 * standardInput({ label: 'Start', color: '#ff0000' })
 */
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

/**
 * Standard output port at the bottom
 *
 * @example
 * standardOutput({ label: 'Continue', description: 'Go to next node' })
 */
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
 *
 * @example
 * singleInOut() // Default in/out
 * singleInOut(undefined, { label: 'Continue' }) // Custom output label
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
 * Used for binary decisions (condition, success/failure)
 *
 * @example
 * branchOutputs(
 *   { id: 'true', label: 'True' },
 *   { id: 'false', label: 'False' }
 * )
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
 * DSL Pattern: Branch with fallback (3 outputs: success, failure, default)
 * Used for nodes that can succeed, fail, or continue normally
 *
 * @example
 * branchWithFallback(
 *   { id: 'success', label: 'Success' },
 *   { id: 'failure', label: 'Failed' }
 * )
 */
export function branchWithFallback(
  successOutput: Partial<PortDefinition> & { id: string; label: string },
  failureOutput: Partial<PortDefinition> & { id: string; label: string },
  fallbackOverrides?: Partial<PortDefinition>,
  inputOverrides?: Partial<PortDefinition>
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
 * Used for nodes with dynamic outputs based on metadata (choice, scene_call)
 *
 * @example
 * multiChoiceOutputs([
 *   { id: 'opt1', label: 'Option 1', color: '#ff0000' },
 *   { id: 'opt2', label: 'Option 2', color: '#00ff00' }
 * ])
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
 *
 * @example
 * terminalNode()
 * terminalNode({ label: 'Entry Point' })
 */
export function terminalNode(inputOverrides?: Partial<PortDefinition>): NodePortConfig {
  return {
    inputs: [standardInput(inputOverrides)],
    outputs: [],
  };
}

/**
 * DSL Pattern: Custom ports
 * For complete flexibility when DSL patterns don't fit
 *
 * @example
 * customPorts(
 *   [standardInput(), standardInput({ id: 'alt', label: 'Alt In' })],
 *   [standardOutput(), standardOutput({ id: 'error', label: 'Error' })]
 * )
 */
export function customPorts(
  inputs: PortDefinition[],
  outputs: PortDefinition[]
): NodePortConfig {
  return { inputs, outputs };
}

/**
 * Validate port configuration
 * Returns array of error messages, empty if valid
 *
 * @example
 * const errors = validatePortConfig(config);
 * if (errors.length > 0) {
 *   console.error('Invalid port config:', errors);
 * }
 */
export function validatePortConfig(config: NodePortConfig): string[] {
  const errors: string[] = [];
  const inputIds = new Set<string>();
  const outputIds = new Set<string>();
  const validPositions = new Set(['top', 'bottom', 'left', 'right']);

  // Validate inputs
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

  // Validate outputs
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
