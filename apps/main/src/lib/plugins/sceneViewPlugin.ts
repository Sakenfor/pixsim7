import type React from 'react';

import type {
  SceneMetaComicPanel,
  ComicPanelSession,
  ComicPanelSceneMeta,
  ComicPanelRequestContext,
  ComicPanelLayout,
} from '@features/scene';

import type { PluginManifest } from './types';
import { type UnifiedPluginOrigin } from './types';

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
    void options;
    console.info(`[SceneViewRegistry] Registered scene view "${viewId}"`);
  }

  unregister(id: string) {
    if (this.registry.delete(id)) {
      if (this.defaultId === id) {
        this.defaultId = null;
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
