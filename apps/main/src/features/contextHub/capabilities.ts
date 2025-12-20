import type { ViewerAsset } from "@features/assets";

export const CAP_ASSET_SELECTION = "assetSelection" as const;
export const CAP_SCENE_CONTEXT = "sceneContext" as const;
export const CAP_WORLD_CONTEXT = "worldContext" as const;
export const CAP_GENERATION_CONTEXT = "generationContext" as const;

export interface AssetSelection {
  asset: ViewerAsset | null;
  assets: ViewerAsset[];
  source?: string;
}

export interface SceneContextSummary {
  sceneId?: string | number | null;
  title?: string | null;
}

export interface WorldContextSummary {
  worldId?: number | null;
  name?: string | null;
}

export interface GenerationContextSummary {
  id: string;
  label?: string;
  mode?: string;
  supportsMultiAsset?: boolean;
}
