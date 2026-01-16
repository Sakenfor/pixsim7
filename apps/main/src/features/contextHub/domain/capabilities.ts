import type { AssetRef, GenerationRef, LocationRef, SceneIdRef } from "@pixsim7/shared.types";

import type { AssetModel } from "@features/assets";

import type { OperationType } from "@/types/operations";

import type { EntityScopedCapability } from "../types";

import {
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
  CAP_PANEL_CONTEXT,
  CAP_GENERATION_WIDGET,
  CAP_GENERATION_SOURCE,
} from "./capabilityKeys";
import { registerCapabilityContract } from "./contracts";
import { assetInputContract } from "./contracts/assetInput";
import { registerCapabilityDescriptor } from "./descriptorRegistry";

export {
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
  CAP_PANEL_CONTEXT,
  CAP_GENERATION_WIDGET,
  CAP_GENERATION_SOURCE,
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
registerCapabilityDescriptor({
  key: CAP_PANEL_CONTEXT,
  label: "Panel Context",
  description: "Dockview panel context passed via SmartDockview context prop.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_GENERATION_WIDGET,
  label: "Generation Widget",
  description: "Generation widget actions and state for asset enqueuing.",
  kind: "action",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_GENERATION_SOURCE,
  label: "Generation Source",
  description: "Controls whether generation uses user settings or asset's original settings.",
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

/**
 * Panel context capability - generic type for dockview panel context.
 * This capability is automatically provided by SmartDockview when a `context` prop is passed.
 * Panels can consume this via `useCapability(CAP_PANEL_CONTEXT)` instead of prop drilling.
 *
 * @template T - The shape of the context object (defaults to unknown for flexibility)
 */
export type PanelContextCapability<T = unknown> = T;

/**
 * Generation widget capability - exposes actions for the nearest generation widget.
 * Allows media cards and other components to add inputs to the correct widget.
 */
export interface GenerationWidgetContext {
  /** Whether the widget is currently visible/open */
  isOpen: boolean;
  /** Open/close the widget */
  setOpen: (open: boolean) => void;
  /** Scope id for the widget's generation stores */
  scopeId?: string;
  /** Current operation type (image_to_video, text_to_image, etc.) */
  operationType: OperationType;
  /** Update the operation type (if supported by the widget) */
  setOperationType?: (operationType: OperationType) => void;
  /** Add an asset to the widget's inputs */
  addInput: (options: {
    asset: AssetModel;
    operationType: OperationType;
    slotIndex?: number;
  }) => void;
  /** Add multiple assets using the widget's routing rules */
  addInputs?: (options: {
    assets: AssetModel[];
    operationType: OperationType;
  }) => void;
  /** Unique identifier for this widget instance */
  widgetId: string;
}

/** Mode for generation source - 'user' uses current user settings, 'asset' uses original generation settings */
export type GenerationSourceMode = 'user' | 'asset';

/**
 * Generation source capability - controls whether generation uses user settings or asset's original settings.
 * Provided by widget chrome (e.g., GenerationSourceToggle) to allow panels to adapt behavior.
 */
export interface GenerationSourceContext {
  /** Current mode */
  mode: GenerationSourceMode;
  /** Change the mode */
  setMode: (mode: GenerationSourceMode) => void;
  /** Whether asset mode is available (single asset with sourceGenerationId) */
  available: boolean;
  /** Whether currently fetching source generation data */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Fetched generation data when in asset mode */
  sourceGeneration: {
    id: number;
    prompt: string;
    operationType: string;
    providerId: string;
    params: Record<string, unknown>;
  } | null;
  /** Reset to user mode, clearing fetched data */
  resetToUser: () => void;
}
