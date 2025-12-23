import type { ViewerAsset } from "@features/assets";
import type { AssetRef, GenerationRef, LocationRef, SceneIdRef } from "@pixsim7/shared.types";
import type { EntityScopedCapability } from "./types";
import { registerCapabilityDescriptor } from "./descriptorRegistry";
import { registerCapabilityContract } from "./contracts";
import { assetInputContract } from "./contracts/assetInput";
import {
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_GENERATION_SCOPE,
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
} from "./capabilityKeys";

export {
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_GENERATION_SCOPE,
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
};

registerCapabilityDescriptor({
  key: CAP_ASSET_SELECTION,
  label: "Asset Selection",
  description: "Currently selected assets and source.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_SCENE_CONTEXT,
  label: "Scene Context",
  description: "Active scene metadata for the editor.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_WORLD_CONTEXT,
  label: "World Context",
  description: "Active world metadata for the editor.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_GENERATION_CONTEXT,
  label: "Generation Context",
  description: "Active generation context and mode.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_GENERATION_SCOPE,
  label: "Generation Scope",
  description: "Generation scope stores for this panel instance.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_PROMPT_BOX,
  label: "Prompt Box",
  description: "Prompt box input state and limits.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_ASSET_INPUT,
  label: "Asset Input",
  description: "Current asset input selection.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_GENERATE_ACTION,
  label: "Generate Action",
  description: "Generation action controls and status.",
  kind: "action",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_EDITOR_CONTEXT,
  label: "Editor Context",
  description: "Snapshot of editor state for the active workspace.",
  kind: "context",
  source: "contextHub",
});

registerCapabilityContract(assetInputContract);

export type AssetSelection = EntityScopedCapability<{
  asset: ViewerAsset | null;
  assets: ViewerAsset[];
  source?: string;
  refs?: AssetRef[];
}, AssetRef>;

export type SceneContextSummary = EntityScopedCapability<{
  sceneId?: string | number | null;
  title?: string | null;
}, SceneIdRef>;

export interface WorldContextSummary {
  worldId?: number | null;
  name?: string | null;
}

export type GenerationContextSummary = EntityScopedCapability<{
  id: string;
  label?: string;
  mode?: string;
  supportsMultiAsset?: boolean;
}, GenerationRef>;

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

export type AssetInputContext = EntityScopedCapability<{
  assets: ViewerAsset[];
  supportsMulti?: boolean;
  refs?: AssetRef[];
  selection?: {
    count: number;
    min: number;
    max: number;
    mode: "single" | "multi";
  };
  constraints?: {
    types?: Array<"image" | "video">;
    canMixTypes?: boolean;
  };
  status?: {
    ready: boolean;
    reason?: string;
  };
}, AssetRef>;

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
    locationRef?: LocationRef | null;
  };
  scene: {
    id: string | null;
    title?: string | null;
    editorId?: string | null;
    selection: string[];
    ref?: SceneIdRef | null;
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
