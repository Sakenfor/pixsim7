import type { ViewerAsset } from "@features/assets";

export const CAP_ASSET_SELECTION = "assetSelection" as const;
export const CAP_SCENE_CONTEXT = "sceneContext" as const;
export const CAP_WORLD_CONTEXT = "worldContext" as const;
export const CAP_GENERATION_CONTEXT = "generationContext" as const;
export const CAP_GENERATION_SCOPE = "generationScope" as const;
export const CAP_PROMPT_BOX = "promptBox" as const;
export const CAP_ASSET_INPUT = "assetInput" as const;
export const CAP_GENERATE_ACTION = "generateAction" as const;
export const CAP_EDITOR_CONTEXT = "editorContext" as const;

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

export type GenerationStoreHook<TState = any> = <T>(
  selector: (state: TState) => T
) => T;

export interface GenerationScopeContext {
  id: string;
  label?: string;
  useSessionStore: GenerationStoreHook;
  useSettingsStore: GenerationStoreHook;
}

export interface PromptBoxContext {
  prompt: string;
  setPrompt: (value: string) => void;
  maxChars?: number;
  providerId?: string;
  operationType?: string;
}

export interface AssetInputContext {
  assets: ViewerAsset[];
  supportsMulti?: boolean;
}

export interface GenerateActionContext {
  canGenerate: boolean;
  generating: boolean;
  error?: string | null;
  generate: () => void | Promise<void>;
}

export interface EditorContextSnapshot {
  world: {
    id: number | null;
    locationId: number | null;
    name?: string | null;
    locationName?: string | null;
  };
  scene: {
    id: string | null;
    title?: string | null;
    editorId?: string | null;
    selection: string[];
  };
  runtime: {
    sessionId: number | null;
    worldTimeSeconds: number | null;
    mode: string | null;
  };
  workspace: {
    activePresetId: string | null;
    activePanels: string[];
  };
  editor: {
    primaryView: string;
    mode: string;
  };
}
