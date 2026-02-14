/**
 * Plugin Metadata Converters
 *
 * Maps between the unified pluginSystem metadata and the UnifiedPluginDescriptor.
 */

import type {
  UnifiedPluginFamily,
  FamilyExtensions,
  UnifiedPluginDescriptor,
} from './descriptor';
import { normalizeOrigin } from './normalization';
import type { ExtendedPluginMetadata } from './pluginSystem';

/**
 * Map unified pluginSystem metadata to UnifiedPluginDescriptor
 */
export function fromPluginSystemMetadata(
  metadata: ExtendedPluginMetadata
): UnifiedPluginDescriptor {
  const family = metadata.family as UnifiedPluginFamily;
  const origin = normalizeOrigin(metadata.origin);
  const icon = (metadata as { icon?: string }).icon;
  const category = (metadata as { category?: string }).category;
  const extensions: FamilyExtensions = {};

  switch (family) {
    case 'scene-view': {
      const sceneView = metadata as ExtendedPluginMetadata<'scene-view'>;
      extensions.sceneView = {
        sceneViewId: sceneView.sceneViewId,
        surfaces: sceneView.surfaces,
        contentTypes: sceneView.contentTypes,
        default: sceneView.default,
      };
      break;
    }
    case 'control-center': {
      const controlCenter = metadata as ExtendedPluginMetadata<'control-center'>;
      extensions.controlCenter = {
        controlCenterId: controlCenter.controlCenterId,
        displayName: controlCenter.displayName,
        features: controlCenter.features,
        preview: controlCenter.preview,
        default: controlCenter.default,
      };
      break;
    }
    case 'workspace-panel': {
      const panel = metadata as ExtendedPluginMetadata<'workspace-panel'>;
      extensions.workspacePanel = {
        panelId: panel.panelId,
        category: panel.category,
        supportsCompactMode: panel.supportsCompactMode,
        supportsMultipleInstances: panel.supportsMultipleInstances,
      };
      break;
    }
    case 'dock-widget': {
      const widget = metadata as ExtendedPluginMetadata<'dock-widget'>;
      extensions.dockWidget = {
        widgetId: widget.widgetId,
        dockviewId: widget.dockviewId,
        presetScope: widget.presetScope,
        panelScope: widget.panelScope,
        storageKey: widget.storageKey,
        allowedPanels: widget.allowedPanels,
        defaultPanels: widget.defaultPanels,
      };
      break;
    }
    case 'gizmo-surface': {
      const surface = metadata as ExtendedPluginMetadata<'gizmo-surface'>;
      extensions.gizmoSurface = {
        gizmoSurfaceId: surface.gizmoSurfaceId,
        category: surface.category,
        supportsContexts: surface.supportsContexts,
      };
      break;
    }
    default:
      break;
  }

  const uiPlugin = metadata as ExtendedPluginMetadata<'ui-plugin'>;
  const pluginType = family === 'ui-plugin' ? uiPlugin.pluginType : undefined;
  const bundleFamily = family === 'ui-plugin' ? uiPlugin.bundleFamily : undefined;

  const descriptor: UnifiedPluginDescriptor = {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    version: metadata.version,
    author: metadata.author,
    icon,
    family,
    origin,
    pluginType,
    tags: metadata.tags,
    category,
    capabilities: metadata.capabilities,
    providesFeatures: metadata.providesFeatures,
    consumesFeatures: metadata.consumesFeatures,
    consumesActions: metadata.consumesActions,
    consumesState: metadata.consumesState,
    scope: (metadata as ExtendedPluginMetadata<'node-type'>).scope,
    experimental: metadata.experimental,
    deprecated: metadata.deprecated,
    deprecationMessage: metadata.deprecationMessage,
    replaces: metadata.replaces,
    configurable: metadata.configurable,
    canDisable: metadata.canDisable,
    isActive: metadata.activationState === 'active',
    isBuiltin: origin === 'builtin',
    bundleFamily,
    extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
  };

  return descriptor;
}
