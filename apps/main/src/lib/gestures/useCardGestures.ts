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
  getCascadeActionsForDirection,
  getChainActionForDirection,
  type GestureSurfaceId,
} from './gestureSurfaces';
import { useGestureSecondaryStore, resolveDurationFromDy } from './useGestureSecondaryStore';
import { useSurfaceGestureConfig } from './useGestureSurfaceStore';
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
  /** Surface whose gesture config drives this card. Defaults to 'gallery'. */
  surfaceId?: GestureSurfaceId;
}

export interface UseCardGesturesResult {
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
  edgeInset: number;
  phase: 'idle' | 'pending' | 'committed';
  tierIndex: number | undefined;
  totalTiers: number | undefined;
  isCascade: boolean;
  isReturning: boolean;
  returningDirection: GestureDirection | null;
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
  surfaceId = 'gallery',
}: UseCardGesturesOptions): UseCardGesturesResult {
  const cfg = useSurfaceGestureConfig(surfaceId);

  const effectiveGestureEnabled = presetGestureOverrides?.enabled ?? cfg.enabled;
  const effectiveGestureThreshold = presetGestureOverrides?.threshold ?? cfg.threshold;
  const effectiveGestureEdgeInset = presetGestureOverrides?.edgeInset ?? cfg.edgeInset;
  const effectiveCascadeStepPixels = presetGestureOverrides?.cascadeStepPixels ?? cfg.cascadeStepPixels;
  const effectiveGestureUp = presetGestureOverrides?.gestureUp ?? cfg.gestureUp;
  const effectiveGestureDown = presetGestureOverrides?.gestureDown ?? cfg.gestureDown;
  const effectiveGestureLeft = presetGestureOverrides?.gestureLeft ?? cfg.gestureLeft;
  const effectiveGestureRight = presetGestureOverrides?.gestureRight ?? cfg.gestureRight;
  const effectiveChainUp = presetGestureOverrides?.chainUp ?? cfg.chainUp;
  const effectiveChainDown = presetGestureOverrides?.chainDown ?? cfg.chainDown;
  const effectiveChainLeft = presetGestureOverrides?.chainLeft ?? cfg.chainLeft;
  const effectiveChainRight = presetGestureOverrides?.chainRight ?? cfg.chainRight;

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
      effectiveGestureThreshold,
      effectiveCascadeStepPixels,
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
        effectiveGestureThreshold,
        effectiveCascadeStepPixels,
      )
    : null;

  const activeActionId = activeCascade?.actionId ?? null;

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
