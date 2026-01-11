/**
 * @pixsim7/shared.graph-core
 *
 * Node type registry and registrars for scene/arc graphs.
 * This package contains runtime code for node type management.
 * Pure types are available in @pixsim7/shared.types.
 */

// Node Type Registry (class and global instance)
export {
  NodeTypeRegistry,
  nodeTypeRegistry,
  type NodeTypeDefinition,
  type NodeTypeRegistryOptions,
  type PortDefinition,
  type PortConfig,
} from './nodeTypeRegistry';

// Built-in Node Types Registration
export { registerBuiltinNodeTypes } from './builtinNodeTypes';

// Arc Node Types Registration
export { registerArcNodeTypes } from './arcNodeTypes';

// Intimacy Node Types Registration
export {
  registerIntimacyNodeTypes,
  getIntimacyNodeTypeIds,
  isIntimacyNodeType,
} from './intimacyNodeTypes';

// NPC Response Node Types
export {
  registerNpcResponseNode,
  RESPONSE_TEMPLATES,
  type ResponseGraphNode,
  type ResponseGraphConnection,
  type ResponseNodeType,
  type NpcResponseMetadata,
  type ResponseGraphTemplate,
} from './npcResponseNode';
