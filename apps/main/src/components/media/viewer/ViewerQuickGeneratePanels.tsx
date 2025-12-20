import type { IDockviewPanelProps } from "dockview-core";
import { PromptInput } from "@pixsim7/shared.ui";
import { GenerationSettingsPanel } from "@features/generation";
import { Icon } from "@lib/icons";
import type { ViewerAsset } from "@features/assets";
import type { GenerationResponse } from "@lib/api/generations";

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
  assetGeneration: GenerationResponse | null;
  handleGenerate: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  canGenerate: boolean;
}

type PanelProps = IDockviewPanelProps & { context?: ViewerQuickGenContext };

export function ViewerQuickGenPromptPanel({ context }: PanelProps) {
  if (!context) {
    return null;
  }

  const {
    activePrompt,
    setActivePrompt,
    maxChars,
    generating,
    activeError,
    assetLoading,
    settingsMode,
    handleKeyDown,
  } = context;

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
  if (!context) {
    return null;
  }

  const {
    settingsMode,
    setSettingsMode,
    hasSourceGeneration,
    assetGeneration,
    assetLoading,
    generating,
    canGenerate,
    handleGenerate,
    activeError,
  } = context;

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
          Original: {assetGeneration.provider_id} × {assetGeneration.operation_type}
        </div>
      )}

      <div className="-mx-2">
        <GenerationSettingsPanel
          showOperationType={true}
          generating={generating}
          canGenerate={canGenerate}
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
