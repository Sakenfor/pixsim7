import { nodeTypeRegistry } from './registry';

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
  nodeTypeRegistry.register({
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
  });

  // Quest node - represents quest objective or branch
  nodeTypeRegistry.register({
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
  });

  // Milestone node - represents major story checkpoint
  nodeTypeRegistry.register({
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
  });

  // Arc Group - organizational container for arc nodes
  nodeTypeRegistry.register({
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
