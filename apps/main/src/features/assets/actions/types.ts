/**
 * AssetActionDescriptor — a surface-agnostic action targeting a single asset.
 *
 * Surfaces (right-click menu, hover button group, swipe gestures, hotkeys)
 * adapt descriptors into their own rendering. The descriptor owns
 * identity, default presentation, visibility, and execution; surfaces own
 * how the action is triggered and how busy/loading state is shown.
 */

import type { GenerationWidgetContext } from '@features/contextHub';

import type { OperationType } from '@/types/operations';

import type { AssetModel } from '../models/asset';

export interface AssetActionExecCtx {
  widget: GenerationWidgetContext;
  fallbackOperationType: OperationType;
  scopeId?: string;
}

export interface AssetActionDescriptor<P = void> {
  id: string;
  defaultLabel: string;
  defaultIcon: string;
  /** Capability IDs the menu surface uses to gate visibility. */
  requiredCapabilities?: string[];
  isVisible: (asset: AssetModel) => boolean;
  execute: (asset: AssetModel, ctx: AssetActionExecCtx, params: P) => Promise<void> | void;
}
