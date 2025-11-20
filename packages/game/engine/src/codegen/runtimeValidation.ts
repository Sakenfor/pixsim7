/**
 * Runtime Plugin Validation
 *
 * Validates plugin configurations and data at runtime to catch type errors
 * before they cause issues in production.
 */

import type { InteractionPlugin, BaseInteractionConfig } from '@pixsim7/shared.types';
import type { NodeTypeDefinition } from '@pixsim7/shared.types';

// ===== Validation Result Types =====

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  actual?: string;
}

// ===== Schema Validation =====

/**
 * Validate value against JSON schema
 */
export function validateSchema(value: any, schema: Record<string, any>, path = ''): ValidationResult {
  const errors: ValidationError[] = [];

  // Type validation
  if (schema.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type) {
      errors.push({
        path,
        message: `Type mismatch`,
        expected: schema.type,
        actual: actualType,
      });
      return { valid: false, errors };
    }
  }

  // Object properties
  if (schema.type === 'object' && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${key}` : key;
      const propValue = value?.[key];

      // Check required
      if (schema.required?.includes(key) && propValue === undefined) {
        errors.push({
          path: propPath,
          message: 'Required field missing',
        });
        continue;
      }

      // Validate property if it exists
      if (propValue !== undefined) {
        const result = validateSchema(propValue, propSchema as any, propPath);
        errors.push(...result.errors);
      }
    }
  }

  // Array items
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      const result = validateSchema(item, schema.items, itemPath);
      errors.push(...result.errors);
    });
  }

  // String constraints
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String too short (min: ${schema.minLength})`,
        actual: `length ${value.length}`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String too long (max: ${schema.maxLength})`,
        actual: `length ${value.length}`,
      });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({
        path,
        message: `String does not match pattern`,
        expected: schema.pattern,
        actual: value,
      });
    }
  }

  // Number constraints
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Number too small (min: ${schema.minimum})`,
        actual: String(value),
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Number too large (max: ${schema.maximum})`,
        actual: String(value),
      });
    }
  }

  // Enum
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: 'Value not in allowed enum',
      expected: schema.enum.join(', '),
      actual: String(value),
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ===== Plugin-Specific Validation =====

/**
 * Validate interaction plugin configuration
 */
export function validateInteractionConfig<T extends BaseInteractionConfig>(
  plugin: InteractionPlugin<T>,
  config: any
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check base config
  if (typeof config !== 'object' || config === null) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Config must be an object' }],
    };
  }

  if (typeof config.enabled !== 'boolean') {
    errors.push({
      path: 'enabled',
      message: 'enabled field must be a boolean',
      actual: typeof config.enabled,
    });
  }

  // Run custom validation if provided
  if (plugin.validate) {
    const customError = plugin.validate(config);
    if (customError) {
      errors.push({
        path: '',
        message: customError,
      });
    }
  }

  // Validate against config fields
  for (const field of plugin.configFields) {
    const value = config[field.key];

    // Check type
    switch (field.type) {
      case 'number':
        if (value !== undefined && typeof value !== 'number') {
          errors.push({
            path: field.key,
            message: 'Must be a number',
            expected: 'number',
            actual: typeof value,
          });
        } else if (typeof value === 'number') {
          if (field.min !== undefined && value < field.min) {
            errors.push({
              path: field.key,
              message: `Value must be at least ${field.min}`,
              actual: String(value),
            });
          }
          if (field.max !== undefined && value > field.max) {
            errors.push({
              path: field.key,
              message: `Value must be at most ${field.max}`,
              actual: String(value),
            });
          }
        }
        break;

      case 'text':
        if (value !== undefined && typeof value !== 'string') {
          errors.push({
            path: field.key,
            message: 'Must be a string',
            expected: 'string',
            actual: typeof value,
          });
        }
        break;

      case 'boolean':
        if (value !== undefined && typeof value !== 'boolean') {
          errors.push({
            path: field.key,
            message: 'Must be a boolean',
            expected: 'boolean',
            actual: typeof value,
          });
        }
        break;

      case 'select':
        if (value !== undefined && field.options) {
          const validValues = field.options.map(o => o.value);
          if (!validValues.includes(value)) {
            errors.push({
              path: field.key,
              message: 'Invalid option selected',
              expected: validValues.join(', '),
              actual: String(value),
            });
          }
        }
        break;

      case 'tags':
        if (value !== undefined && !Array.isArray(value)) {
          errors.push({
            path: field.key,
            message: 'Must be an array',
            expected: 'array',
            actual: typeof value,
          });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate node type data
 */
export function validateNodeTypeData<T = any>(
  nodeType: NodeTypeDefinition<T>,
  data: any
): ValidationResult {
  // If schema is provided, use it
  if (nodeType.schema) {
    return validateSchema(data, nodeType.schema);
  }

  // Otherwise, run custom validation if provided
  if (nodeType.validate) {
    const error = nodeType.validate(data);
    if (error) {
      return {
        valid: false,
        errors: [{ path: '', message: error }],
      };
    }
  }

  return { valid: true, errors: [] };
}

// ===== Error Formatting =====

/**
 * Format validation errors into human-readable messages
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'No errors';
  }

  return result.errors.map(err => {
    let msg = err.path ? `${err.path}: ${err.message}` : err.message;

    if (err.expected) {
      msg += ` (expected: ${err.expected})`;
    }
    if (err.actual) {
      msg += ` (got: ${err.actual})`;
    }

    return `  - ${msg}`;
  }).join('\n');
}

/**
 * Assert validation result or throw error
 */
export function assertValid(result: ValidationResult, context = 'Validation'): void {
  if (!result.valid) {
    const message = `${context} failed:\n${formatValidationErrors(result)}`;
    throw new Error(message);
  }
}

// ===== Convenience Functions =====

/**
 * Validate and throw if invalid
 */
export function validateOrThrow<T>(
  value: any,
  schema: Record<string, any>,
  context?: string
): T {
  const result = validateSchema(value, schema);
  assertValid(result, context);
  return value as T;
}

/**
 * Create a validator function from a schema
 */
export function createValidator<T>(
  schema: Record<string, any>
): (value: any) => value is T {
  return (value: any): value is T => {
    const result = validateSchema(value, schema);
    return result.valid;
  };
}
