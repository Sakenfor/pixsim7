/**
 * useViewerGestures
 *
 * Gesture hook for the media viewer (viewing mode only). Backed by the
 * 'viewer' gesture surface; users can mirror another surface (e.g. gallery)
 * via the surface's `source` setting without touching this hook.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';

import {
  getGestureActionLabel,
  computeGestureCount,
  isChainDurationAction,
  resolveCascadeAction,
  resolveGestureHandler,
  type GestureResolverContext,
} from './gestureActions';
import type { GesturePreset } from './gesturePresetDefaults';
import {
  useActiveGesturePresetOverrides,
  useGesturePresetStore,
  useSurfaceGesturePresets,
} from './gesturePresetStore';
import type { RadialArms } from './GestureRadialMenu';
import {
  getCascadeActionsForDirection,
  getChainActionForDirection,
} from './gestureSurfaces';
import { buildRadialArms, hasAnyArm } from './radialArms';
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
  /** Long-press radial menu (mobile) — mirrors the viewer's mapped directions. */
  radialEnabled: boolean;
  radialArms: RadialArms;
  commitRadial: (direction: GestureDirection, tierIndex: number) => void;
  /**
   * In-gesture preset switcher. Dwell in the cancel/center zone after a commit
   * opens it (desktop, when the surface has >1 preset). Render with
   * `GesturePresetPicker` and feed `pick`/`dismiss` back.
   */
  presetSwitch: {
    /** Desktop center-dwell switcher is wired (`!isMobile` && >1 preset). */
    enabled: boolean;
    open: boolean;
    center: { x: number; y: number };
    presets: GesturePreset[];
    activeId: string;
    pick: (presetId: string) => void;
    dismiss: () => void;
    /** >1 preset exists for the surface (mobile radial uses this, not `enabled`). */
    hasMultiple: boolean;
    /** Label of the active preset, for the mobile radial's center pivot. */
    activeLabel: string;
    /** Advance to the next preset (wraps) — the mobile radial's center tap. */
    cycle: () => void;
  };
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
  const isMobile = useIsMobileViewport();

  // Active gesture preset for this surface overrides the surface config per
  // field (unset fields fall through). This is what the in-gesture switcher
  // mutates — so a swap takes effect on the very next swipe.
  const presetOverrides = useActiveGesturePresetOverrides('viewer');
  const presetSet = useSurfaceGesturePresets('viewer');
  const cycleActivePreset = useGesturePresetStore((s) => s.cycleActivePreset);

  const eEnabled = presetOverrides?.enabled ?? cfg.enabled;
  const eThreshold = presetOverrides?.threshold ?? cfg.threshold;
  const eEdgeInset = presetOverrides?.edgeInset ?? cfg.edgeInset;
  const eCascadeStepPixels = presetOverrides?.cascadeStepPixels ?? cfg.cascadeStepPixels;

  const gestureDirections = useMemo(
    () => ({
      gestureUp: presetOverrides?.gestureUp ?? cfg.gestureUp,
      gestureDown: presetOverrides?.gestureDown ?? cfg.gestureDown,
      gestureLeft: presetOverrides?.gestureLeft ?? cfg.gestureLeft,
      gestureRight: presetOverrides?.gestureRight ?? cfg.gestureRight,
    }),
    [presetOverrides, cfg.gestureUp, cfg.gestureDown, cfg.gestureLeft, cfg.gestureRight],
  );

  const chainDirections = useMemo(
    () => ({
      chainUp: presetOverrides?.chainUp ?? cfg.chainUp,
      chainDown: presetOverrides?.chainDown ?? cfg.chainDown,
      chainLeft: presetOverrides?.chainLeft ?? cfg.chainLeft,
      chainRight: presetOverrides?.chainRight ?? cfg.chainRight,
    }),
    [presetOverrides, cfg.chainUp, cfg.chainDown, cfg.chainLeft, cfg.chainRight],
  );

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // In-gesture preset switcher: dwell at center after a commit opens it.
  const [picker, setPicker] = useState<{ open: boolean; center: { x: number; y: number } }>(
    { open: false, center: { x: 0, y: 0 } },
  );
  const presetSwitchEnabled = !isMobile && presetSet.presets.length > 1;

  const { gestureHandlers, activeGesture, gestureConsumed } = useMouseGesture({
    enabled: eEnabled,
    threshold: eThreshold,
    edgeInset: eEdgeInset,
    onCenterDwell: presetSwitchEnabled
      ? (center) => setPicker({ open: true, center })
      : undefined,
    onGesture: useCallback(
      (event: GestureEvent) => {
        if (event.type !== 'swipe') return;
        const cascadeActions = getCascadeActionsForDirection(gestureDirections, event.direction);
        const cascade = resolveCascadeAction(
          cascadeActions, event.distance, eThreshold, eCascadeStepPixels,
        );
        const handler = resolveViewerGestureHandler(cascade.actionId, ctxRef.current);
        if (!handler) return;
        handler();
      },
      [gestureDirections, eThreshold, eCascadeStepPixels],
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
      eThreshold,
      eCascadeStepPixels,
    );
    lastCommittedRef.current = {
      direction: activeGesture.direction,
      actionLabel: getGestureActionLabel(cascade.actionId),
    };
  } else if (phase === 'idle') {
    lastCommittedRef.current = null;
  }

  const isReturning = phase === 'pending' && lastCommittedRef.current !== null;

  // ── Long-press radial (mobile) ────────────────────────────────────────────
  const radialArms = useMemo(() => buildRadialArms(gestureDirections), [gestureDirections]);
  const radialEnabled = isMobile && eEnabled && hasAnyArm(radialArms);
  const commitRadial = useCallback(
    (direction: GestureDirection, tierIndex: number) => {
      const tiers = getCascadeActionsForDirection(gestureDirections, direction).filter(
        (actionId) => actionId && actionId !== 'none',
      );
      const actionId = tiers[tierIndex] ?? tiers[0];
      if (!actionId) return;
      resolveViewerGestureHandler(actionId, ctxRef.current)?.();
    },
    [gestureDirections],
  );

  const activeCascade = isCommitted
    ? resolveCascadeAction(
        getCascadeActionsForDirection(gestureDirections, activeGesture.direction),
        activeGesture.distance,
        eThreshold,
        eCascadeStepPixels,
      )
    : null;

  const activeActionId = activeCascade?.actionId ?? null;

  const activeCount = isCommitted && activeActionId && activeCascade && !activeCascade.isCascade
    ? computeGestureCount(Math.abs(activeGesture.dx), eThreshold)
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
    enabled: eEnabled,
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
    radialEnabled,
    radialArms,
    commitRadial,
    presetSwitch: {
      enabled: presetSwitchEnabled,
      open: picker.open,
      center: picker.center,
      presets: presetSet.presets,
      activeId: presetSet.activeId,
      pick: (presetId: string) => {
        presetSet.setActivePreset(presetId);
        setPicker((p) => ({ ...p, open: false }));
      },
      dismiss: () => setPicker((p) => ({ ...p, open: false })),
      hasMultiple: presetSet.presets.length > 1,
      activeLabel: presetSet.active?.label ?? '',
      cycle: () => cycleActivePreset('viewer', 1),
    },
  };
}
