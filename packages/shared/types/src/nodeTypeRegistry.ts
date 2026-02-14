/**
 * Node Type Registry Types
 * Pure type definitions shared between runtime registries and type-only consumers.
 */

/**
 * Port definition for a single input or output port
 */
export interface PortDefinition {
  id: string;
  label: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  color?: string;
  required?: boolean;
  description?: string;
}

/**
 * Port configuration for custom node types
 * Allows node types to define their own input/output ports
 */
export interface PortConfig {
  /** Input port definitions */
  inputs?: PortDefinition[];

  /** Output port definitions */
  outputs?: PortDefinition[];

  /**
   * Dynamic port generator function
   * Allows ports to be generated based on node data/metadata
   *
   * @example
   * dynamic: (node) => ({
   *   inputs: [{ id: 'input', label: 'In', position: 'top', color: '#3b82f6' }],
   *   outputs: [{ id: 'output', label: 'Out', position: 'bottom', color: '#10b981' }]
   * })
   */
  dynamic?: (nodeData: any) => {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
  };
}

export interface NodeTypeDefinition<TData = any> {
  /** Unique node type ID */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description?: string;

  /** Icon/emoji */
  icon?: string;

  /** Category for grouping in UI */
  category?: 'media' | 'flow' | 'logic' | 'action' | 'custom';

  /** Scope for multi-level graph organization */
  scope?: 'scene' | 'arc' | 'world' | 'custom';

  /** Default data when creating new node */
  defaultData: Partial<TData>;

  /** JSON schema for validation (optional) */
  schema?: Record<string, any>;

  /** Editor component (registered separately in frontend) */
  editorComponent?: string; // Component name for lazy loading

  /** Renderer component for graph view */
  rendererComponent?: string;

  /** Custom validation */
  validate?: (data: TData) => string | null;

  /** Whether this node can be added via UI */
  userCreatable?: boolean;

  /** UI styling hints */
  color?: string;
  bgColor?: string;

  /** Port configuration for this node type */
  ports?: PortConfig;

  /** Lazy loading: function to load the definition on demand */
  loader?: () => Promise<NodeTypeDefinition<TData>>;

  /** Priority for preloading (higher = load sooner) */
  preloadPriority?: number;

  /** Settings schema for per-node-type user preferences */
  settingsSchema?: NodeSettingsSchema;
}

// ===================
// Node Settings Schema Types
// ===================

/** A single setting field within a node settings group */
export interface NodeSettingField {
  key: string;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'number' | 'text' | 'range';
  /** Options for 'select' type */
  options?: Array<{ value: string; label: string }>;
  /** Range/number constraints */
  min?: number;
  max?: number;
  step?: number;
  /** Text field config */
  placeholder?: string;
  maxLength?: number;
  /** Custom display formatter for range/number values */
  format?: (value: number) => string;
}

/** A group of related settings displayed together */
export interface NodeSettingsGroup {
  id: string;
  title?: string;
  description?: string;
  fields: NodeSettingField[];
}

/** Complete settings schema for a node type */
export interface NodeSettingsSchema {
  defaults: Record<string, unknown>;
  groups: NodeSettingsGroup[];
}

export interface NodeTypeRegistryOptions {
  /** How to handle duplicate registrations */
  duplicatePolicy?: 'warn' | 'error';
}
