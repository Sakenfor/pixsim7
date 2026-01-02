import type { DraftSceneNode } from '@domain/sceneBuilder';
import type { Scene } from '@shared/types';

import { NodeTypeRegistry, type NodeTypeDefinition } from './registry';

export type SceneRuntimeNode = Scene['nodes'][number];

export type SceneNodeTypeDefinition<TData = Record<string, unknown>> = NodeTypeDefinition<
  TData,
  DraftSceneNode,
  SceneRuntimeNode
>;

export const sceneNodeTypeRegistry = new NodeTypeRegistry<SceneNodeTypeDefinition>({
  duplicatePolicy: 'error',
});

// Compatibility alias for existing imports
export const nodeTypeRegistry = sceneNodeTypeRegistry;
