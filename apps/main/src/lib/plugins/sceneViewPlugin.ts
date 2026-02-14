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
 * Content type vocabulary for scene view plugins.
 * Each plugin declares which content types it can render.
 */
export type SceneViewContentType = 'comic-panels' | 'video' | 'dialogue' | '3d' | (string & {});

/**
 * Offer describing what content a scene provides.
 * Built by inspecting scene data (see sceneContentInspector).
 */
export interface SceneViewOffer {
  contentTypes: SceneViewContentType[];
  panelCount?: number;
  hasSession?: boolean;
}

/**
 * Additional metadata describing a scene view plugin.
 */
export interface SceneViewDescriptor {
  id: string;
  displayName: string;
  description?: string;
  surfaces?: Array<'overlay' | 'hud' | 'panel' | 'workspace'>;
  contentTypes?: SceneViewContentType[];
  default?: boolean;
}

export interface SceneViewPluginManifest extends PluginManifest {
  type: 'ui-overlay';
  sceneView: SceneViewDescriptor;
}

export interface SceneViewRenderProps {
  contentType?: SceneViewContentType;
  panels?: SceneMetaComicPanel[];
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

  /**
   * Resolve the best plugin for a given content offer.
   * Checks each registered plugin's declared contentTypes against the offer.
   * Falls back to getDefaultId() if no match is found.
   */
  resolve(offer: SceneViewOffer): string | null {
    if (!offer.contentTypes.length) {
      return this.getDefaultId();
    }

    for (const [id, entry] of this.registry) {
      const declared = entry.manifest.sceneView.contentTypes;
      if (!declared || declared.length === 0) {
        continue;
      }
      const hasIntersection = declared.some(ct => offer.contentTypes.includes(ct));
      if (hasIntersection) {
        return id;
      }
    }

    return this.getDefaultId();
  }

  list() {
    return Array.from(this.registry.values(), entry => entry.manifest);
  }
}

export const sceneViewRegistry = new SceneViewRegistry();
