/**
 * GestureOverlay
 *
 * Shared visual feedback overlays for gesture interactions.
 * Used by both MediaCard (gallery) and MediaPanel (viewer).
 */

import { getGestureActionLabel, isScalableAction } from './gestureActions';
import type { GestureDirection } from './useMouseGesture';

const DIRECTION_ARROWS: Record<GestureDirection, string> = {
  up: '\u2191',
  down: '\u2193',
  left: '\u2190',
  right: '\u2192',
};

export function GestureCancelOverlay({ actionLabel }: {
  actionLabel: string;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/25 rounded-t-md pointer-events-none select-none transition-opacity duration-150">
      <span className="text-2xl text-white/60 drop-shadow-md">{'\u2715'}</span>
      <span className="mt-1 text-xs font-medium text-white/50 drop-shadow-sm line-through">
        {actionLabel}
      </span>
    </div>
  );
}

export function GestureOverlay({ direction, actionId, count, duration, durationUnit, tierIndex, totalTiers, isCascade }: {
  direction: GestureDirection;
  actionId: string;
  count?: number;
  duration?: number;
  durationUnit?: string;
  tierIndex?: number;
  totalTiers?: number;
  isCascade?: boolean;
}) {
  const label = getGestureActionLabel(actionId);
  const showCount = count != null && count > 1 && isScalableAction(actionId);
  const showDuration = duration != null;
  const showCascadeDots = isCascade && totalTiers != null && totalTiers > 1;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 rounded-t-md pointer-events-none select-none">
      <span className="text-3xl text-white drop-shadow-md">{DIRECTION_ARROWS[direction]}</span>
      {actionId !== 'none' && (
        <span className="mt-1 text-xs font-medium text-white/90 drop-shadow-sm">
          {label}
          {showCount && <span className="ml-1 tabular-nums font-bold">&times;{count}</span>}
          {showDuration && <span className="ml-1 tabular-nums opacity-80">&middot; {duration}{durationUnit || 's'}</span>}
        </span>
      )}
      {showCascadeDots && (
        <div className="mt-1.5 flex gap-1">
          {Array.from({ length: totalTiers! }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i <= (tierIndex ?? 0) ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
