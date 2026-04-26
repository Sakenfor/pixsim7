/**
 * Shared types and constants for QuickGenerate panels.
 * Split from QuickGeneratePanels.tsx for reuse across panel modules.
 */
import type { IDockviewPanelProps } from 'dockview-core';

import type { ParamSpec } from '@lib/generation-ui';

import type { AssetModel } from '@features/assets';
import type { GenerationSourceMode } from '@features/contextHub';
import type { InputItem } from '@features/generation';


import type { OperationType } from '@/types/operations';


// Panel IDs
export type QuickGenPanelId =
  | 'quickgen-asset'
  | 'quickgen-prompt'
  | 'quickgen-settings';

// Shared context passed to all panels
export interface QuickGenPanelContext {
  // Asset panel
  displayAssets: AssetModel[];
  operationInputs: InputItem[];
  operationInputIndex: number;
  operationType: OperationType;
  isFlexibleOperation: boolean;
  removeInput: (operationType: OperationType, inputId: string) => void;
  reorderInput?: (operationType: OperationType, fromSlotIndex: number, toSlotIndex: number) => void;
  updateLockedTimestamp: (operationType: OperationType, inputId: string, timestamp: number | undefined) => void;
  cycleInputs: (operationType: OperationType, direction: 'prev' | 'next') => void;
  setOperationInputIndex: (index: number) => void;
  transitionPrompts?: string[];
  setTransitionPrompts?: React.Dispatch<React.SetStateAction<string[]>>;
  transitionDurations?: number[];
  setTransitionDurations?: React.Dispatch<React.SetStateAction<number[]>>;

  // Prompt panel
  prompt: string;
  setPrompt: (value: string) => void;
  providerId?: string;
  model?: string;
  paramSpecs?: ParamSpec[];
  generating: boolean;
  error?: string | null;

  // Settings panel
  renderSettingsPanel?: () => React.ReactNode;

  // Target toggle
  targetProviderId?: string;
  generationScopeId?: string;

  // History panel source label
  sourceLabel?: string;

  // Source toggle (Asset / My Settings)
  sourceToggleMode?: GenerationSourceMode;
  sourceToggleGenerationId?: number | null;
  onSourceToggleModeChange?: (mode: GenerationSourceMode) => void;

  // Optional host-level asset open action (viewer, lightbox, inspector, etc.)
  onOpenAsset?: (asset: AssetModel, assetList?: AssetModel[]) => void;
  // Backward-compatible alias for viewer-specific hosts.
  openAssetInViewer?: (asset: AssetModel, assetList?: AssetModel[]) => void;
}

// Panel props with injected context from SmartDockview
export interface QuickGenPanelProps extends IDockviewPanelProps {
  context?: Partial<QuickGenPanelContext>;
  panelId: string;
}

export const EMPTY_INPUTS: InputItem[] = [];
