/**
 * Config Schema Utilities
 *
 * Converts JSON Schema definitions to FormField arrays for
 * dynamic interaction config UI generation.
 */

import type { FormField, FormFieldType } from './registry';

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: (string | number)[];
  items?: JsonSchemaProperty;
}

/**
 * JSON Schema object
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Convert a camelCase key to a human-readable label
 */
export function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Map JSON Schema type to FormField type
 */
export function mapSchemaTypeToFieldType(
  schemaType: string,
  hasEnum?: (string | number)[]
): FormFieldType {
  if (hasEnum) return 'select';

  switch (schemaType) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'tags';
    case 'string':
    default:
      return 'text';
  }
}

/**
 * Convert JSON Schema to FormField array for interaction config UI
 *
 * Handles:
 * - number/integer with min/max constraints
 * - string with enum options
 * - boolean
 * - array (as tags)
 *
 * @param schema - JSON Schema object
 * @returns Array of FormField definitions
 */
export function jsonSchemaToConfigFields(schema: JsonSchema): FormField[] {
  const fields: FormField[] = [];

  if (!schema.properties) {
    return fields;
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    const field: FormField = {
      key,
      label: formatFieldLabel(key),
      type: mapSchemaTypeToFieldType(prop.type, prop.enum),
      description: prop.description,
    };

    // Add number constraints
    if (prop.type === 'number' || prop.type === 'integer') {
      if (prop.minimum !== undefined) field.min = prop.minimum;
      if (prop.maximum !== undefined) field.max = prop.maximum;
      // Default step for 0-1 ranges
      if (prop.minimum === 0 && prop.maximum === 1) {
        field.step = 0.1;
      }
    }

    // Add enum options
    if (prop.enum) {
      field.options = prop.enum.map((v) => ({
        value: v,
        label: String(v),
      }));
    }

    // Handle array types as tags
    if (prop.type === 'array') {
      field.type = 'tags';
      field.placeholder = `e.g., ${key}:example_value`;
    }

    fields.push(field);
  }

  return fields;
}
