import type { GameSessionDTO } from '@pixsim7/shared.types';

export type HelperFunction = (
  session: GameSessionDTO,
  ...args: any[]
) => GameSessionDTO | any;

/**
 * Configuration field types for plugin config UI
 */
export type ConfigFieldType = 'boolean' | 'number' | 'string' | 'select' | 'slider' | 'text';

/**
 * Configuration field definition for plugin settings
 */
export interface ConfigField {
  /** Field key (matches config property name) */
  key: string;
  /** Display label */
  label: string;
  /** Field type for UI rendering */
  type: ConfigFieldType;
  /** Help text/description */
  description?: string;
  /** Default value */
  default?: any;
  /** Min value (for number/slider) */
  min?: number;
  /** Max value (for number/slider) */
  max?: number;
  /** Step value (for number/slider) */
  step?: number;
  /** Options for select fields */
  options?: Array<{ value: string | number | boolean; label: string }>;
  /** Placeholder text (for text/string fields) */
  placeholder?: string;
}

/**
 * Plugin configuration schema
 */
export interface ConfigSchema {
  [key: string]: ConfigField;
}

export interface HelperDefinition {
  /** Unique identifier for the helper (if not provided, uses name) */
  id?: string;

  /** Helper name (will be accessible as helpers[name]) */
  name: string;

  /** Helper function */
  fn: HelperFunction;

  /** Description for docs and UI */
  description?: string;

  /** Parameter names for documentation */
  params?: Array<{ name: string; type: string; description?: string }>;

  /** Return type */
  returns?: string;

  /** Category for organization */
  category?: 'relationships' | 'inventory' | 'quests' | 'arcs' | 'events' | 'custom';

  /** Version string (semver recommended) */
  version?: string;

  /** Tags for filtering/searching */
  tags?: string[];

  /** Mark as experimental/beta */
  experimental?: boolean;

  /** Configuration schema for plugin settings */
  configSchema?: ConfigSchema;
}

/** Valid helper categories */
export const VALID_HELPER_CATEGORIES = [
  'relationships',
  'inventory',
  'quests',
  'arcs',
  'events',
  'custom',
] as const;

export interface RegistryOptions {
  /** Throw error on duplicate registration instead of warning */
  strict?: boolean;
}

export class SessionHelperRegistry {
  private helpers = new Map<string, HelperDefinition>();
  private options: RegistryOptions;

  constructor(options: RegistryOptions = {}) {
    this.options = options;
  }

  register(def: HelperDefinition) {
    // Validate helper name
    if (!def.name || def.name.trim().length === 0) {
      throw new Error('Helper name is required and cannot be empty');
    }

    // Validate category if provided
    if (def.category && !VALID_HELPER_CATEGORIES.includes(def.category as any)) {
      throw new Error(
        `Invalid helper category "${def.category}". Must be one of: ${VALID_HELPER_CATEGORIES.join(', ')}`
      );
    }

    // Validate function is provided
    if (typeof def.fn !== 'function') {
      throw new Error(`Helper "${def.name}" must have a function (fn)`);
    }

    // Warn if metadata is missing (not an error, just helpful)
    if (!def.id) {
      console.debug(`Helper "${def.name}" has no id, using name as id`);
    }
    if (!def.description) {
      console.debug(`Helper "${def.name}" has no description`);
    }

    // Check for duplicates
    if (this.helpers.has(def.name)) {
      const message = `Helper "${def.name}" already registered`;
      if (this.options.strict) {
        throw new Error(message);
      }
      console.warn(`${message}, overwriting`);
    }

    this.helpers.set(def.name, def);
  }

  get(name: string): HelperDefinition | undefined {
    return this.helpers.get(name);
  }

  getAll(): HelperDefinition[] {
    return Array.from(this.helpers.values());
  }

  getByCategory(category: string): HelperDefinition[] {
    return this.getAll().filter(h => h.category === category);
  }

  /** Execute a helper by name */
  execute(name: string, session: GameSessionDTO, ...args: any[]): any {
    const helper = this.get(name);
    if (!helper) {
      throw new Error(`Unknown session helper: ${name}`);
    }
    return helper.fn(session, ...args);
  }

  /** Generate typed helpers object */
  buildHelpersObject(session: GameSessionDTO): Record<string, (...args: any[]) => any> {
    const obj: Record<string, any> = {};

    for (const [name, def] of this.helpers.entries()) {
      obj[name] = (...args: any[]) => def.fn(session, ...args);
    }

    return obj;
  }
}

export const sessionHelperRegistry = new SessionHelperRegistry();
