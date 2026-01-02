import { NodeTypeRegistry, type NodeTypeDefinition } from './registry';

export const arcNodeTypeRegistry = new NodeTypeRegistry<NodeTypeDefinition>({
  duplicatePolicy: 'error',
});
