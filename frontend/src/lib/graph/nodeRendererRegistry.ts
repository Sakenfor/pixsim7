import type { ComponentType } from 'react';
import type { DraftSceneNode } from '../../modules/scene-builder';

export interface NodeRendererProps {
  node: DraftSceneNode;
  isSelected: boolean;
  isStart: boolean;
  hasErrors: boolean;
}

export interface NodeRenderer {
  /** Node type this renders */
  nodeType: string;

  /** Render component for node body content */
  component: ComponentType<NodeRendererProps>;

  /** Default size hint (used by layout algorithms) */
  defaultSize?: { width: number; height: number };

  /** Whether to use custom header (if false, uses default header) */
  customHeader?: boolean;
}

export class NodeRendererRegistry {
  private renderers = new Map<string, NodeRenderer>();

  /** Register a node renderer */
  register(renderer: NodeRenderer) {
    if (this.renderers.has(renderer.nodeType)) {
      console.warn(`Node renderer for ${renderer.nodeType} already registered, overwriting`);
    }
    this.renderers.set(renderer.nodeType, renderer);
  }

  /** Get renderer for a node type */
  get(nodeType: string): NodeRenderer | undefined {
    return this.renderers.get(nodeType);
  }

  /** Check if renderer exists for a node type */
  has(nodeType: string): boolean {
    return this.renderers.has(nodeType);
  }

  /** Get renderer or fallback to default */
  getOrDefault(nodeType: string): NodeRenderer {
    return this.get(nodeType) ?? this.get('default')!;
  }

  /** Get all registered renderers */
  getAll(): NodeRenderer[] {
    return Array.from(this.renderers.values());
  }
}

/** Global renderer registry instance */
export const nodeRendererRegistry = new NodeRendererRegistry();
