import type React from 'react';
import type { PluginManifest } from './types';
import {
  fromPluginSystemMetadata,
  validateFamilyMetadata,
  type UnifiedPluginOrigin,
} from './types';
import type {
  ExtendedPluginMetadata,
  PluginCapabilityHints,
} from './pluginSystem';
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

    // Resolve origin and compute canDisable
    const origin = options.origin ?? 'builtin';
    const canDisable = origin !== 'builtin';

    // Build dependency hints based on permissions
    const capabilities: PluginCapabilityHints = { addsUIOverlay: true };
    const providesFeatures = ['ui-overlay', 'scene-view'];
    const consumesFeatures = ['workspace'];

    if (manifest.permissions?.includes('read:session')) {
      consumesFeatures.push('game');
    }

    // Register in unified plugin catalog
    const metadata: ExtendedPluginMetadata<'scene-view'> = {
      id: manifest.id,
      name: manifest.name,
      family: 'scene-view',
      origin,
      activationState: 'active',
      canDisable,
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
    };
    void import('./pluginSystem').then(({ pluginCatalog }) => {
      pluginCatalog.register(metadata);

      // Validate and log warnings
      const descriptor = fromPluginSystemMetadata(metadata);
      const validation = validateFamilyMetadata(descriptor);
      if (!validation.valid) {
        console.error(`[SceneViewRegistry] Plugin ${manifest.id} has validation errors:`, validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn(`[SceneViewRegistry] Plugin ${manifest.id} has validation warnings:`, validation.warnings);
      }
    });

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
        void import('./pluginSystem').then(({ pluginCatalog }) => {
          pluginCatalog.unregister(entry.manifest.id);
        });
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
