import { resolveUploadTarget } from '@features/assets/lib/resolveUploadTarget';

import type { MediaCardActions } from '@/components/media/MediaCard';

export interface GestureResolverContext {
  actions?: MediaCardActions;
  onToggleFavorite?: () => void;
  onUploadClick?: (id: number) => Promise<unknown> | void;
  onUploadToProvider?: (id: number, providerId: string) => Promise<void> | void;
  defaultUploadProviderId?: string | null;
}

export interface GestureActionDef {
  readonly id: string;
  readonly label: string;
  readonly actionKey?: keyof MediaCardActions;
  /** When true, drag distance maps to a repeat count (1–10) */
  readonly scalable?: boolean;
}

export const GESTURE_ACTIONS = [
  { id: 'none', label: 'No Action' },
  { id: 'upload', label: 'Upload', actionKey: 'onUploadToProvider' },
  { id: 'quickGenerate', label: 'Quick Generate', actionKey: 'onQuickGenerate', scalable: true },
  { id: 'openDetails', label: 'Open Details', actionKey: 'onOpenDetails' },
  { id: 'addToGenerate', label: 'Add to Generate', actionKey: 'onAddToGenerate' },
  { id: 'addToActiveSet', label: 'Add to Active Set', actionKey: 'onAddToActiveSet' },
  { id: 'quickAdd', label: 'Quick Add', actionKey: 'onQuickAdd' },
  { id: 'imageToImage', label: 'Image to Image', actionKey: 'onImageToImage' },
  { id: 'imageToVideo', label: 'Image to Video', actionKey: 'onImageToVideo' },
  { id: 'videoExtend', label: 'Extend Video', actionKey: 'onVideoExtend' },
  { id: 'upgradeModel', label: 'Upgrade Model', actionKey: 'onUpgradeModel' },
  { id: 'patchAsset', label: 'Patch Asset', actionKey: 'onPatchAsset' },
  { id: 'archive', label: 'Archive', actionKey: 'onArchive' },
  { id: 'delete', label: 'Delete', actionKey: 'onDelete' },
  { id: 'toggleFavorite', label: 'Toggle Favorite' },
  { id: 'approve', label: 'Approve', actionKey: 'onApprove' },
  { id: 'reject', label: 'Reject', actionKey: 'onReject' },
] as const satisfies readonly GestureActionDef[];

// ─── Viewer-specific gesture actions ─────────────────────────────────────────

export interface ViewerGestureActionDef {
  readonly id: string;
  readonly label: string;
}

export const VIEWER_GESTURE_ACTIONS = [
  { id: 'navigatePrev', label: 'Previous Asset' },
  { id: 'navigateNext', label: 'Next Asset' },
  { id: 'closeViewer', label: 'Close Viewer' },
  { id: 'toggleFitMode', label: 'Toggle Fit' },
] as const satisfies readonly ViewerGestureActionDef[];

export type ViewerGestureActionId = (typeof VIEWER_GESTURE_ACTIONS)[number]['id'];

/** All actions available in viewer context (shared + viewer-specific). */
export const ALL_VIEWER_ACTIONS = [...GESTURE_ACTIONS, ...VIEWER_GESTURE_ACTIONS] as const;

export type GestureActionId = (typeof GESTURE_ACTIONS)[number]['id'];

/**
 * Look up the action label for a given action ID.
 */
export function getGestureActionLabel(actionId: string): string {
  const def = GESTURE_ACTIONS.find((a) => a.id === actionId);
  return def?.label ?? actionId;
}

/**
 * Compute a repeat count from drag distance for scalable actions.
 * Each `threshold` of distance past the initial threshold adds 1, capped at 10.
 */
export function computeGestureCount(distance: number, threshold: number): number {
  return Math.min(10, Math.max(1, Math.floor(distance / threshold)));
}

/**
 * Check whether an action supports drag-distance scaling.
 */
export function isScalableAction(actionId: string): boolean {
  const def = GESTURE_ACTIONS.find((a) => a.id === actionId);
  return !!def && 'scalable' in def && !!def.scalable;
}

// ─── Distance-based action cascade ──────────────────────────────────────────

export interface CascadeResolution {
  actionId: string;
  tierIndex: number;
  totalTiers: number;
  /** true when the direction has >1 action configured */
  isCascade: boolean;
}

/**
 * Resolve which action tier is active based on drag distance.
 *
 * - Tier 0 activates at the commit `threshold`
 * - Each subsequent tier at `threshold + (tierIndex * stepPixels)`
 * - Single-element arrays return `isCascade: false` (preserving scalable count behavior)
 */
export function resolveCascadeAction(
  actions: string[],
  distance: number,
  threshold: number,
  stepPixels: number,
): CascadeResolution {
  if (actions.length <= 1) {
    return {
      actionId: actions[0] ?? 'none',
      tierIndex: 0,
      totalTiers: actions.length,
      isCascade: false,
    };
  }

  // Distance past the commit threshold determines the tier
  const pastThreshold = Math.max(0, distance - threshold);
  const tierIndex = Math.min(actions.length - 1, Math.floor(pastThreshold / stepPixels));

  return {
    actionId: actions[tierIndex],
    tierIndex,
    totalTiers: actions.length,
    isCascade: true,
  };
}

// ─── Chain gesture actions (perpendicular axis after primary commit) ─────────

export interface ChainGestureActionDef {
  readonly id: string;
  readonly label: string;
}

export const CHAIN_GESTURE_ACTIONS = [
  { id: 'none', label: 'None' },
  { id: 'cycleDuration', label: 'Cycle Duration' },
] as const satisfies readonly ChainGestureActionDef[];

export type ChainGestureActionId = (typeof CHAIN_GESTURE_ACTIONS)[number]['id'];

export function getChainActionLabel(chainActionId: string): string {
  const def = CHAIN_GESTURE_ACTIONS.find((a) => a.id === chainActionId);
  return def?.label ?? chainActionId;
}

/**
 * Check whether a chain action controls duration (vertical axis → duration cycling).
 */
export function isChainDurationAction(chainActionId: string): boolean {
  return chainActionId === 'cycleDuration';
}

/**
 * Resolve a gesture action ID to a callable handler.
 * Returns undefined if the action is 'none', not found, or the handler isn't provided.
 *
 * Handles all special-case action mappings centrally:
 * - `toggleFavorite` → context.onToggleFavorite (no id param)
 * - `quickGenerate` → falls back to actions.onQuickAdd when onQuickGenerate missing
 * - `upload` → resolves via context.onUploadClick / context.onUploadToProvider
 */
export function resolveGestureHandler(
  actionId: string,
  context: GestureResolverContext,
): ((id: number, count?: number, overrides?: { duration?: number }) => void) | undefined {
  const { actions } = context;
  if (actionId === 'none') return undefined;

  // Special case: toggleFavorite doesn't take an id
  if (actionId === 'toggleFavorite' && context.onToggleFavorite) {
    return () => context.onToggleFavorite!();
  }

  // Review action fallback chain so review presets remain usable even when a
  // surface does not provide dedicated review handlers.
  if (actionId === 'approve') {
    if (actions?.onApprove) {
      return actions.onApprove as (id: number) => void;
    }
    if (actions?.onAddToActiveSet) {
      return actions.onAddToActiveSet as (id: number) => void;
    }
    if (context.onToggleFavorite) {
      return () => context.onToggleFavorite!();
    }
    return undefined;
  }

  if (actionId === 'reject') {
    if (actions?.onReject) {
      return actions.onReject as (id: number) => void;
    }
    if (actions?.onArchive) {
      return actions.onArchive as (id: number) => void;
    }
    return undefined;
  }

  // Special case: upload — actions.onUploadToProvider is rarely populated by
  // the action factory, so resolve via runtime upload props.
  // Priority: provider-aware path first (respects user's chosen default
  // provider in the upload button group), then fall back to onUploadClick
  // which is typically a library-only upload.
  if (actionId === 'upload') {
    if (actions?.onUploadToProvider) {
      return actions.onUploadToProvider as (id: number) => void;
    }
    if (context.onUploadToProvider) {
      const target = resolveUploadTarget(context.defaultUploadProviderId ?? null);
      if (target) {
        return (id: number) => context.onUploadToProvider!(id, target.providerId);
      }
    }
    if (context.onUploadClick) {
      return (id: number) => context.onUploadClick!(id);
    }
    return undefined;
  }

  if (!actions) return undefined;

  // Back-compat: many surfaces expose quick generation via onQuickAdd only.
  // Let the "quickGenerate" gesture trigger that path when a dedicated
  // onQuickGenerate handler is not provided.
  if (actionId === 'quickGenerate' && !actions.onQuickGenerate && actions.onQuickAdd) {
    return () => actions.onQuickAdd!();
  }

  const def = GESTURE_ACTIONS.find((a) => a.id === actionId);
  if (!def || !('actionKey' in def) || !def.actionKey) return undefined;

  const handler = actions[def.actionKey];
  if (typeof handler !== 'function') return undefined;

  return handler as (id: number, count?: number, overrides?: { duration?: number }) => void;
}
