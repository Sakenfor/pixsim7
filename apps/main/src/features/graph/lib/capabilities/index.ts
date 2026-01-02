/**
 * Graph Capabilities
 *
 * ContextHub capability integration for the graph feature.
 *
 * @module graph/capabilities
 */

export {
  CAP_GRAPH_ACTIONS,
  createGraphActionsProvider,
  nullGraphActionsContext,
  type GraphActionsContext,
  type GraphNodePosition,
  type InsertNodeOptions,
  type InsertNodeResult,
  type RefValidationResult,
} from './graphCapability';

export { useGraphCapabilityBridge } from './useGraphCapabilityBridge';
