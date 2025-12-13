/**
 * Generation UI Types
 *
 * Shared types for generation UI components.
 */

/**
 * Parameter specification from provider operation_specs.
 * Defines the shape, type, and constraints of a generation parameter.
 */
export interface ParamSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  enum?: string[];
  description?: string;
  group?: string;
  min?: number;
  max?: number;
  metadata?: Record<string, any>;
}
