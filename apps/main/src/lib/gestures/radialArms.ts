import { getGestureActionLabel } from './gestureActions';
import type { RadialArms } from './GestureRadialMenu';
import { getCascadeActionsForDirection, type GestureSurfaceConfig } from './gestureSurfaces';
import type { GestureDirection } from './useMouseGesture';

type Directions = Pick<
  GestureSurfaceConfig,
  'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'
>;

/**
 * Build the radial cross from a surface's per-direction cascade config, dropping
 * `none` tiers so empty arms don't render. Shared by every gesture hook
 * (useCardGestures / useViewerGestures) so the long-press menu always mirrors
 * exactly what the desktop swipe would do.
 */
export function buildRadialArms(directions: Directions): RadialArms {
  const build = (dir: GestureDirection) =>
    getCascadeActionsForDirection(directions, dir)
      .filter((actionId) => actionId && actionId !== 'none')
      .map((actionId) => ({ actionId, label: getGestureActionLabel(actionId) }));
  return { up: build('up'), down: build('down'), left: build('left'), right: build('right') };
}

export function hasAnyArm(arms: RadialArms): boolean {
  return arms.up.length > 0 || arms.down.length > 0 || arms.left.length > 0 || arms.right.length > 0;
}
