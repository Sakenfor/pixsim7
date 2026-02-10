
import { sessionHelperRegistry, type HelperDefinition } from '@pixsim7/game.engine';

import type { DevToolDefinition } from '@lib/dev/devtools';
import { devToolRegistry } from '@lib/dev/devtools/devToolRegistry';
import type { DockZoneDefinition } from '@lib/dockview/dockZoneRegistry';
import { nodeTypeRegistry, type SceneNodeTypeDefinition } from '@lib/registries';

import type { BrainToolPlugin } from '@features/brainTools/lib/registry';
import type { GalleryToolPlugin } from '@features/gallery';
import type { GallerySurfaceDefinition } from '@features/gallery';
import type { GizmoSurfaceDefinition } from '@features/gizmos';
import { nodeRendererRegistry, type NodeRenderer } from '@features/graph/lib/editor/nodeRendererRegistry';
import type { GraphEditorDefinition } from '@features/graph/lib/editor/types';
import type { PanelDefinition, PanelGroupDefinition } from '@features/panels';
import type { GenerationUIPlugin } from '@features/providers';
import type { WorldToolPlugin } from '@features/worldTools';

import { interactionRegistry, type InteractionPlugin, type BaseInteractionConfig } from '../game/interactions/types';

import { controlCenterRegistry, type ControlCenterPlugin, type ControlCenterPluginManifest } from './controlCenterPlugin';
import type {
  ActivationState,
  ExtendedPluginMetadata,
  PluginFamily,
  PluginMetadata,
  PluginOrigin,
} from './pluginSystem';
import type { PluginRegistrationSource } from './registration';
import { sceneViewRegistry, type SceneViewPlugin, type SceneViewPluginManifest } from './sceneViewPlugin';

// ============================================================================
// Registration Types
// ============================================================================

export interface PluginRegistrationContext {
  id: string;
  family: PluginFamily;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  activationState?: ActivationState;
  canDisable?: boolean;
  metadata?: Partial<PluginMetadata>;
}

type SceneViewRegistration = {
  manifest: SceneViewPluginManifest;
  plugin: SceneViewPlugin;
};

type ControlCenterRegistration = {
  manifest: ControlCenterPluginManifest;
  plugin: ControlCenterPlugin;
};

type UiPluginRegistration = {
  metadata: ExtendedPluginMetadata<'ui-plugin'>;
  register?: () => void | Promise<void>;
  unregister?: () => void | Promise<void>;
};

// ============================================================================
// Plugin Type Map
// ============================================================================

export interface PluginTypeMap {
  'helper': HelperDefinition;
  'interaction': InteractionPlugin<BaseInteractionConfig>;
  'node-type': SceneNodeTypeDefinition;
  'renderer': NodeRenderer | { nodeType: string; preloadPriority?: number };
  'world-tool': WorldToolPlugin;
  'gallery-tool': GalleryToolPlugin;
  'brain-tool': BrainToolPlugin;
  'gallery-surface': GallerySurfaceDefinition;
  'generation-ui': GenerationUIPlugin;
  'graph-editor': GraphEditorDefinition;
  'dev-tool': DevToolDefinition;
  'workspace-panel': PanelDefinition;
  'dock-widget': DockZoneDefinition;
  'gizmo-surface': GizmoSurfaceDefinition;
  'scene-view': SceneViewRegistration;
  'control-center': ControlCenterRegistration;
  'ui-plugin': UiPluginRegistration;
  'panel-group': PanelGroupDefinition;
}

// ============================================================================
// Adapter Interface
// ============================================================================

export interface PluginFamilyAdapter<F extends PluginFamily = PluginFamily> {
  register: (plugin: PluginTypeMap[F], context: PluginRegistrationContext) => void | Promise<void>;
  unregister?: (id: string, context: PluginRegistrationContext) => void | Promise<void>;
  buildMetadata: (plugin: PluginTypeMap[F], context: PluginRegistrationContext) => ExtendedPluginMetadata<F>;
}

// ============================================================================
// Shared Helpers
// ============================================================================

function resolveActivationState(context: PluginRegistrationContext): ActivationState {
  return context.activationState ?? 'active';
}

function resolveCanDisable(context: PluginRegistrationContext): boolean {
  if (context.canDisable !== undefined) {
    return context.canDisable;
  }
  return context.origin !== 'builtin';
}

function extractCommonMetadata(plugin: {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
}): Partial<PluginMetadata> {
  return {
    id: plugin.id,
    name: plugin.name || plugin.id,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    tags: plugin.tags,
  };
}

function buildBaseMetadata<F extends PluginFamily>(
  family: F,
  plugin: { id?: string; name?: string; description?: string; version?: string; author?: string; tags?: string[] },
  context: PluginRegistrationContext,
): ExtendedPluginMetadata<F> {
  return {
    ...extractCommonMetadata(plugin),
    id: plugin.id ?? context.id,
    name: plugin.name || plugin.id || context.id,
    family,
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    ...context.metadata,
  } as ExtendedPluginMetadata<F>;
}

// ============================================================================
// Family-Specific Metadata Builders
// ============================================================================

function buildHelperMetadata(
  helper: HelperDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'helper'> {
  const capabilities: PluginMetadata['capabilities'] = {
    modifiesSession: true,
  };

  if (helper.category === 'inventory') {
    capabilities.modifiesInventory = true;
  } else if (helper.category === 'relationships') {
    capabilities.modifiesRelationships = true;
  } else if (helper.category === 'events') {
    capabilities.triggersEvents = true;
  }

  return {
    ...buildBaseMetadata('helper', helper, context),
    id: helper.id || helper.name,
    name: helper.name || helper.id || 'unknown',
    category: helper.category,
    capabilities,
    consumesFeatures: ['game'],
  } as ExtendedPluginMetadata<'helper'>;
}

function buildInteractionMetadata(
  interaction: InteractionPlugin<BaseInteractionConfig>,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'interaction'> {
  const capabilities: PluginMetadata['capabilities'] = {
    modifiesSession: true,
  };

  if (interaction.capabilities) {
    capabilities.opensDialogue = interaction.capabilities.opensDialogue;
    capabilities.triggersEvents = interaction.capabilities.triggersEvents;
    capabilities.modifiesRelationships = interaction.capabilities.affectsRelationship;
    capabilities.modifiesInventory = interaction.capabilities.modifiesInventory;
    capabilities.hasRisk = interaction.capabilities.hasRisk;
    capabilities.requiresItems = interaction.capabilities.requiresItems;
    capabilities.consumesItems = interaction.capabilities.consumesItems;
    capabilities.canBeDetected = interaction.capabilities.canBeDetected;
  }

  return {
    ...buildBaseMetadata('interaction', interaction, context),
    category: interaction.category,
    icon: interaction.icon,
    capabilities,
    consumesFeatures: ['game'],
  } as ExtendedPluginMetadata<'interaction'>;
}

function buildNodeTypeMetadata(
  nodeType: SceneNodeTypeDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'node-type'> {
  return {
    ...buildBaseMetadata('node-type', nodeType, context),
    category: nodeType.category,
    scope: nodeType.scope,
    userCreatable: nodeType.userCreatable,
    preloadPriority: nodeType.preloadPriority,
    capabilities: { addsNodeTypes: true },
    consumesFeatures: ['graph', 'game'],
    providesFeatures: ['node-types'],
  } as ExtendedPluginMetadata<'node-type'>;
}

function buildRendererMetadata(
  renderer: { nodeType: string; preloadPriority?: number },
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'renderer'> {
  return {
    ...buildBaseMetadata('renderer', {}, context),
    id: `renderer:${renderer.nodeType}`,
    name: `Renderer: ${renderer.nodeType}`,
    nodeType: renderer.nodeType,
    preloadPriority: renderer.preloadPriority,
  } as ExtendedPluginMetadata<'renderer'>;
}

function buildWorldToolMetadata(
  tool: WorldToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'world-tool'> {
  return {
    ...buildBaseMetadata('world-tool', tool, context),
    category: tool.category,
    icon: tool.icon,
    capabilities: { addsUIOverlay: true },
  } as ExtendedPluginMetadata<'world-tool'>;
}

function buildGalleryToolMetadata(
  tool: GalleryToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gallery-tool'> {
  const consumesFeatures = ['assets'];
  const providesFeatures: string[] = [];

  if (tool.category === 'visualization') {
    providesFeatures.push('gallery-visualization');
  } else if (tool.category === 'automation') {
    providesFeatures.push('gallery-automation');
  } else if (tool.category === 'analysis') {
    providesFeatures.push('gallery-analysis');
  } else if (tool.category === 'utility') {
    providesFeatures.push('gallery-utility');
  }

  return {
    ...buildBaseMetadata('gallery-tool', tool, context),
    category: tool.category,
    capabilities: { addsGalleryTools: true },
    consumesFeatures,
    providesFeatures: providesFeatures.length > 0 ? providesFeatures : undefined,
  } as ExtendedPluginMetadata<'gallery-tool'>;
}

function buildBrainToolMetadata(
  tool: BrainToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'brain-tool'> {
  return {
    ...buildBaseMetadata('brain-tool', tool, context),
    category: tool.category,
    icon: tool.icon,
  } as ExtendedPluginMetadata<'brain-tool'>;
}

function buildGallerySurfaceMetadata(
  surface: GallerySurfaceDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gallery-surface'> {
  return {
    ...buildBaseMetadata('gallery-surface', { id: surface.id, description: surface.description }, context),
    name: surface.label || surface.id,
    category: surface.category,
    icon: surface.icon,
  } as ExtendedPluginMetadata<'gallery-surface'>;
}

function buildGenerationUIMetadata(
  plugin: GenerationUIPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'generation-ui'> {
  const providesFeatures = ['generation-ui'];
  if (plugin.providerId) {
    providesFeatures.push(`generation-ui-${plugin.providerId}`);
  }

  return {
    ...buildBaseMetadata('generation-ui', {
      id: plugin.id,
      name: plugin.metadata?.name ?? plugin.id,
      description: plugin.metadata?.description,
      version: plugin.metadata?.version,
      tags: plugin.operations,
    }, context),
    providerId: plugin.providerId,
    operations: plugin.operations,
    priority: plugin.priority,
    category: plugin.metadata?.name ? 'provider' : undefined,
    providesFeatures,
  } as ExtendedPluginMetadata<'generation-ui'>;
}

function buildGraphEditorMetadata(
  editor: GraphEditorDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'graph-editor'> {
  return {
    ...buildBaseMetadata('graph-editor', { id: editor.id }, context),
    name: editor.label || editor.id,
    category: editor.category,
    storeId: editor.storeId,
    supportsMultiScene: editor.supportsMultiScene,
    supportsWorldContext: editor.supportsWorldContext,
    supportsPlayback: editor.supportsPlayback,
  } as ExtendedPluginMetadata<'graph-editor'>;
}

function buildDevToolMetadata(
  tool: DevToolDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'dev-tool'> {
  return {
    ...buildBaseMetadata('dev-tool', { id: tool.id, description: tool.description }, context),
    name: tool.label || tool.id,
    category: tool.category,
    icon: tool.icon,
  } as ExtendedPluginMetadata<'dev-tool'>;
}

function buildPanelMetadata(
  panel: PanelDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'workspace-panel'> {
  return {
    ...buildBaseMetadata('workspace-panel', { id: panel.id, description: panel.description, tags: panel.tags }, context),
    name: panel.title || panel.id,
    panelId: panel.id,
    category: panel.category,
    supportsCompactMode: panel.supportsCompactMode,
    supportsMultipleInstances: panel.supportsMultipleInstances,
  } as ExtendedPluginMetadata<'workspace-panel'>;
}

function buildDockWidgetMetadata(
  widget: DockZoneDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'dock-widget'> {
  return {
    ...buildBaseMetadata('dock-widget', { id: widget.id, description: widget.description }, context),
    name: widget.label || widget.id,
    widgetId: widget.id,
    dockviewId: widget.dockviewId,
    presetScope: widget.presetScope,
    panelScope: widget.panelScope,
    storageKey: widget.storageKey,
    allowedPanels: widget.allowedPanels,
    defaultPanels: widget.defaultPanels,
  } as ExtendedPluginMetadata<'dock-widget'>;
}

function buildGizmoSurfaceMetadata(
  surface: GizmoSurfaceDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gizmo-surface'> {
  return {
    ...buildBaseMetadata('gizmo-surface', { id: surface.id, description: surface.description }, context),
    name: surface.label || surface.id,
    gizmoSurfaceId: surface.id,
    category: surface.category,
    icon: surface.icon,
  } as ExtendedPluginMetadata<'gizmo-surface'>;
}

function buildPanelGroupMetadata(
  group: PanelGroupDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'panel-group'> {
  const slotNames = Object.keys(group.panels);
  const presetNames = Object.keys(group.presets);

  return {
    ...buildBaseMetadata('panel-group', { id: group.id, description: group.description, tags: group.tags }, context),
    name: group.title || group.id,
    groupId: group.id,
    category: group.category,
    icon: group.icon,
    slots: slotNames,
    presets: presetNames,
    defaultScopes: group.defaultScopes,
  } as ExtendedPluginMetadata<'panel-group'>;
}

function buildSceneViewMetadata(
  entry: SceneViewRegistration,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'scene-view'> {
  const manifest = entry.manifest;
  const capabilities: PluginMetadata['capabilities'] = { addsUIOverlay: true };
  const providesFeatures = ['ui-overlay', 'scene-view'];
  const consumesFeatures = ['workspace'];

  if (manifest.permissions?.includes('read:session')) {
    consumesFeatures.push('game');
  }

  return {
    ...buildBaseMetadata('scene-view', {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
    }, context),
    sceneViewId: manifest.sceneView.id,
    surfaces: manifest.sceneView.surfaces,
    default: manifest.sceneView.default,
    icon: manifest.icon,
    capabilities,
    providesFeatures,
    consumesFeatures,
  } as ExtendedPluginMetadata<'scene-view'>;
}

function buildControlCenterMetadata(
  entry: ControlCenterRegistration,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'control-center'> {
  const manifest = entry.manifest;
  const capabilities: PluginMetadata['capabilities'] = { addsUIOverlay: true };
  const providesFeatures = ['ui-overlay', 'control-center'];
  const consumesFeatures = ['assets', 'workspace', 'generation'];
  const consumesActions = ['workspace.open-panel', 'generation.quick-generate'];
  const consumesState = ['workspace.panels'];

  return {
    ...buildBaseMetadata('control-center', {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
    }, context),
    controlCenterId: manifest.controlCenter.id,
    displayName: manifest.controlCenter.displayName,
    features: manifest.controlCenter.features,
    preview: manifest.controlCenter.preview,
    default: manifest.controlCenter.default,
    icon: manifest.icon,
    capabilities,
    providesFeatures,
    consumesFeatures,
    consumesActions,
    consumesState,
  } as ExtendedPluginMetadata<'control-center'>;
}

function buildUiPluginMetadata(
  entry: UiPluginRegistration
): ExtendedPluginMetadata<'ui-plugin'> {
  return entry.metadata;
}

// ============================================================================
// Family Adapter Registry
// ============================================================================

export const familyAdapters: Record<PluginFamily, PluginFamilyAdapter> = {
  'helper': {
    register: (helper: HelperDefinition) => sessionHelperRegistry.register(helper),
    buildMetadata: buildHelperMetadata,
  },
  'interaction': {
    register: (interaction: InteractionPlugin<BaseInteractionConfig>) =>
      interactionRegistry.register(interaction),
    buildMetadata: buildInteractionMetadata,
  },
  'node-type': {
    register: (nodeType: SceneNodeTypeDefinition) => nodeTypeRegistry.register(nodeType),
    buildMetadata: buildNodeTypeMetadata,
  },
  'renderer': {
    register: (renderer: NodeRenderer) => nodeRendererRegistry.register(renderer),
    buildMetadata: buildRendererMetadata,
  },
  'world-tool': {
    register: () => {},
    buildMetadata: buildWorldToolMetadata,
  },
  'gallery-tool': {
    register: () => {},
    buildMetadata: buildGalleryToolMetadata,
  },
  'brain-tool': {
    register: () => {},
    buildMetadata: buildBrainToolMetadata,
  },
  'gallery-surface': {
    register: () => {},
    buildMetadata: buildGallerySurfaceMetadata,
  },
  'generation-ui': {
    register: () => {},
    buildMetadata: buildGenerationUIMetadata,
  },
  'graph-editor': {
    register: () => {},
    buildMetadata: buildGraphEditorMetadata,
  },
  'dev-tool': {
    register: (tool: DevToolDefinition) => {
      devToolRegistry.register(tool);
    },
    buildMetadata: buildDevToolMetadata,
  },
  'workspace-panel': {
    register: () => {},
    buildMetadata: buildPanelMetadata,
  },
  'dock-widget': {
    register: () => {},
    buildMetadata: buildDockWidgetMetadata,
  },
  'gizmo-surface': {
    register: () => {},
    buildMetadata: buildGizmoSurfaceMetadata,
  },
  'scene-view': {
    register: (entry: SceneViewRegistration, context: PluginRegistrationContext) => {
      sceneViewRegistry.register(entry.manifest, entry.plugin, { origin: context.origin });
    },
    buildMetadata: buildSceneViewMetadata,
  },
  'control-center': {
    register: (entry: ControlCenterRegistration, context: PluginRegistrationContext) => {
      controlCenterRegistry.register(entry.manifest, entry.plugin, { origin: context.origin });
    },
    buildMetadata: buildControlCenterMetadata,
  },
  'ui-plugin': {
    register: async (entry: UiPluginRegistration) => {
      if (entry.register) {
        await entry.register();
      }
    },
    buildMetadata: buildUiPluginMetadata,
  },
  'panel-group': {
    register: () => {},
    buildMetadata: buildPanelGroupMetadata,
  },
};
