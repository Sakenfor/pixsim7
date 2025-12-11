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
export { ArcNodeRenderer } from './components/graph/ArcNodeRenderer';
export { ChoiceNodeRenderer } from './components/graph/ChoiceNodeRenderer';
export { DefaultNodeRenderer } from './components/graph/DefaultNodeRenderer';
export { IntimacyGenerationNodeRenderer } from './components/graph/IntimacyGenerationNodeRenderer';
export { IntimacySceneNodeRenderer } from './components/graph/IntimacySceneNodeRenderer';
export { MilestoneNodeRenderer } from './components/graph/MilestoneNodeRenderer';
export { ProgressionStageNodeRenderer } from './components/graph/ProgressionStageNodeRenderer';
export { QuestNodeRenderer } from './components/graph/QuestNodeRenderer';
export { QuestTriggerRenderer } from './components/graph/QuestTriggerRenderer';
export { RelationshipGateNodeRenderer } from './components/graph/RelationshipGateNodeRenderer';
export { SeductionNodeRenderer } from './components/graph/SeductionNodeRenderer';
export { VideoNodeRenderer } from './components/graph/VideoNodeRenderer';

// Components - Arc Graph
export { ArcGraphPanel } from './components/arc-graph/ArcGraphPanel';

// Components - Character Graph
export { CharacterGraphBrowser } from './components/character-graph/CharacterGraphBrowser';
export { SceneCharacterViewer } from './components/character-graph/SceneCharacterViewer';

// Components - Nodes
export { ArcNode } from './components/nodes/ArcNode';
export { NodeGroup } from './components/nodes/NodeGroup';
export { NodePalette } from './components/nodes/NodePalette';
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
