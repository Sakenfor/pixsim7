import { useCallback, useMemo, useRef } from 'react';

import type { PresetGestureOverrides } from '@lib/ui/overlay';
import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';

import type { MediaCardActions } from '@/components/media/MediaCard';

import {
  resolveGestureHandler,
  getGestureActionLabel,
  computeGestureCount,
  isScalableAction,
  isChainDurationAction,
  resolveCascadeAction,
  type GestureResolverContext,
} from './gestureActions';
import {
  useGestureConfigStore,
  getCascadeActionsForDirection,
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
  presetGestureOverrides?: PresetGestureOverrides;
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
  /** Current cascade tier index (0-based), undefined when not cascade */
  tierIndex: number | undefined;
  /** Total cascade tiers for current direction, undefined when not cascade */
  totalTiers: number | undefined;
  /** True when direction has multiple actions (cascade mode active) */
  isCascade: boolean;
  /** True when user has dragged back to center after committing (cancel zone) */
  isReturning: boolean;
  /** The direction that was active before the user returned to center */
  returningDirection: GestureDirection | null;
  /** The action label that was active before the user returned to center */
  returningActionLabel: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCardGestures({
  id,
  actions,
  onToggleFavorite,
  onUploadClick,
  onUploadToProvider,
  presetGestureOverrides,
}: UseCardGesturesOptions): UseCardGesturesResult {
  // Config store subscriptions
  const gestureEnabled = useGestureConfigStore((s) => s.enabled);
  const gestureThreshold = useGestureConfigStore((s) => s.threshold);
  const gestureEdgeInset = useGestureConfigStore((s) => s.edgeInset);
  const cascadeStepPixels = useGestureConfigStore((s) => s.cascadeStepPixels);
  const gestureUp = useGestureConfigStore((s) => s.gestureUp);
  const gestureDown = useGestureConfigStore((s) => s.gestureDown);
  const gestureLeft = useGestureConfigStore((s) => s.gestureLeft);
  const gestureRight = useGestureConfigStore((s) => s.gestureRight);
  const chainUp = useGestureConfigStore((s) => s.chainUp);
  const chainDown = useGestureConfigStore((s) => s.chainDown);
  const chainLeft = useGestureConfigStore((s) => s.chainLeft);
  const chainRight = useGestureConfigStore((s) => s.chainRight);

  const effectiveGestureEnabled = presetGestureOverrides?.enabled ?? gestureEnabled;
  const effectiveGestureThreshold = presetGestureOverrides?.threshold ?? gestureThreshold;
  const effectiveGestureEdgeInset = presetGestureOverrides?.edgeInset ?? gestureEdgeInset;
  const effectiveCascadeStepPixels = presetGestureOverrides?.cascadeStepPixels ?? cascadeStepPixels;
  const effectiveGestureUp = presetGestureOverrides?.gestureUp ?? gestureUp;
  const effectiveGestureDown = presetGestureOverrides?.gestureDown ?? gestureDown;
  const effectiveGestureLeft = presetGestureOverrides?.gestureLeft ?? gestureLeft;
  const effectiveGestureRight = presetGestureOverrides?.gestureRight ?? gestureRight;
  const effectiveChainUp = presetGestureOverrides?.chainUp ?? chainUp;
  const effectiveChainDown = presetGestureOverrides?.chainDown ?? chainDown;
  const effectiveChainLeft = presetGestureOverrides?.chainLeft ?? chainLeft;
  const effectiveChainRight = presetGestureOverrides?.chainRight ?? chainRight;

  const gestureDirections = useMemo(
    () => ({
      gestureUp: effectiveGestureUp,
      gestureDown: effectiveGestureDown,
      gestureLeft: effectiveGestureLeft,
      gestureRight: effectiveGestureRight,
    }),
    [effectiveGestureUp, effectiveGestureDown, effectiveGestureLeft, effectiveGestureRight],
  );

  const chainDirections = useMemo(
    () => ({
      chainUp: effectiveChainUp,
      chainDown: effectiveChainDown,
      chainLeft: effectiveChainLeft,
      chainRight: effectiveChainRight,
    }),
    [effectiveChainUp, effectiveChainDown, effectiveChainLeft, effectiveChainRight],
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
    enabled: effectiveGestureEnabled,
    threshold: effectiveGestureThreshold,
    edgeInset: effectiveGestureEdgeInset,
    onGesture: useCallback(
      (event: GestureEvent) => {
        if (event.type !== 'swipe') return;
        const cascadeActions = getCascadeActionsForDirection(gestureDirections, event.direction);
        const cascade = resolveCascadeAction(
          cascadeActions, event.distance, effectiveGestureThreshold, effectiveCascadeStepPixels,
        );
        const handler = resolveGestureHandler(cascade.actionId, resolverContext);
        if (!handler) return;

        // Scalable count only when not in cascade mode
        const count = !cascade.isCascade && isScalableAction(cascade.actionId)
          ? computeGestureCount(Math.abs(event.dx), effectiveGestureThreshold)
          : undefined;

        const chainAction = getChainActionForDirection(chainDirections, event.direction);
        const duration = isChainDurationAction(chainAction)
          ? resolveDurationFromDy(event.dy, useGestureSecondaryStore.getState())
          : undefined;
        handler(id, count, duration !== undefined ? { duration } : undefined);
      },
      [gestureDirections, chainDirections, effectiveGestureThreshold, effectiveCascadeStepPixels, resolverContext, id],
    ),
  });

  // Visual feedback derivations
  const isCommitted = activeGesture?.phase === 'committed';
  const phase = activeGesture?.phase ?? 'idle';

  // Track "was committed" to detect returning-to-center cancel state.
  // We store the last committed direction + action label so the cancel overlay
  // can show what action is being cancelled.
  const lastCommittedRef = useRef<{
    direction: GestureDirection;
    actionLabel: string;
  } | null>(null);

  if (isCommitted && activeGesture) {
    // Snapshot the committed state so we can reference it if user uncommits
    const cascade = resolveCascadeAction(
      getCascadeActionsForDirection(gestureDirections, activeGesture.direction),
      activeGesture.distance,
      effectiveGestureThreshold,
      effectiveCascadeStepPixels,
    );
    lastCommittedRef.current = {
      direction: activeGesture.direction,
      actionLabel: getGestureActionLabel(cascade.actionId),
    };
  } else if (phase === 'idle') {
    // Reset when gesture ends
    lastCommittedRef.current = null;
  }

  const isReturning = phase === 'pending' && lastCommittedRef.current !== null;

  // Live cascade resolution — re-resolves on every pointermove
  const activeCascade = isCommitted
    ? resolveCascadeAction(
        getCascadeActionsForDirection(gestureDirections, activeGesture.direction),
        activeGesture.distance,
        effectiveGestureThreshold,
        effectiveCascadeStepPixels,
      )
    : null;

  const activeActionId = activeCascade?.actionId ?? null;

  // Scalable count only in single-action (non-cascade) mode
  const activeCount = isCommitted && activeActionId && activeCascade && !activeCascade.isCascade
    ? computeGestureCount(Math.abs(activeGesture.dx), effectiveGestureThreshold)
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
    enabled: effectiveGestureEnabled,
    isCommitted,
    direction: isCommitted ? activeGesture.direction : null,
    actionId: activeActionId,
    actionLabel: activeActionId ? getGestureActionLabel(activeActionId) : null,
    count: activeCount,
    duration: activeDuration,
    durationUnit: secondaryState.unit,
    edgeInset: effectiveGestureEdgeInset,
    phase,
    tierIndex: activeCascade?.isCascade ? activeCascade.tierIndex : undefined,
    totalTiers: activeCascade?.isCascade ? activeCascade.totalTiers : undefined,
    isCascade: activeCascade?.isCascade ?? false,
    isReturning,
    returningDirection: isReturning ? lastCommittedRef.current!.direction : null,
    returningActionLabel: isReturning ? lastCommittedRef.current!.actionLabel : null,
  };
}
