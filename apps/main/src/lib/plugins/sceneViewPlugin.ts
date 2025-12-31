import type React from 'react';
import type { PluginManifest } from './types';
import { fromSceneViewManifest, type UnifiedPluginOrigin } from './types';
import { pluginCatalog, type ExtendedPluginMetadata } from './pluginSystem';
import type {
  SceneMetaComicPanel,
  ComicPanelSession,
  ComicPanelSceneMeta,
  ComicPanelRequestContext,
  ComicPanelLayout,
} from '@features/scene';

/**
 * Additional metadata describing a scene view plugin.
 */
export interface SceneViewDescriptor {
  id: string;
  displayName: string;
  description?: string;
  surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
  default?: boolean;
}

export interface SceneViewPluginManifest extends PluginManifest {
  type: 'ui-overlay';
  sceneView: SceneViewDescriptor;
}

export interface SceneViewRenderProps {
  panels: SceneMetaComicPanel[];
  session?: ComicPanelSession;
  sceneMeta?: ComicPanelSceneMeta;
  layout?: ComicPanelLayout;
  showCaption?: boolean;
  className?: string;
  requestContext?: ComicPanelRequestContext;
  onPanelClick?: (panel: SceneMetaComicPanel) => void;
}

export interface SceneViewPlugin {
  render: (props: SceneViewRenderProps) => React.ReactElement | null;
}

interface SceneViewRegistryEntry {
  manifest: SceneViewPluginManifest;
  plugin: SceneViewPlugin;
}

class SceneViewRegistry {
  private registry = new Map<string, SceneViewRegistryEntry>();
  private defaultId: string | null = null;

  register(
    manifest: SceneViewPluginManifest,
    plugin: SceneViewPlugin,
    options: { origin?: UnifiedPluginOrigin } = {}
  ) {
    const viewId = manifest.sceneView.id;
    if (!viewId) {
      throw new Error('[SceneViewRegistry] Scene view manifest must include an id');
    }

    this.registry.set(viewId, { manifest, plugin });

    if (manifest.sceneView.default) {
      this.defaultId = viewId;
    }

    // Register in unified plugin catalog
    const descriptor = fromSceneViewManifest(manifest, {
      origin: options.origin ?? 'builtin',
      isActive: true,
    });
    const metadata: ExtendedPluginMetadata<'scene-view'> = {
      id: manifest.id,
      name: manifest.name,
      family: 'scene-view',
      origin: options.origin ?? 'builtin',
      activationState: 'active',
      canDisable: options.origin !== 'builtin',
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
      sceneViewId: manifest.sceneView.id,
      surfaces: manifest.sceneView.surfaces,
      default: manifest.sceneView.default,
      icon: manifest.icon,
    };
    pluginCatalog.register(metadata);

    console.info(`[SceneViewRegistry] Registered scene view "${viewId}"`);
  }

  unregister(id: string) {
    const entry = this.registry.get(id);
    if (this.registry.delete(id)) {
      if (this.defaultId === id) {
        this.defaultId = null;
      }
      // Also unregister from unified catalog
      if (entry) {
        pluginCatalog.unregister(entry.manifest.id);
      }
      console.info(`[SceneViewRegistry] Unregistered scene view "${id}"`);
    }
  }

  getEntry(id: string) {
    return this.registry.get(id) || null;
  }

  getPlugin(id: string) {
    return this.registry.get(id)?.plugin || null;
  }

  getDefaultId() {
    if (this.defaultId) {
      return this.defaultId;
    }

    const first = this.registry.keys().next();
    return first && !first.done ? first.value : null;
  }

  list() {
    return Array.from(this.registry.values(), entry => entry.manifest);
  }
}

export const sceneViewRegistry = new SceneViewRegistry();

export type { SceneViewRenderProps };
