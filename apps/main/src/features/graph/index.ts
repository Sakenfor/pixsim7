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

// Lib - Editor Core APIs (explicit - these are the main APIs)
export { graphEditorRegistry, type GraphEditorDefinition } from './lib/editor/editorRegistry';
export { nodeRendererRegistry, type NodeRendererDefinition } from './lib/editor/nodeRendererRegistry';
export { useTemplateAnalyticsStore } from './lib/editor/templateAnalyticsStore';
export { useTemplateStore } from './lib/editor/templatesStore';
export { graphClipboard } from './lib/editor/clipboard';

// Lib - Editor Utilities (wildcard - many helper functions)
export * from './lib/editor/graphTemplates';
export * from './lib/editor/types';

// Lib - Graph Builders
export * from './lib/builders/actionGraphBuilder';
export * from './lib/builders/promptGraphBuilder';

// Lib - Node Types (from @shared/types migration)
export * from './lib/nodeTypes/npcResponse';
export * from './lib/nodeTypes/registry';
export * from './lib/nodeTypes/arc';
export * from './lib/nodeTypes/builtin';

// Namespace export for node types
export * as NodeTypes from './lib/nodeTypes/registry';
