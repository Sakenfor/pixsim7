import { useCallback, useMemo } from 'react';

import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';

import type { MediaCardActions } from '@/components/media/MediaCard';

import {
  resolveGestureHandler,
  getGestureActionLabel,
  computeGestureCount,
  isScalableAction,
  isChainDurationAction,
  type GestureResolverContext,
} from './gestureActions';
import {
  useGestureConfigStore,
  getActionForDirection,
  getChainActionForDirection,
} from './useGestureConfigStore';
import { useGestureSecondaryStore, resolveDurationFromDy } from './useGestureSecondaryStore';
import type { GestureDirection, GestureEvent } from './useMouseGesture';
import { useMouseGesture } from './useMouseGesture';

// ─── Options & Result ─────────────────────────────────────────────────────────

export interface UseCardGesturesOptions {
  id: number;
  actions?: MediaCardActions;
  onToggleFavorite?: () => void;
  onUploadClick?: (id: number) => Promise<unknown> | void;
  onUploadToProvider?: (id: number, providerId: string) => Promise<void> | void;
}

export interface UseCardGesturesResult {
  gestureHandlers: { onPointerDown: (e: React.PointerEvent) => void };
  gestureConsumed: React.RefObject<boolean>;
  /** Whether gesture system is enabled (from config store) */
  enabled: boolean;
  /** True when gesture is past the commit threshold */
  isCommitted: boolean;
  /** Current gesture direction (null when not committed) */
  direction: GestureDirection | null;
  /** Resolved action ID for the current direction (null when not committed) */
  actionId: string | null;
  /** Human-readable label for the active action */
  actionLabel: string | null;
  /** Repeat count for scalable actions (undefined otherwise) */
  count: number | undefined;
  /** Duration override from chain gesture (undefined if no chain duration) */
  duration: number | undefined;
  /** Duration unit label (e.g. 's') */
  durationUnit: string;
  /** Edge inset value (for OverlayContainer customState) */
  edgeInset: number;
  /** Raw gesture phase string for OverlayContainer customState */
  phase: 'idle' | 'pending' | 'committed';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCardGestures({
  id,
  actions,
  onToggleFavorite,
  onUploadClick,
  onUploadToProvider,
}: UseCardGesturesOptions): UseCardGesturesResult {
  // Config store subscriptions
  const gestureEnabled = useGestureConfigStore((s) => s.enabled);
  const gestureThreshold = useGestureConfigStore((s) => s.threshold);
  const gestureEdgeInset = useGestureConfigStore((s) => s.edgeInset);
  const gestureUp = useGestureConfigStore((s) => s.gestureUp);
  const gestureDown = useGestureConfigStore((s) => s.gestureDown);
  const gestureLeft = useGestureConfigStore((s) => s.gestureLeft);
  const gestureRight = useGestureConfigStore((s) => s.gestureRight);
  const chainUp = useGestureConfigStore((s) => s.chainUp);
  const chainDown = useGestureConfigStore((s) => s.chainDown);
  const chainLeft = useGestureConfigStore((s) => s.chainLeft);
  const chainRight = useGestureConfigStore((s) => s.chainRight);

  const gestureDirections = useMemo(
    () => ({ gestureUp, gestureDown, gestureLeft, gestureRight }),
    [gestureUp, gestureDown, gestureLeft, gestureRight],
  );

  const chainDirections = useMemo(
    () => ({ chainUp, chainDown, chainLeft, chainRight }),
    [chainUp, chainDown, chainLeft, chainRight],
  );

  const defaultUploadProviderId = useUploadProviderStore((s) => s.defaultUploadProviderId);

  // Build resolver context
  const resolverContext: GestureResolverContext = useMemo(
    () => ({
      actions,
      onToggleFavorite,
      onUploadClick,
      onUploadToProvider,
      defaultUploadProviderId,
    }),
    [actions, onToggleFavorite, onUploadClick, onUploadToProvider, defaultUploadProviderId],
  );

  const { gestureHandlers, activeGesture, gestureConsumed } = useMouseGesture({
    enabled: gestureEnabled,
    threshold: gestureThreshold,
    edgeInset: gestureEdgeInset,
    onGesture: useCallback(
      (event: GestureEvent) => {
        if (event.type !== 'swipe') return;
        const actionId = getActionForDirection(gestureDirections, event.direction);
        const handler = resolveGestureHandler(actionId, resolverContext);
        if (!handler) return;

        const count = isScalableAction(actionId)
          ? computeGestureCount(Math.abs(event.dx), gestureThreshold)
          : undefined;
        const chainAction = getChainActionForDirection(chainDirections, event.direction);
        const duration = isChainDurationAction(chainAction)
          ? resolveDurationFromDy(event.dy, useGestureSecondaryStore.getState())
          : undefined;
        handler(id, count, duration !== undefined ? { duration } : undefined);
      },
      [gestureDirections, chainDirections, gestureThreshold, resolverContext, id],
    ),
  });

  // Visual feedback derivations
  const isCommitted = activeGesture?.phase === 'committed';

  const activeActionId = isCommitted
    ? getActionForDirection(gestureDirections, activeGesture.direction)
    : null;

  const activeCount = isCommitted && activeActionId
    ? computeGestureCount(Math.abs(activeGesture.dx), gestureThreshold)
    : undefined;

  const secondaryState = useGestureSecondaryStore();
  const activeChainAction = isCommitted
    ? getChainActionForDirection(chainDirections, activeGesture.direction)
    : 'none';
  const activeDuration = isCommitted
    && isChainDurationAction(activeChainAction)
    && secondaryState.options.length > 0
    ? resolveDurationFromDy(activeGesture.dy, secondaryState)
    : undefined;

  return {
    gestureHandlers,
    gestureConsumed,
    enabled: gestureEnabled,
    isCommitted,
    direction: isCommitted ? activeGesture.direction : null,
    actionId: activeActionId,
    actionLabel: activeActionId ? getGestureActionLabel(activeActionId) : null,
    count: activeCount,
    duration: activeDuration,
    durationUnit: secondaryState.unit,
    edgeInset: gestureEdgeInset,
    phase: activeGesture?.phase ?? 'idle',
  };
}
