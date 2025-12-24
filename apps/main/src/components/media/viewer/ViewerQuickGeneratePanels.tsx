import { useCallback } from "react";
import type { IDockviewPanelProps } from "dockview-core";
import { PromptInput } from "@pixsim7/shared.ui";
import { GenerationSettingsPanel, type GenerationModel } from "@features/generation";
import { Icon } from "@lib/icons";
import type { ViewerAsset } from "@features/assets";
import {
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  useCapability,
  useProvideCapability,
  type PromptBoxContext,
  type AssetInputContext,
  type GenerateActionContext,
} from "@features/contextHub";
import { Ref, type AssetRef } from "@pixsim7/shared.types";
import { resolveAssetMediaType } from "@features/assets/lib/assetMediaType";

export type ViewerQuickGenSettingsMode = "asset" | "controlCenter";

export interface ViewerQuickGenContext {
  asset: ViewerAsset;
  activePrompt: string;
  setActivePrompt: (value: string) => void;
  maxChars: number;
  generating: boolean;
  activeError: string | null;
  assetLoading: boolean;
  settingsMode: ViewerQuickGenSettingsMode;
  setSettingsMode: (mode: ViewerQuickGenSettingsMode) => void;
  hasSourceGeneration: boolean;
  assetGeneration: GenerationModel | null;
  handleGenerate: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  canGenerate: boolean;
}

type PanelProps = IDockviewPanelProps & { context?: ViewerQuickGenContext };

export function ViewerQuickGenPromptPanel({ context }: PanelProps) {
  const noop = useCallback((..._args: any[]) => {}, []);
  const asset = context?.asset ?? null;
  const activePrompt = context?.activePrompt ?? "";
  const setActivePrompt = context?.setActivePrompt ?? noop;
  const maxChars = context?.maxChars ?? 0;
  const generating = context?.generating ?? false;
  const activeError = context?.activeError ?? null;
  const assetLoading = context?.assetLoading ?? false;
  const settingsMode = context?.settingsMode ?? "controlCenter";
  const handleKeyDown = context?.handleKeyDown ?? noop;
  const isReady = !!context;

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: "viewer-quickgen:prompt-box",
      label: "Prompt Box",
      priority: 50,
      isAvailable: () => isReady,
      getValue: () => ({
        prompt: activePrompt,
        setPrompt: setActivePrompt,
        maxChars,
      }),
    },
    [activePrompt, setActivePrompt, maxChars, isReady],
  );

  useProvideCapability<AssetInputContext>(
    CAP_ASSET_INPUT,
    {
      id: "viewer-quickgen:asset-input",
      label: "Asset Input",
      priority: 40,
      isAvailable: () => isReady,
      getValue: () => {
        const id = asset ? Number(asset.id) : NaN;
        const ref = Number.isFinite(id) ? Ref.asset(id) : null;
        const refs = ref ? ([ref] as AssetRef[]) : [];
        const resolvedType = resolveAssetMediaType(asset);
        const types =
          resolvedType === "image" || resolvedType === "video"
            ? [resolvedType]
            : [];

        return {
          assets: asset ? [asset] : [],
          supportsMulti: false,
          ref,
          refs,
          selection: {
            count: refs.length,
            min: 0,
            max: 1,
            mode: "single",
          },
          constraints: {
            types: types.length > 0 ? types : undefined,
            canMixTypes: false,
          },
          status:
            refs.length > 0
              ? { ready: true }
              : { ready: false, reason: "Select an asset to generate from." },
        };
      },
    },
    [asset, isReady],
  );

  if (!context) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div
        className={`relative flex-1 transition-all duration-300 ${
          activeError ? "ring-2 ring-red-500 ring-offset-2 rounded-lg animate-pulse" : ""
        }`}
        onKeyDown={handleKeyDown}
      >
        <PromptInput
          value={activePrompt}
          onChange={setActivePrompt}
          maxChars={maxChars}
          placeholder={
            settingsMode === "asset"
              ? "Edit original prompt..."
              : "Describe the generation..."
          }
          disabled={generating || (settingsMode === "asset" && assetLoading)}
          autoFocus
          variant="compact"
          resizable
          minHeight={48}
          showCounter={true}
          className="h-full"
        />
        <div className="pointer-events-none absolute bottom-2 right-2 text-[10px] text-neutral-400 dark:text-neutral-500">
          Press Enter to generate, Esc to close
        </div>
      </div>
    </div>
  );
}

export function ViewerQuickGenSettingsPanel({ context }: PanelProps) {
  const { value: promptBox } = useCapability<PromptBoxContext>(CAP_PROMPT_BOX);
  const noop = useCallback((..._args: any[]) => {}, []);
  const settingsMode = context?.settingsMode ?? "controlCenter";
  const setSettingsMode = context?.setSettingsMode ?? noop;
  const hasSourceGeneration = context?.hasSourceGeneration ?? false;
  const assetGeneration = context?.assetGeneration ?? null;
  const assetLoading = context?.assetLoading ?? false;
  const generating = context?.generating ?? false;
  const canGenerate = context?.canGenerate ?? false;
  const handleGenerate = context?.handleGenerate ?? noop;
  const activeError = context?.activeError ?? null;
  const isReady = !!context;

  const resolvedCanGenerate =
    promptBox?.prompt?.trim().length ? promptBox.prompt.trim().length > 0 : canGenerate;

  useProvideCapability<GenerateActionContext>(
    CAP_GENERATE_ACTION,
    {
      id: "viewer-quickgen:generate-action",
      label: "Generate Action",
      priority: 40,
      isAvailable: () => isReady,
      getValue: () => ({
        canGenerate: resolvedCanGenerate,
        generating,
        error: activeError,
        generate: handleGenerate,
      }),
    },
    [resolvedCanGenerate, generating, activeError, handleGenerate, isReady],
  );

  if (!context) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="h-full p-2 space-y-2">
      <div className="flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-0.5">
        <button
          onClick={() => setSettingsMode("asset")}
          disabled={!hasSourceGeneration}
          className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
            settingsMode === "asset"
              ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
              : hasSourceGeneration
                ? "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                : "text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
          }`}
          title={
            hasSourceGeneration
              ? "Use original generation settings"
              : "No source generation for this asset"
          }
        >
          Asset
        </button>
        <button
          onClick={() => setSettingsMode("controlCenter")}
          className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
            settingsMode === "controlCenter"
              ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
          }`}
          title="Use Control Center settings"
        >
          My Settings
        </button>
      </div>

      {settingsMode === "asset" && assetLoading && (
        <div className="flex items-center justify-center py-2 text-neutral-500">
          <Icon name="loader" size={14} className="animate-spin mr-2" />
          <span className="text-xs">Loading generation settings...</span>
        </div>
      )}

      {settingsMode === "asset" && assetGeneration && !assetLoading && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 px-1">
          Original: {assetGeneration.providerId} × {assetGeneration.operationType}
        </div>
      )}

      <div className="-mx-2">
        <GenerationSettingsPanel
          showOperationType={true}
          generating={generating}
          canGenerate={resolvedCanGenerate}
          onGenerate={handleGenerate}
          error={activeError || undefined}
        />
      </div>
    </div>
  );
}

export function ViewerQuickGenInfoPanel({ context }: PanelProps) {
  if (!context) {
    return null;
  }

  const { asset, settingsMode, hasSourceGeneration } = context;

  return (
    <div className="h-full p-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
      <div>
        <div className="text-[10px] uppercase text-neutral-400">Asset</div>
        <div className="font-medium text-neutral-800 dark:text-neutral-100">
          {asset.name}
        </div>
        <div>
          {asset.type} · {asset.source}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-neutral-400">Mode</div>
        <div>
          {settingsMode === "asset" ? "Asset settings" : "My settings"}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-neutral-400">Source Generation</div>
        <div>{hasSourceGeneration ? "Available" : "Not available"}</div>
      </div>
    </div>
  );
}
