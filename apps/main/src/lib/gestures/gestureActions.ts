import type { MediaCardActions } from '@/components/media/MediaCard';

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
  { id: 'archive', label: 'Archive', actionKey: 'onArchive' },
  { id: 'delete', label: 'Delete', actionKey: 'onDelete' },
  { id: 'toggleFavorite', label: 'Toggle Favorite' },
  { id: 'approve', label: 'Approve', actionKey: 'onApprove' },
  { id: 'reject', label: 'Reject', actionKey: 'onReject' },
] as const satisfies readonly GestureActionDef[];

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
 */
export function resolveGestureHandler(
  actionId: string,
  actions: MediaCardActions | undefined,
  extra?: { onToggleFavorite?: () => void },
): ((id: number, count?: number, overrides?: { duration?: number }) => void) | undefined {
  if (actionId === 'none' || !actions) return undefined;

  // Special case: toggleFavorite doesn't take an id
  if (actionId === 'toggleFavorite' && extra?.onToggleFavorite) {
    return () => extra.onToggleFavorite!();
  }

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
