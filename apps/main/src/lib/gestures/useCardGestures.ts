import { useCallback, useMemo, useRef } from 'react';

import type { PresetGestureOverrides } from '@lib/ui/overlay';

import { useUploadProviderStore } from '@features/assets/stores/uploadProviderStore';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';

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
import { useActiveGesturePresetOverrides } from './gesturePresetStore';
import type { RadialArms } from './GestureRadialMenu';
import {
  getCascadeActionsForDirection,
  getChainActionForDirection,
  type GestureSurfaceId,
} from './gestureSurfaces';
import { buildRadialArms, hasAnyArm } from './radialArms';
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
  /**
   * Touch long-press radial menu. Mobile disables swipe/drag (it fights native
   * scroll), so the same per-surface direction mappings surface here instead —
   * a cross the user can read rather than blind-swipe. `radialEnabled` is the
   * mirror of `enabled`: on (and only on) mobile, when the surface is enabled
   * and at least one direction maps to a real action.
   */
  radialEnabled: boolean;
  radialArms: RadialArms;
  commitRadial: (direction: GestureDirection, tierIndex: number) => void;
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
  const isMobile = useIsMobileViewport();

  // Active gesture-preset overrides for this surface (the in-gesture switcher's
  // selection). Precedence per field: an explicit `presetGestureOverrides` (e.g.
  // the gallery's active overlay preset) wins, then the surface's active gesture
  // preset, then the surface config.
  const storeOverrides = useActiveGesturePresetOverrides(surfaceId);

  // Disable swipe/drag gestures on mobile — they clash with native touch
  // scrolling and tap affordances. Cards stay fully interactive via tap.
  const effectiveGestureEnabled =
    !isMobile && (presetGestureOverrides?.enabled ?? storeOverrides?.enabled ?? cfg.enabled);
  const effectiveGestureThreshold = presetGestureOverrides?.threshold ?? storeOverrides?.threshold ?? cfg.threshold;
  const effectiveGestureEdgeInset = presetGestureOverrides?.edgeInset ?? storeOverrides?.edgeInset ?? cfg.edgeInset;
  const effectiveCascadeStepPixels = presetGestureOverrides?.cascadeStepPixels ?? storeOverrides?.cascadeStepPixels ?? cfg.cascadeStepPixels;
  const effectiveGestureUp = presetGestureOverrides?.gestureUp ?? storeOverrides?.gestureUp ?? cfg.gestureUp;
  const effectiveGestureDown = presetGestureOverrides?.gestureDown ?? storeOverrides?.gestureDown ?? cfg.gestureDown;
  const effectiveGestureLeft = presetGestureOverrides?.gestureLeft ?? storeOverrides?.gestureLeft ?? cfg.gestureLeft;
  const effectiveGestureRight = presetGestureOverrides?.gestureRight ?? storeOverrides?.gestureRight ?? cfg.gestureRight;
  const effectiveChainUp = presetGestureOverrides?.chainUp ?? storeOverrides?.chainUp ?? cfg.chainUp;
  const effectiveChainDown = presetGestureOverrides?.chainDown ?? storeOverrides?.chainDown ?? cfg.chainDown;
  const effectiveChainLeft = presetGestureOverrides?.chainLeft ?? storeOverrides?.chainLeft ?? cfg.chainLeft;
  const effectiveChainRight = presetGestureOverrides?.chainRight ?? storeOverrides?.chainRight ?? cfg.chainRight;

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

  // Non-reactive read: only the actively-gesturing (committed) card consumes
  // these values, and it already re-renders on every pointer-move frame via
  // `activeGesture` — so a fresh snapshot here stays current without
  // subscribing. Subscribing reactively (the old `useGestureSecondaryStore()`)
  // re-rendered EVERY mounted card whenever the secondary store was set/cleared
  // at a gesture's start/end — pure overhead for every non-gesturing card.
  const secondaryState = useGestureSecondaryStore.getState();
  const activeChainAction = isCommitted
    ? getChainActionForDirection(chainDirections, activeGesture.direction)
    : 'none';
  const activeDuration = isCommitted
    && isChainDurationAction(activeChainAction)
    && secondaryState.options.length > 0
    ? resolveDurationFromDy(activeGesture.dy, secondaryState)
    : undefined;

  // ── Long-press radial (mobile) ────────────────────────────────────────────
  // Build the cross from the same per-surface direction config the desktop
  // swipe uses (shared with useViewerGestures via buildRadialArms).
  const radialArms: RadialArms = useMemo(() => buildRadialArms(gestureDirections), [gestureDirections]);

  const radialEnabled =
    isMobile && (presetGestureOverrides?.enabled ?? cfg.enabled) && hasAnyArm(radialArms);

  const commitRadial = useCallback(
    (direction: GestureDirection, tierIndex: number) => {
      const tiers = getCascadeActionsForDirection(gestureDirections, direction).filter(
        (actionId) => actionId && actionId !== 'none',
      );
      const actionId = tiers[tierIndex] ?? tiers[0];
      if (!actionId) return;
      const handler = resolveGestureHandler(actionId, resolverContext);
      if (!handler) return;
      // No drag distance in the radial — scalable actions fire a single unit.
      const count = isScalableAction(actionId) ? 1 : undefined;
      handler(id, count, undefined);
    },
    [gestureDirections, resolverContext, id],
  );

  return {
    gestureHandlers,
    gestureConsumed,
    enabled: effectiveGestureEnabled,
    radialEnabled,
    radialArms,
    commitRadial,
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
