/**
 * Node Type Registry
 * Allows dynamic registration of custom node types without modifying core types
 */

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
}

export class NodeTypeRegistry {
  private types = new Map<string, NodeTypeDefinition>();

  /** Register a node type */
  register<TData = any>(def: NodeTypeDefinition<TData>) {
    if (this.types.has(def.id)) {
      console.warn(`Node type ${def.id} already registered, overwriting`);
    }
    this.types.set(def.id, def);
  }

  /** Get node type definition */
  get(id: string): NodeTypeDefinition | undefined {
    return this.types.get(id);
  }

  /** Get all registered types */
  getAll(): NodeTypeDefinition[] {
    return Array.from(this.types.values());
  }

  /** Get types by category */
  getByCategory(category: string): NodeTypeDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  /** Get user-creatable types */
  getUserCreatable(): NodeTypeDefinition[] {
    return this.getAll().filter(t => t.userCreatable !== false);
  }

  /** Check if type exists */
  has(id: string): boolean {
    return this.types.has(id);
  }
}

/** Global registry instance */
export const nodeTypeRegistry = new NodeTypeRegistry();
