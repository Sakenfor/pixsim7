import type { ArcGraphNode } from '@features/graph/models/arcGraph';

import { NodeTypeRegistry, type NodeTypeDefinition } from './registry';

export type ArcNodeTypeDefinition<TData = Record<string, unknown>, TRuntime = unknown> = NodeTypeDefinition<
  TData,
  ArcGraphNode,
  TRuntime
>;

export const arcNodeTypeRegistry = new NodeTypeRegistry<ArcNodeTypeDefinition>({
  duplicatePolicy: 'error',
});
