/**
 * Graph Feature
 *
 * Scene graph editing, arc/quest graphs, character graphs, and lineage visualization.
 * Includes node renderers, graph surfaces, templates, and Zustand stores for state management.
 */

// Components - Graph Editor
export { GraphEditorHost } from './components/graph/GraphEditorHost';
export { ActionBlockGraphSurface } from './components/graph/ActionBlockGraphSurface';
export { PromptBlockGraphSurface } from './components/graph/PromptBlockGraphSurface';
export { GraphTemplatePalette } from './components/graph/GraphTemplatePalette';
export { TemplateWizardDialog } from './components/graph/TemplateWizardDialog';
export { TemplateWizardPalette } from './components/graph/TemplateWizardPalette';
export { GraphCubeExpansion } from './components/graph/GraphCubeExpansion';

// Components - Node Renderers
export { default as ArcNodeRenderer } from './components/graph/ArcNodeRenderer';
export { default as ChoiceNodeRenderer } from './components/graph/ChoiceNodeRenderer';
export { default as DefaultNodeRenderer } from './components/graph/DefaultNodeRenderer';
export { default as IntimacyGenerationNodeRenderer } from './components/graph/IntimacyGenerationNodeRenderer';
export { default as IntimacySceneNodeRenderer } from './components/graph/IntimacySceneNodeRenderer';
export { default as MilestoneNodeRenderer } from './components/graph/MilestoneNodeRenderer';
export { default as ProgressionStageNodeRenderer } from './components/graph/ProgressionStageNodeRenderer';
export { default as QuestNodeRenderer } from './components/graph/QuestNodeRenderer';
export { default as QuestTriggerRenderer } from './components/graph/QuestTriggerRenderer';
export { default as RelationshipGateNodeRenderer } from './components/graph/RelationshipGateNodeRenderer';
export { default as SeductionNodeRenderer } from './components/graph/SeductionNodeRenderer';
export { default as VideoNodeRenderer } from './components/graph/VideoNodeRenderer';

// Components - Arc Graph
export { ArcGraphPanel } from './components/arc-graph/ArcGraphPanel';

// Components - Character Graph
export { CharacterGraphBrowser } from './components/character-graph/CharacterGraphBrowser';
export { SceneCharacterViewer } from './components/character-graph/SceneCharacterViewer';

// Components - Nodes
export { ArcNode } from './components/nodes/ArcNode';
export { NodeGroup } from './components/nodes/NodeGroup';
export { NodePalette, type NodeType } from './components/nodes/NodePalette';
export { SceneNode } from './components/nodes/SceneNode';

// Stores - Graph Store
export {
  useGraphStore,
  useGraphStoreUndo,
  useGraphStoreRedo,
  useGraphStoreCanUndo,
  useGraphStoreCanRedo
} from './stores/graphStore';
export type { GraphState, NodeGroupManagementState, NavigationState } from './stores/graphStore';

// Stores - Selection Store
export { useSelectionStore } from './stores/selectionStore';

// Stores - Arc Graph Store
export {
  useArcGraphStore,
  useArcGraphStoreUndo,
  useArcGraphStoreRedo,
  useArcGraphStoreCanUndo,
  useArcGraphStoreCanRedo
} from './stores/arcGraphStore';
export type { ArcGraphState } from './stores/arcGraphStore';

// Hooks
export { useLineageGraph } from './hooks/useLineageGraph';
export { useSceneValidation, useNodeValidation, type IndexedValidationResult } from './hooks/useSceneValidation';
export { type ValidationContextValue, type NodeValidation } from './hooks/validationTypes';
export { ValidationProvider } from './hooks/ValidationContext';
export { useValidationContext, useValidationContextOptional } from './hooks/useValidationContext';

// Store Selectors
export {
  selectCurrentScene,
  selectCurrentSceneId,
  selectScenes,
  selectSceneCount,
  selectCurrentNodes,
  selectCurrentEdges,
  selectNodeCount,
  selectEdgeCount,
  selectNodeActions,
  selectSceneActions,
  selectNodeGroupActions,
  selectNavigationActions,
  selectGraphStats,
  actionsEqual,
} from './stores/graphStore/selectors';

// Lib - Editor Core APIs (explicit - these are the main APIs)
export { graphEditorRegistry, graphEditorSelectors } from './lib/editor/registry';
export type {
  GraphEditorId,
  GraphEditorComponent,
  GraphEditorDefinition,
} from './lib/editor/types';
export {
  nodeRendererRegistry,
  sceneNodeRendererRegistry,
  arcNodeRendererRegistry,
  type NodeRenderer,
  type NodeRendererRegistry,
  type SceneNodeRendererProps,
  type ArcNodeRendererProps,
} from './lib/editor/nodeRendererRegistry';
export { useTemplateAnalyticsStore } from './stores/templateAnalyticsStore';
export type { TemplateUsageStats, RefactoringHint } from './stores/templateAnalyticsStore';
export { useTemplateStore } from './stores/templatesStore';
export { graphClipboard } from './lib/editor/clipboard';

// Lib - Editor Utilities
export type {
  TemplateSource,
  TemplateCategory,
  TemplateParameter,
  GraphTemplate,
  TemplatePack,
  TemplatePackExport,
  TemplatePreconditions,
  TemplateSelection,
  CaptureTemplateMetadata,
  ApplyTemplateOptions,
  ApplyTemplateResult,
} from './lib/editor/graphTemplates';
export {
  captureTemplate,
  applyTemplate,
  validateTemplate,
  validatePreconditions,
  generateTemplatePreview,
  exportTemplatePack,
  importTemplatePack,
  downloadTemplatePack,
} from './lib/editor/graphTemplates';

// Lib - Graph Builders
export type { BuildActionGraphOptions } from './lib/builders/actionGraphBuilder';
export {
  buildActionBlockGraph,
  getNodeColorByComplexity,
  getCompositeNodeStyle,
  getActionEdgeStyle,
} from './lib/builders/actionGraphBuilder';
export type { BuildPromptGraphOptions } from './lib/builders/promptGraphBuilder';
export {
  buildPromptCandidateGraph,
  getNodeColorByRole,
  getEdgeStyle,
} from './lib/builders/promptGraphBuilder';

// Lib - Node Types (from @pixsim7/shared.types migration)
export type {
  ResponseGraphNode,
  ResponseGraphConnection,
  ResponseNodeType,
  NpcResponseMetadata,
  ResponseGraphTemplate,
} from './lib/nodeTypes/npcResponse';
export {
  RESPONSE_TEMPLATES,
  registerNpcResponseNode,
} from './lib/nodeTypes/npcResponse';
export type {
  PortDefinition,
  PortConfig,
  NodeTypeDefinition,
  NodeTypeRegistryOptions,
} from './lib/nodeTypes/registry';
export {
  NodeTypeRegistry,
  createNodeTypeRegistry,
} from './lib/nodeTypes/registry';
export type {
  SceneRuntimeNode,
  SceneNodeTypeDefinition,
} from './lib/nodeTypes/sceneRegistry';
export {
  sceneNodeTypeRegistry,
  nodeTypeRegistry,
} from './lib/nodeTypes/sceneRegistry';
export type { ArcNodeTypeDefinition } from './lib/nodeTypes/arcRegistry';
export { arcNodeTypeRegistry } from './lib/nodeTypes/arcRegistry';
export type {
  ArcNodeMetadata,
  QuestNodeMetadata,
  MilestoneNodeMetadata,
} from './lib/nodeTypes/arc';
export { registerArcNodeTypes } from './lib/nodeTypes/arc';
export { registerBuiltinNodeTypes } from './lib/nodeTypes/builtin';

// Namespace export for node types
export * as NodeTypes from './lib/nodeTypes/registry';

// Lib - Refs (canonical IDs and ObjectLinks)
export type {
  NormalizeResult,
  NormalizeOptions,
  NpcId,
  CharacterId,
  InstanceId,
  SceneId,
  LocationId,
  AssetId,
  NpcRef,
  CharacterRef,
  InstanceRef,
  SceneIdRef,
  LocationRef,
  AssetRef,
  EntityRef,
  ParsedRef,
  NodeLinkInfo,
  ResolvedLink,
  TemplateRef,
  TemplateKind,
  RuntimeKind,
  SyncDirection,
} from './lib/refs';
export {
  normalizeNpcRef,
  extractNpcIdFromRef,
  normalizeInstanceRef,
  extractInstanceIdFromRef,
  normalizeCharacterRef,
  extractCharacterIdFromRef,
  normalizeSceneRef,
  extractSceneIdFromRef,
  normalizeLocationRef,
  extractLocationIdFromRef,
  normalizeAssetRef,
  extractAssetIdFromRef,
  tryParseEntityRef,
  isAnyEntityRef,
  normalizeRefBatch,
  Ref,
  parseRef,
  isUUID,
  createTemplateRef,
  createNpcLinkInfo,
  createItemLinkInfo,
  createPropLinkInfo,
  resolveLinkInfo,
  extractLinksFromMetadata,
  buildRuntimeTemplateRefs,
  buildRuntimeLinkMap,
  createMappingId,
  createTemplateRefKey,
  parseTemplateRefKey,
} from './lib/refs';

// Lib - Capabilities (ContextHub integration)
export type {
  GraphActionsContext,
  GraphNodePosition,
  InsertNodeOptions,
  InsertNodeResult,
  RefValidationResult,
} from './lib/capabilities';
export {
  CAP_GRAPH_ACTIONS,
  createGraphActionsProvider,
  nullGraphActionsContext,
  useGraphCapabilityBridge,
} from './lib/capabilities';
