/**
 * useViewerGestures
 *
 * Gesture hook for the media viewer (viewing mode only). Backed by the
 * 'viewer' gesture surface; users can mirror another surface (e.g. gallery)
 * via the surface's `source` setting without touching this hook.
 */

import { useCallback, useMemo, useRef } from 'react';

import {
  getGestureActionLabel,
  computeGestureCount,
  isChainDurationAction,
  resolveCascadeAction,
  resolveGestureHandler,
  type GestureResolverContext,
} from './gestureActions';
import {
  getCascadeActionsForDirection,
  getChainActionForDirection,
} from './gestureSurfaces';
import { useGestureSecondaryStore, resolveDurationFromDy } from './useGestureSecondaryStore';
import { useSurfaceGestureConfig } from './useGestureSurfaceStore';
import type { GestureDirection, GestureEvent } from './useMouseGesture';
import { useMouseGesture } from './useMouseGesture';

export interface ViewerGestureContext {
  navigatePrev?: () => void;
  navigateNext?: () => void;
  closeViewer?: () => void;
  toggleFitMode?: () => void;
  toggleFavorite?: () => void;
  cardResolverContext?: GestureResolverContext;
}

export interface UseViewerGesturesResult {
  gestureHandlers: { onPointerDown: (e: React.PointerEvent) => void };
  gestureConsumed: React.RefObject<boolean>;
  enabled: boolean;
  isCommitted: boolean;
  direction: GestureDirection | null;
  actionId: string | null;
  actionLabel: string | null;
  count: number | undefined;
  duration: number | undefined;
  durationUnit: string;
  phase: 'idle' | 'pending' | 'committed';
  tierIndex: number | undefined;
  totalTiers: number | undefined;
  isCascade: boolean;
  isReturning: boolean;
  returningDirection: GestureDirection | null;
  returningActionLabel: string | null;
}

function resolveViewerGestureHandler(
  actionId: string,
  ctx: ViewerGestureContext,
): (() => void) | undefined {
  switch (actionId) {
    case 'navigatePrev': return ctx.navigatePrev;
    case 'navigateNext': return ctx.navigateNext;
    case 'closeViewer': return ctx.closeViewer;
    case 'toggleFitMode': return ctx.toggleFitMode;
    case 'toggleFavorite': return ctx.toggleFavorite;
    case 'none': return undefined;
  }

  if (ctx.cardResolverContext) {
    const cardHandler = resolveGestureHandler(actionId, ctx.cardResolverContext);
    if (cardHandler) {
      return () => cardHandler(0);
    }
  }

  return undefined;
}

export function useViewerGestures(ctx: ViewerGestureContext): UseViewerGesturesResult {
  const cfg = useSurfaceGestureConfig('viewer');

  const gestureDirections = useMemo(
    () => ({
      gestureUp: cfg.gestureUp,
      gestureDown: cfg.gestureDown,
      gestureLeft: cfg.gestureLeft,
      gestureRight: cfg.gestureRight,
    }),
    [cfg.gestureUp, cfg.gestureDown, cfg.gestureLeft, cfg.gestureRight],
  );

  const chainDirections = useMemo(
    () => ({
      chainUp: cfg.chainUp,
      chainDown: cfg.chainDown,
      chainLeft: cfg.chainLeft,
      chainRight: cfg.chainRight,
    }),
    [cfg.chainUp, cfg.chainDown, cfg.chainLeft, cfg.chainRight],
  );

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const { gestureHandlers, activeGesture, gestureConsumed } = useMouseGesture({
    enabled: cfg.enabled,
    threshold: cfg.threshold,
    edgeInset: cfg.edgeInset,
    onGesture: useCallback(
      (event: GestureEvent) => {
        if (event.type !== 'swipe') return;
        const cascadeActions = getCascadeActionsForDirection(gestureDirections, event.direction);
        const cascade = resolveCascadeAction(
          cascadeActions, event.distance, cfg.threshold, cfg.cascadeStepPixels,
        );
        const handler = resolveViewerGestureHandler(cascade.actionId, ctxRef.current);
        if (!handler) return;
        handler();
      },
      [gestureDirections, cfg.threshold, cfg.cascadeStepPixels],
    ),
  });

  const isCommitted = activeGesture?.phase === 'committed';
  const phase = activeGesture?.phase ?? 'idle';

  const lastCommittedRef = useRef<{
    direction: GestureDirection;
    actionLabel: string;
  } | null>(null);

  if (isCommitted && activeGesture) {
    const cascade = resolveCascadeAction(
      getCascadeActionsForDirection(gestureDirections, activeGesture.direction),
      activeGesture.distance,
      cfg.threshold,
      cfg.cascadeStepPixels,
    );
    lastCommittedRef.current = {
      direction: activeGesture.direction,
      actionLabel: getGestureActionLabel(cascade.actionId),
    };
  } else if (phase === 'idle') {
    lastCommittedRef.current = null;
  }

  const isReturning = phase === 'pending' && lastCommittedRef.current !== null;

  const activeCascade = isCommitted
    ? resolveCascadeAction(
        getCascadeActionsForDirection(gestureDirections, activeGesture.direction),
        activeGesture.distance,
        cfg.threshold,
        cfg.cascadeStepPixels,
      )
    : null;

  const activeActionId = activeCascade?.actionId ?? null;

  const activeCount = isCommitted && activeActionId && activeCascade && !activeCascade.isCascade
    ? computeGestureCount(Math.abs(activeGesture.dx), cfg.threshold)
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
    enabled: cfg.enabled,
    isCommitted,
    direction: isCommitted ? activeGesture.direction : null,
    actionId: activeActionId,
    actionLabel: activeActionId ? getGestureActionLabel(activeActionId) : null,
    count: activeCount,
    duration: activeDuration,
    durationUnit: secondaryState.unit,
    phase,
    tierIndex: activeCascade?.isCascade ? activeCascade.tierIndex : undefined,
    totalTiers: activeCascade?.isCascade ? activeCascade.totalTiers : undefined,
    isCascade: activeCascade?.isCascade ?? false,
    isReturning,
    returningDirection: isReturning ? lastCommittedRef.current!.direction : null,
    returningActionLabel: isReturning ? lastCommittedRef.current!.actionLabel : null,
  };
}
