import type { SceneIdRef, InstanceRef } from '@pixsim7/shared.types';

import { normalizeSceneRef } from '../refs/graphRefs';

import { arcNodeTypeRegistry } from './arcRegistry';

// ============================================================================
// Arc Node Metadata Types
// ============================================================================

/**
 * Arc node metadata with canonical refs.
 */
export interface ArcNodeMetadata {
  /** Arc identifier */
  arcId?: string;
  /** Story stage/beat number */
  stage?: number;
  /**
   * Scene reference. Supports:
   * - Raw number: 123
   * - String number: "123"
   * - Canonical SceneIdRef: "scene:game:123"
   */
  sceneId?: string | number | SceneIdRef;
  /** Normalized scene ref */
  sceneRef?: SceneIdRef;
  /** Relationship requirements for this arc stage */
  relationshipRequirements?: Array<{
    characterRef?: InstanceRef;
    minLevel?: number;
    type?: string;
  }>;
  /** Quest requirements for this arc stage */
  questRequirements?: string[];
  /** Required flags */
  requiredFlags?: string[];
}

/**
 * Quest node metadata with canonical refs.
 */
export interface QuestNodeMetadata {
  /** Quest identifier */
  questId?: string;
  /** Scene reference */
  sceneId?: string | number | SceneIdRef;
  sceneRef?: SceneIdRef;
  /** Objective IDs in this quest */
  objectiveIds?: string[];
  /** Relationship requirements */
  relationshipRequirements?: Array<{
    characterRef?: InstanceRef;
    minLevel?: number;
    type?: string;
  }>;
  /** Quest requirements (other quests that must be completed) */
  questRequirements?: string[];
}

/**
 * Milestone node metadata with canonical refs.
 */
export interface MilestoneNodeMetadata {
  /** Milestone identifier */
  milestoneId?: string;
  /** Scene reference */
  sceneId?: string | number | SceneIdRef;
  sceneRef?: SceneIdRef;
  /** Required arcs to complete before this milestone */
  requiredArcs?: string[];
  /** Required quests to complete before this milestone */
  requiredQuests?: string[];
}

// Ensure arc node types are only registered once per process
let arcNodeTypesRegistered = false;

/**
 * Register all arc graph node types (idempotent)
 */
export function registerArcNodeTypes() {
  if (arcNodeTypesRegistered) {
    return;
  }
  arcNodeTypesRegistered = true;

  // Arc node - represents story beat/stage
  arcNodeTypeRegistry.register({
    id: 'arc',
    name: 'Arc',
    description: 'Story beat or arc stage',
    icon: '📖',
    category: 'custom',
    scope: 'arc',
    userCreatable: true,
    color: 'text-indigo-700 dark:text-indigo-300',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    defaultData: {
      arcId: '',
      stage: 1,
      sceneId: '',
      relationshipRequirements: [],
      questRequirements: [],
      requiredFlags: [],
    },
    editorComponent: 'ArcNodeEditor',
    rendererComponent: 'ArcNodeRenderer',
    preloadPriority: 4, // Arc-level, moderately important
    toRuntime: (node) => {
      const metadata = node.metadata as ArcNodeMetadata | undefined;
      let sceneRef = metadata?.sceneRef;

      // Normalize scene ID to canonical ref
      if (metadata?.sceneId && !sceneRef) {
        const normalized = normalizeSceneRef(metadata.sceneId);
        if (normalized.success) {
          sceneRef = normalized.ref;
        }
      }

      return {
        nodeType: 'arc_content' as const,
        id: node.id,
        type: node.type,
        label: metadata?.arcId || `Arc Stage ${metadata?.stage ?? 1}`,
        meta: {
          ...node.metadata,
          _refs: { sceneRef },
        },
        arcId: metadata?.arcId,
        stage: metadata?.stage,
        sceneRef,
        relationshipRequirements: metadata?.relationshipRequirements,
        questRequirements: metadata?.questRequirements,
        requiredFlags: metadata?.requiredFlags,
      };
    },
  });

  // Quest node - represents quest objective or branch
  arcNodeTypeRegistry.register({
    id: 'quest',
    name: 'Quest',
    description: 'Quest objective or branch',
    icon: '⚔️',
    category: 'custom',
    scope: 'arc',
    userCreatable: true,
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    defaultData: {
      questId: '',
      sceneId: '',
      objectiveIds: [],
      relationshipRequirements: [],
      questRequirements: [],
    },
    editorComponent: 'QuestNodeEditor',
    rendererComponent: 'QuestNodeRenderer',
    preloadPriority: 4, // Arc-level, moderately important
    toRuntime: (node) => {
      const metadata = node.metadata as QuestNodeMetadata | undefined;
      let sceneRef = metadata?.sceneRef;

      // Normalize scene ID to canonical ref
      if (metadata?.sceneId && !sceneRef) {
        const normalized = normalizeSceneRef(metadata.sceneId);
        if (normalized.success) {
          sceneRef = normalized.ref;
        }
      }

      return {
        nodeType: 'arc_content' as const,
        id: node.id,
        type: node.type,
        label: metadata?.questId || 'Quest',
        meta: {
          ...node.metadata,
          _refs: { sceneRef },
        },
        questId: metadata?.questId,
        sceneRef,
        objectiveIds: metadata?.objectiveIds,
        relationshipRequirements: metadata?.relationshipRequirements,
        questRequirements: metadata?.questRequirements,
      };
    },
  });

  // Milestone node - represents major story checkpoint
  arcNodeTypeRegistry.register({
    id: 'milestone',
    name: 'Milestone',
    description: 'Major story checkpoint',
    icon: '🏆',
    category: 'custom',
    scope: 'arc',
    userCreatable: true,
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    defaultData: {
      milestoneId: '',
      sceneId: '',
      requiredArcs: [],
      requiredQuests: [],
    },
    editorComponent: 'MilestoneNodeEditor',
    rendererComponent: 'MilestoneNodeRenderer',
    preloadPriority: 3, // Arc-level, less common
    toRuntime: (node) => {
      const metadata = node.metadata as MilestoneNodeMetadata | undefined;
      let sceneRef = metadata?.sceneRef;

      // Normalize scene ID to canonical ref
      if (metadata?.sceneId && !sceneRef) {
        const normalized = normalizeSceneRef(metadata.sceneId);
        if (normalized.success) {
          sceneRef = normalized.ref;
        }
      }

      return {
        nodeType: 'arc_content' as const,
        id: node.id,
        type: node.type,
        label: metadata?.milestoneId || 'Milestone',
        meta: {
          ...node.metadata,
          _refs: { sceneRef },
        },
        milestoneId: metadata?.milestoneId,
        sceneRef,
        requiredArcs: metadata?.requiredArcs,
        requiredQuests: metadata?.requiredQuests,
      };
    },
  });

  // Arc Group - organizational container for arc nodes
  arcNodeTypeRegistry.register({
    id: 'arc_group',
    name: 'Arc Group',
    description: 'Visual container for organizing arc nodes',
    icon: '📚',
    category: 'custom',
    scope: 'arc',
    userCreatable: true,
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-100 dark:bg-slate-900/30',
    defaultData: {
      childNodeIds: [],
      collapsed: false,
    },
    editorComponent: 'ArcGroupNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 2, // Organizational, less critical
  });
}
