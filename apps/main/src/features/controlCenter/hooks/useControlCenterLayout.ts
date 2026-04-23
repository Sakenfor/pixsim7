/**
 * useControlCenterLayout Hook
 *
 * Provides layout adjustments for pages that want to respond to
 * control center "push" behavior. Returns padding/margin values
 * based on dock position, open state, and layout behavior setting.
 */

import { useMemo } from 'react';

import { TOOLBAR_HEIGHT } from '@features/controlCenter/components/constants';
import {
  useDockState,
  type DockPosition,
  type LayoutBehavior,
  type RetractedMode,
} from '@features/docks/stores';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';
import { DOCK_IDS } from '@features/panels/lib/panelIds';

export interface ControlCenterLayoutPadding {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
}

export interface UseControlCenterLayoutResult {
  /** Padding values to apply to content area */
  padding: ControlCenterLayoutPadding;
  /** CSS style object ready to apply */
  style: React.CSSProperties;
  /** Whether push behavior is active */
  isPushActive: boolean;
  /** Current dock position */
  dockPosition: DockPosition;
  /** Whether dock is open */
  isOpen: boolean;
}

/**
 * Hook to get layout adjustments for control center push behavior.
 *
 * @example
 * ```tsx
 * function MyPage() {
 *   const { style } = useControlCenterLayout();
 *   return <div style={style}>Content that pushes when dock opens</div>;
 * }
 * ```
 */
export function useControlCenterLayout(): UseControlCenterLayoutResult {
  const open = useDockState(DOCK_IDS.controlCenter, (dock) => dock.open);
  const dockPosition = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.dockPosition,
  );
  const layoutBehavior = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.layoutBehavior,
  );
  const retractedMode = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.retractedMode,
  );
  const height = useDockState(DOCK_IDS.controlCenter, (dock) => dock.size);
  const isMobile = useIsMobileViewport();

  const result = useMemo(() => {
    const isFloating = dockPosition === 'floating';
    // On mobile the dock always overlays content — reserving viewport space
    // for a peek toolbar or open dock would squeeze the already-narrow page.
    const pushSuppressed = isMobile;
    // Always push when retracted in peek mode (toolbar is visible and would overlap content)
    const peekRetracted = !pushSuppressed && !open && retractedMode === 'peek' && !isFloating;
    const isPushActive =
      !pushSuppressed && (peekRetracted || (layoutBehavior === 'push' && open && !isFloating));
    const pushSize = peekRetracted ? TOOLBAR_HEIGHT : height;

    const padding: ControlCenterLayoutPadding = {
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    };

    if (isPushActive) {
      switch (dockPosition) {
        case 'bottom':
          padding.paddingBottom = pushSize;
          break;
        case 'top':
          padding.paddingTop = pushSize;
          break;
        case 'left':
          padding.paddingLeft = pushSize; // height is used for width in vertical mode
          break;
        case 'right':
          padding.paddingRight = pushSize;
          break;
      }
    }

    const style: React.CSSProperties = {
      paddingTop: padding.paddingTop || undefined,
      paddingBottom: padding.paddingBottom || undefined,
      paddingLeft: padding.paddingLeft || undefined,
      paddingRight: padding.paddingRight || undefined,
      transition: 'padding 300ms ease-out',
    };

    return {
      padding,
      style,
      isPushActive,
      dockPosition,
      isOpen: open,
    };
  }, [open, dockPosition, layoutBehavior, retractedMode, height, isMobile]);

  return result;
}

/**
 * Selector to check if push layout is active (for conditional rendering)
 */
export function selectIsPushLayoutActive(state: {
  layoutBehavior: LayoutBehavior;
  open: boolean;
  dockPosition: DockPosition;
  retractedMode?: RetractedMode;
}) {
  return (
    state.layoutBehavior === 'push' &&
    state.open &&
    state.dockPosition !== 'floating'
  );
}
