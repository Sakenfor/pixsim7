import { registerCapabilityContract } from "@pixsim7/shared.capabilities.core/contract";
import { registerCapabilityDescriptor } from "@pixsim7/shared.capabilities.core/descriptor";
import type { AssetRef, GenerationRef, LocationRef, SceneIdRef } from "@pixsim7/shared.types";

import type { AssetModel, ViewerAsset } from "@features/assets";

import type { OperationType } from "@/types/operations";

import type { EntityScopedCapability } from "../types";

import type { AuthoringContextSource } from "./authoringContextResolution";
import {
  CAP_ASSET,
  CAP_ASSET_LIST,
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_PROJECT_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_PROMPT_BOX,
  CAP_PROMPT_SPAN_FOCUS,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
  CAP_PANEL_CONTEXT,
  CAP_GENERATION_WIDGET,
  CAP_GENERATION_SOURCE,
  CAP_SCENE_VIEW,
  CAP_CHARACTER_CONTEXT,
  CAP_CHARACTER_INGEST_ACTION,
  CAP_CHARACTER_SCENE_PREP_PREFILL,
  CAP_UI_STUDIO_TARGET,
  CAP_UI_STUDIO_ACTIONS,
  CAP_BLOCK_SELECTION,
} from "./capabilityKeys";
import { assetInputContract } from "./contracts/assetInput";
import { sceneViewContract } from "./contracts/sceneView";

export {
  CAP_ASSET,
  CAP_ASSET_LIST,
  CAP_ASSET_SELECTION,
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_PROJECT_CONTEXT,
  CAP_GENERATION_CONTEXT,
  CAP_PROMPT_BOX,
  CAP_PROMPT_SPAN_FOCUS,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_EDITOR_CONTEXT,
  CAP_PANEL_CONTEXT,
  CAP_GENERATION_WIDGET,
  CAP_GENERATION_SOURCE,
  CAP_SCENE_VIEW,
  CAP_CHARACTER_CONTEXT,
  CAP_CHARACTER_INGEST_ACTION,
  CAP_CHARACTER_SCENE_PREP_PREFILL,
  CAP_UI_STUDIO_TARGET,
  CAP_UI_STUDIO_ACTIONS,
  CAP_BLOCK_SELECTION,
};

registerCapabilityDescriptor({
  key: CAP_ASSET,
  label: "Asset",
  description: "Single asset available in the current context (e.g., viewer, card).",
  kind: "data",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_ASSET_LIST,
  label: "Asset List",
  description: "List of assets available in the current context.",
  kind: "data",
  source: "contextHub",
});
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
  key: CAP_PROJECT_CONTEXT,
  label: "Project Context",
  description: "Active project/session metadata for import/export state.",
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
  key: CAP_PROMPT_SPAN_FOCUS,
  label: "Prompt Span Focus",
  description:
    "Currently focused prompt span/candidate plus the host callbacks needed to act on it (accept hypothesis, accept op output). Published by the composer; consumed by the anchored popover and the detached prompt-span-inspector floating panel so the inspector auto-rebinds when the user clicks a different candidate.",
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

registerCapabilityDescriptor({
  key: CAP_SCENE_VIEW,
  label: "Scene View",
  description: "Scene view content type matching for plugin resolution.",
  kind: "context",
  source: "contextHub",
});

registerCapabilityDescriptor({
  key: CAP_CHARACTER_CONTEXT,
  label: "Character Context",
  description: "Selected character from the Character Creator panel.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_CHARACTER_INGEST_ACTION,
  label: "Character Ingest Action",
  description: "Adds assets to the active character's reference ingest queue.",
  kind: "action",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_CHARACTER_SCENE_PREP_PREFILL,
  label: "Character Scene Prep Prefill",
  description: "Provides scene-prep cast/guidance defaults from the active character and curated slots.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_UI_STUDIO_TARGET,
  label: "UI Studio Target",
  description: "Current UI Studio tab and authoring-context snapshot.",
  kind: "context",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_UI_STUDIO_ACTIONS,
  label: "UI Studio Actions",
  description: "Actions for changing UI Studio tab focus.",
  kind: "action",
  source: "contextHub",
});
registerCapabilityDescriptor({
  key: CAP_BLOCK_SELECTION,
  label: "Block Selection",
  description:
    "Currently focused prompt block from a block-explorer-style panel. " +
    "Consumed by authoring + inspection panels that want to coordinate on " +
    "the user's current block of interest.",
  kind: "context",
  source: "contextHub",
});

registerCapabilityContract(assetInputContract);
registerCapabilityContract(sceneViewContract);

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

export interface ProjectContextSummary {
  worldId?: number | null;
  projectId?: number | null;
  projectName?: string | null;
  projectSourceWorldId?: number | null;
  projectUpdatedAt?: string | null;
  sourceFileName?: string | null;
  schemaVersion?: number | null;
  extensionKeys?: string[];
  extensionWarnings?: string[];
  coreWarnings?: string[];
  dirty?: boolean;
  lastImportedAt?: number | null;
  lastExportedAt?: number | null;
  lastOperation?: "import" | "export" | null;
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

/**
 * Currently focused prompt span/candidate plus the host callbacks needed to
 * act on it. Published by the composer; consumed by both the anchored
 * span popover and the detached `prompt-span-inspector` floating panel so
 * the inspector auto-rebinds when the user clicks a different candidate.
 *
 * The candidate type is intentionally `unknown`-shaped at this layer to keep
 * contextHub feature-independent; consumers in features/prompts cast to
 * `PromptBlockCandidate` (and the hypothesis/overlay shapes for callbacks).
 * The `surfaceId` distinguishes composer instances when more than one is
 * mounted simultaneously (multi-pane).
 */
export interface PromptSpanFocusContext {
  /** Stable id for the publishing composer surface (e.g. "composer:quickgen"). */
  surfaceId: string;
  /** The currently focused span/candidate, or null if no span is focused. */
  candidate: unknown;
  /** Optional role-color overrides from the host. */
  roleColors?: Record<string, string>;
  /** When set, the matching hypothesis row shows pending state and the list disables. */
  pendingBlockId?: string | null;
  /** Accept a primitive-projection hypothesis (Matches tab "click-to-replace"). */
  onAccept?: (hypothesis: unknown) => void;
  /** Accept executor output (Adjust tab "Generate & insert"). */
  onAcceptOpOutput?: (text: string, overlay: unknown) => void;
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

/** Unified overrides for all generation triggers. */
export interface GenerateOverrides {
  /** Override the prompt without modifying the widget's UI state */
  promptOverride?: string;
  /** Replace current inputs entirely with these assets */
  assetOverrides?: AssetModel[];
  /** Merged into dynamicParams (e.g., { duration: 5 }) */
  paramOverrides?: Record<string, any>;
  /** Burst mode: submit this many generations (default: 1) */
  count?: number;
  /** Skip falling back to the active/selected asset when no inputs are queued */
  skipActiveAssetFallback?: boolean;
  /** Probe-style throwaway run. Marks run_context.metadata.ephemeral=true so
   *  the resulting asset is created with asset_kind='probe' and skips the
   *  QuickGen history seed. */
  ephemeral?: boolean;
}

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
  /** Active provider id (e.g. 'pixverse') — resolved from session store */
  providerId?: string | null;
  /** Active model id (e.g. 'v4') — resolved from settings store */
  model?: string | null;
  /** Currently configured duration in seconds (for video operations) */
  duration?: number | null;
  /** Update the operation type (if supported by the widget) */
  setOperationType?: (operationType: OperationType) => void;
  /** Trigger generation with widget state management (generating, error, generationId).
   *  Use this from the widget's own UI (Go button). */
  generate?: (overrides?: GenerateOverrides) => void | Promise<void>;
  /** Execute the generation pipeline without managing widget state.
   *  Use this from external triggers (media cards, gestures) to avoid
   *  side-effects on the widget's generating/error/generationId state.
   *  Returns generation IDs on success, throws on fatal error. */
  executeGeneration?: (overrides?: GenerateOverrides) => Promise<{ generationIds: number[] }>;
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

export interface CharacterContextSummary {
  characterId: string;
  name: string | null;
  displayName: string | null;
  category: string;
  species: string | null;
  archetype: string | null;
  gameNpcId: number | null;
}

export interface CharacterIngestActionContext {
  characterId: string;
  characterLabel: string;
  addAssetsToIngest: (assetIds: Array<number | string>) => void | Promise<void>;
}

export interface CharacterScenePrepPrefillContext {
  characterId: string;
  characterLabel: string;
  sceneName: string;
  basePrompt: string;
  sourceAssetId?: string | number | null;
  cast: Array<{ role: string; character_id: string }>;
  guidanceRefs: Array<{
    key: string;
    asset_id: string | number;
    kind?: string;
    label?: string;
    priority?: number;
  }>;
  matrixQuery?: string;
  discoveryNotes?: string;
}

export type UiStudioTabId = "surfaces" | "hud" | "overlay";

export interface UiStudioTargetContext {
  tab: UiStudioTabId;
  tabs: UiStudioTabId[];
  worldId: number | null;
  projectId: number | null;
  projectSourceWorldId: number | null;
  source: AuthoringContextSource;
  followActive: boolean;
  isReady: boolean;
}

export interface UiStudioActionsContext {
  setTab: (tab: UiStudioTabId) => void;
}

/**
 * Minimal description of a prompt block surfaced to capability consumers.
 * Intentionally narrower than `PromptBlockResponse` from the API client so
 * consumers don't take a transitive dep on the block-templates client.
 *
 * Providers are encouraged to populate as many fields as they have on hand;
 * `blockId` is the only required field.
 */
export interface BlockSummary {
  /** Fully-qualified block id (e.g. "core.camera.angle.eye_level"). */
  blockId: string;
  /** Composition role (subject, camera, lighting, etc.). */
  role?: string | null;
  /** Sub-category within a role. */
  category?: string | null;
  /** Source pack name (package_name). */
  packageName?: string | null;
  /** Rendered text of the block, if known. */
  text?: string | null;
  /** Free-form tags attached to the block, if known. */
  tags?: Record<string, unknown>;
  /** Capabilities advertised by the block's schema. */
  capabilities?: string[];
}

/**
 * Capability shape for `CAP_BLOCK_SELECTION`. Modeled on `AssetSelection`:
 * a single "currently focused" item plus an optional clear action.
 *
 * Providers (e.g. Block Explorer) call `useProvideCapability` and gate on
 * `isAvailable: () => block !== null`. Consumers (Block Authoring, future
 * shadow-analysis / prompt-library panels) read via
 * `useCapability<BlockSelection>(CAP_BLOCK_SELECTION)` and get `{ block: null }`
 * when nothing is selected.
 */
export interface BlockSelection {
  block: BlockSummary | null;
  /** Optional: clear the selection back to null. */
  clear?: () => void;
}
