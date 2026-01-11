
import { generationUIPluginRegistry, type GenerationUIPlugin } from '@features/providers';

import { devToolRegistry, type DevToolDefinition } from '@lib/dev/devtools';
import { panelRegistry, type PanelDefinition } from '@features/panels';
import { dockZoneRegistry, type DockZoneDefinition } from '@lib/dockview/dockZoneRegistry';
import { sessionHelperRegistry, type HelperDefinition } from '@pixsim7/game.engine';
import { nodeTypeRegistry, type NodeTypeDefinition } from '@lib/registries';
import { brainToolRegistry, type BrainToolPlugin } from '@features/brainTools/lib/registry';
import { galleryToolRegistry, type GalleryToolPlugin } from '@features/gallery';
import { gallerySurfaceRegistry, type GallerySurfaceDefinition } from '@features/gallery';
import { gizmoSurfaceRegistry, type GizmoSurfaceDefinition } from '@features/gizmos';
import { graphEditorRegistry, type GraphEditorDefinition } from '@features/graph/lib/editor/editorRegistry';
import { nodeRendererRegistry, type NodeRenderer } from '@features/graph/lib/editor/nodeRendererRegistry';
import { worldToolRegistry, type WorldToolPlugin } from '@features/worldTools';

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

export interface PluginRegistrationContext {
  id: string;
  family: PluginFamily;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  activationState?: ActivationState;
  canDisable?: boolean;
  metadata?: Partial<PluginMetadata>;
}

export interface PluginFamilyAdapter {
  register: (plugin: any, context: PluginRegistrationContext) => void | Promise<void>;
  unregister?: (id: string, context: PluginRegistrationContext) => void | Promise<void>;
  buildMetadata: (plugin: any, context: PluginRegistrationContext) => ExtendedPluginMetadata;
}

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

function buildHelperMetadata(
  helper: HelperDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'helper'> {
  const metadata = extractCommonMetadata(helper);
  const capabilities: PluginMetadata['capabilities'] = {
    modifiesSession: true,
  };

  if (helper.category === 'inventory') {
    capabilities.modifiesInventory = true;
  } else if (helper.category === 'relationship') {
    capabilities.modifiesRelationships = true;
  } else if (helper.category === 'event') {
    capabilities.triggersEvents = true;
  }

  return {
    ...metadata,
    id: helper.id || helper.name,
    name: helper.name || helper.id || 'unknown',
    family: 'helper',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: helper.category,
    capabilities,
    consumesFeatures: ['game'],
    ...context.metadata,
  } as ExtendedPluginMetadata<'helper'>;
}

function buildInteractionMetadata(
  interaction: InteractionPlugin<BaseInteractionConfig>,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'interaction'> {
  const metadata = extractCommonMetadata(interaction);
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
    ...metadata,
    id: interaction.id,
    name: interaction.name || interaction.id,
    family: 'interaction',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: interaction.category,
    icon: interaction.icon,
    capabilities,
    consumesFeatures: ['game'],
    ...context.metadata,
  } as ExtendedPluginMetadata<'interaction'>;
}

function buildNodeTypeMetadata(
  nodeType: NodeTypeDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'node-type'> {
  const metadata = extractCommonMetadata(nodeType);
  const capabilities: PluginMetadata['capabilities'] = {
    addsNodeTypes: true,
  };

  return {
    ...metadata,
    id: nodeType.id,
    name: nodeType.name || nodeType.id,
    family: 'node-type',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: nodeType.category,
    scope: nodeType.scope,
    userCreatable: nodeType.userCreatable,
    preloadPriority: nodeType.preloadPriority,
    capabilities,
    consumesFeatures: ['graph', 'game'],
    providesFeatures: ['node-types'],
    ...context.metadata,
  } as ExtendedPluginMetadata<'node-type'>;
}

function buildRendererMetadata(
  renderer: { nodeType: string; preloadPriority?: number },
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'renderer'> {
  return {
    id: `renderer:${renderer.nodeType}`,
    name: `Renderer: ${renderer.nodeType}`,
    family: 'renderer',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    nodeType: renderer.nodeType,
    preloadPriority: renderer.preloadPriority,
    ...context.metadata,
  } as ExtendedPluginMetadata<'renderer'>;
}

function buildWorldToolMetadata(
  tool: WorldToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'world-tool'> {
  const metadata = extractCommonMetadata(tool);
  const capabilities: PluginMetadata['capabilities'] = {
    addsUIOverlay: true,
  };

  return {
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'world-tool',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: tool.category,
    icon: tool.icon,
    capabilities,
    ...context.metadata,
  } as ExtendedPluginMetadata<'world-tool'>;
}

function buildGalleryToolMetadata(
  tool: GalleryToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gallery-tool'> {
  const metadata = extractCommonMetadata(tool);
  const capabilities: PluginMetadata['capabilities'] = {
    addsGalleryTools: true,
  };
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
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'gallery-tool',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: tool.category,
    capabilities,
    consumesFeatures,
    providesFeatures: providesFeatures.length > 0 ? providesFeatures : undefined,
    ...context.metadata,
  } as ExtendedPluginMetadata<'gallery-tool'>;
}

function buildBrainToolMetadata(
  tool: BrainToolPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'brain-tool'> {
  const metadata = extractCommonMetadata(tool);

  return {
    ...metadata,
    id: tool.id,
    name: tool.name || tool.id,
    family: 'brain-tool',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: tool.category,
    icon: tool.icon,
    ...context.metadata,
  } as ExtendedPluginMetadata<'brain-tool'>;
}

function buildGallerySurfaceMetadata(
  surface: GallerySurfaceDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gallery-surface'> {
  return {
    id: surface.id,
    name: surface.label || surface.id,
    family: 'gallery-surface',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    description: surface.description,
    category: surface.category,
    icon: surface.icon,
    ...context.metadata,
  } as ExtendedPluginMetadata<'gallery-surface'>;
}

function buildGenerationUIMetadata(
  plugin: GenerationUIPlugin,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'generation-ui'> {
  const metadata = extractCommonMetadata({
    id: plugin.id,
    name: plugin.metadata?.name ?? plugin.id,
    description: plugin.metadata?.description,
    version: plugin.metadata?.version,
    tags: plugin.operations,
  });

  const providesFeatures = ['generation-ui'];
  if (plugin.providerId) {
    providesFeatures.push(`generation-ui-${plugin.providerId}`);
  }

  return {
    ...metadata,
    id: plugin.id,
    name: plugin.metadata?.name ?? plugin.id,
    family: 'generation-ui',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    providerId: plugin.providerId,
    operations: plugin.operations,
    priority: plugin.priority,
    category: plugin.metadata?.name ? 'provider' : undefined,
    providesFeatures,
    ...context.metadata,
  } as ExtendedPluginMetadata<'generation-ui'>;
}

function buildGraphEditorMetadata(
  editor: GraphEditorDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'graph-editor'> {
  return {
    id: editor.id,
    name: editor.label || editor.id,
    family: 'graph-editor',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: editor.category,
    storeId: editor.storeId,
    supportsMultiScene: editor.supportsMultiScene,
    supportsWorldContext: editor.supportsWorldContext,
    supportsPlayback: editor.supportsPlayback,
    ...context.metadata,
  } as ExtendedPluginMetadata<'graph-editor'>;
}

function buildDevToolMetadata(
  tool: DevToolDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'dev-tool'> {
  return {
    id: tool.id,
    name: tool.label || tool.id,
    family: 'dev-tool',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    category: tool.category,
    icon: tool.icon,
    description: tool.description,
    ...context.metadata,
  } as ExtendedPluginMetadata<'dev-tool'>;
}

function buildPanelMetadata(
  panel: PanelDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'workspace-panel'> {
  return {
    id: panel.id,
    name: panel.title || panel.id,
    family: 'workspace-panel',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    panelId: panel.id,
    category: panel.category,
    supportsCompactMode: panel.supportsCompactMode,
    supportsMultipleInstances: panel.supportsMultipleInstances,
    description: panel.description,
    tags: panel.tags,
    ...context.metadata,
  } as ExtendedPluginMetadata<'workspace-panel'>;
}

function buildDockWidgetMetadata(
  widget: DockZoneDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'dock-widget'> {
  return {
    id: widget.id,
    name: widget.label || widget.id,
    family: 'dock-widget',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    widgetId: widget.id,
    dockviewId: widget.dockviewId,
    presetScope: widget.presetScope,
    panelScope: widget.panelScope,
    storageKey: widget.storageKey,
    allowedPanels: widget.allowedPanels,
    defaultPanels: widget.defaultPanels,
    description: widget.description,
    ...context.metadata,
  } as ExtendedPluginMetadata<'dock-widget'>;
}

function buildGizmoSurfaceMetadata(
  surface: GizmoSurfaceDefinition,
  context: PluginRegistrationContext
): ExtendedPluginMetadata<'gizmo-surface'> {
  return {
    id: surface.id,
    name: surface.label || surface.id,
    family: 'gizmo-surface',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    gizmoSurfaceId: surface.id,
    category: surface.category,
    icon: surface.icon,
    description: surface.description,
    ...context.metadata,
  } as ExtendedPluginMetadata<'gizmo-surface'>;
}

type SceneViewRegistration = {
  manifest: SceneViewPluginManifest;
  plugin: SceneViewPlugin;
};

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
    id: manifest.id,
    name: manifest.name,
    family: 'scene-view',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    tags: manifest.tags,
    sceneViewId: manifest.sceneView.id,
    surfaces: manifest.sceneView.surfaces,
    default: manifest.sceneView.default,
    icon: manifest.icon,
    capabilities,
    providesFeatures,
    consumesFeatures,
    ...context.metadata,
  } as ExtendedPluginMetadata<'scene-view'>;
}

type ControlCenterRegistration = {
  manifest: ControlCenterPluginManifest;
  plugin: ControlCenterPlugin;
};

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
    id: manifest.id,
    name: manifest.name,
    family: 'control-center',
    origin: context.origin,
    activationState: resolveActivationState(context),
    canDisable: resolveCanDisable(context),
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    tags: manifest.tags,
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
    ...context.metadata,
  } as ExtendedPluginMetadata<'control-center'>;
}

type UiPluginRegistration = {
  metadata: ExtendedPluginMetadata<'ui-plugin'>;
  register?: () => void | Promise<void>;
  unregister?: () => void | Promise<void>;
};

function buildUiPluginMetadata(
  entry: UiPluginRegistration
): ExtendedPluginMetadata<'ui-plugin'> {
  return entry.metadata;
}

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
    register: (nodeType: NodeTypeDefinition) => nodeTypeRegistry.register(nodeType),
    buildMetadata: buildNodeTypeMetadata,
  },
  'renderer': {
    register: (renderer: NodeRenderer) => nodeRendererRegistry.register(renderer),
    buildMetadata: buildRendererMetadata,
  },
  'world-tool': {
    register: (tool: WorldToolPlugin) => worldToolRegistry.register(tool),
    buildMetadata: buildWorldToolMetadata,
  },
  'gallery-tool': {
    register: (tool: GalleryToolPlugin) => galleryToolRegistry.register(tool),
    buildMetadata: buildGalleryToolMetadata,
  },
  'brain-tool': {
    register: (tool: BrainToolPlugin) => brainToolRegistry.register(tool),
    buildMetadata: buildBrainToolMetadata,
  },
  'gallery-surface': {
    register: (surface: GallerySurfaceDefinition) => gallerySurfaceRegistry.register(surface),
    buildMetadata: buildGallerySurfaceMetadata,
  },
  'generation-ui': {
    register: (plugin: GenerationUIPlugin) => generationUIPluginRegistry.register(plugin),
    buildMetadata: buildGenerationUIMetadata,
  },
  'graph-editor': {
    register: (editor: GraphEditorDefinition) => graphEditorRegistry.register(editor),
    buildMetadata: buildGraphEditorMetadata,
  },
  'dev-tool': {
    register: (tool: DevToolDefinition) => devToolRegistry.register(tool),
    buildMetadata: buildDevToolMetadata,
  },
  'workspace-panel': {
    register: (panel: PanelDefinition) => panelRegistry.register(panel),
    buildMetadata: buildPanelMetadata,
  },
  'dock-widget': {
    register: (widget: DockZoneDefinition) => dockZoneRegistry.register(widget),
    buildMetadata: buildDockWidgetMetadata,
  },
  'gizmo-surface': {
    register: (surface: GizmoSurfaceDefinition) => gizmoSurfaceRegistry.register(surface),
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
};
