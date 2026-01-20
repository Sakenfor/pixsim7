import type { Scene } from '@pixsim7/shared.types';

import type { DraftSceneNode } from '@domain/sceneBuilder';

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
