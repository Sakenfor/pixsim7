/**
 * Arc/Quest Graph Types
 *
 * Represents a higher-level graph that sits above the scene graph.
 * Arc nodes represent story beats/stages and reference scene IDs.
 * Quest nodes represent quest objectives and branches.
 */

/**
 * Relationship tier requirement
 */
export interface RelationshipRequirement {
  characterId: string;
  minAffinity?: number;
  maxAffinity?: number;
  minTrust?: number;
  maxTrust?: number;
  requiredFlags?: string[];
}

/**
 * Quest flag requirement
 */
export interface QuestFlagRequirement {
  questId: string;
  status?: 'not_started' | 'in_progress' | 'completed' | 'failed';
  minSteps?: number;
}

/**
 * Base data for all arc graph nodes
 */
export interface BaseArcNodeData {
  id: string;
  type: 'arc' | 'quest' | 'milestone' | 'arc_group';
  label: string;
  description?: string;
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

/**
 * Arc node - represents a story beat/stage
 */
export interface ArcNodeData extends BaseArcNodeData {
  type: 'arc';
  arcId: string;  // Reference to arc in session.flags.arcs
  stage?: number;  // Which stage this node represents
  sceneId?: string;  // Optional reference to a scene
  relationshipRequirements?: RelationshipRequirement[];
  questRequirements?: QuestFlagRequirement[];
  requiredFlags?: string[];  // Generic flag requirements
  color?: string;
  icon?: string;
}

/**
 * Quest node - represents a quest objective or branch
 */
export interface QuestNodeData extends BaseArcNodeData {
  type: 'quest';
  questId: string;  // Reference to quest in session.flags.quests
  sceneId?: string;  // Scene that starts/advances this quest
  objectiveIds?: string[];  // Quest objectives tracked
  relationshipRequirements?: RelationshipRequirement[];
  questRequirements?: QuestFlagRequirement[];
  color?: string;
  icon?: string;
}

/**
 * Milestone node - represents a major story checkpoint
 */
export interface MilestoneNodeData extends BaseArcNodeData {
  type: 'milestone';
  milestoneId: string;
  sceneId?: string;
  requiredArcs?: Array<{ arcId: string; minStage: number }>;
  requiredQuests?: Array<{ questId: string; status: 'completed' }>;
  color?: string;
  icon?: string;
}

/**
 * Arc Group - organizational container for arc nodes
 */
export interface ArcGroupNodeData extends BaseArcNodeData {
  type: 'arc_group';
  childNodeIds: string[];
  collapsed: boolean;
  color?: string;
  width?: number;
  height?: number;
  zoomLevel?: number;
}

/**
 * Union type for all arc graph nodes
 */
export type ArcGraphNode = ArcNodeData | QuestNodeData | MilestoneNodeData | ArcGroupNodeData;

/**
 * Arc graph edge - connection between arc nodes
 */
export interface ArcGraphEdge {
  id: string;
  from: string;  // source node ID
  to: string;    // target node ID
  label?: string;
  conditions?: Array<{
    type: 'relationship' | 'quest' | 'flag' | 'arc_stage';
    data: unknown;
  }>;
  meta?: {
    fromPort?: string;
    toPort?: string;
    color?: string;
    style?: 'solid' | 'dashed' | 'dotted';
  };
}

/**
 * Arc graph - collection of arc nodes and edges
 */
export interface ArcGraph {
  id: string;
  title: string;
  description?: string;
  nodes: ArcGraphNode[];
  edges: ArcGraphEdge[];
  startNodeId?: string;
  metadata?: Record<string, unknown>;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Type guards
 */
export function isArcNode(node: ArcGraphNode): node is ArcNodeData {
  return node.type === 'arc';
}

export function isQuestNode(node: ArcGraphNode): node is QuestNodeData {
  return node.type === 'quest';
}

export function isMilestoneNode(node: ArcGraphNode): node is MilestoneNodeData {
  return node.type === 'milestone';
}

export function isArcGroupNode(node: ArcGraphNode): node is ArcGroupNodeData {
  return node.type === 'arc_group';
}
