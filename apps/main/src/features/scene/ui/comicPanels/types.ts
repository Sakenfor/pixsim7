import type { ComicSessionFlags, SceneMetaComicPanel } from '@/modules/scene-builder';
import type { NpcRef, LocationRef, AssetRef } from '@pixsim7/shared.types';

/**
 * Re-export scene builder comic panel types so consumers do not need to reach
 * into the modules directory directly.
 */
export type { SceneMetaComicPanel, ComicSessionFlags };

/**
 * Minimal session shape required by the comic panel helpers.
 * Extend as needed with additional session fields.
 */
export interface ComicPanelSession {
  flags?: {
    comic?: ComicSessionFlags;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Minimal scene metadata shape required by the comic panel helpers.
 */
export interface ComicPanelSceneMeta {
  comicPanels?: SceneMetaComicPanel[];
  [key: string]: unknown;
}

export interface ComicPanelRequestContext {
  sceneId?: string;
  choiceId?: string;
  locationId?: LocationRef | string;
  characters?: NpcRef[];
  tags?: string[];
  mood?: string;
}

export interface ComicPanelDerivedContext {
  assetRef?: AssetRef;
  numericAssetId?: string;
  characters?: NpcRef[];
  location?: LocationRef | string;
  tags?: string[];
  mood?: string;
}
