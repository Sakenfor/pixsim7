/**
 * useControlCenterLayout Hook
 *
 * Provides layout adjustments for pages that want to respond to
 * control center "push" behavior. Returns padding/margin values
 * based on dock position, open state, and layout behavior setting.
 */

import { useMemo } from 'react';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

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
  dockPosition: string;
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
  const open = useControlCenterStore((s) => s.open);
  const dockPosition = useControlCenterStore((s) => s.dockPosition);
  const layoutBehavior = useControlCenterStore((s) => s.layoutBehavior);
  const height = useControlCenterStore((s) => s.height);

  const result = useMemo(() => {
    const isFloating = dockPosition === 'floating';
    const isPushActive = layoutBehavior === 'push' && open && !isFloating;

    const padding: ControlCenterLayoutPadding = {
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    };

    if (isPushActive) {
      switch (dockPosition) {
        case 'bottom':
          padding.paddingBottom = height;
          break;
        case 'top':
          padding.paddingTop = height;
          break;
        case 'left':
          padding.paddingLeft = height; // height is used for width in vertical mode
          break;
        case 'right':
          padding.paddingRight = height;
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
  }, [open, dockPosition, layoutBehavior, height]);

  return result;
}

/**
 * Selector to check if push layout is active (for conditional rendering)
 */
export function selectIsPushLayoutActive(state: ReturnType<typeof useControlCenterStore.getState>) {
  return (
    state.layoutBehavior === 'push' &&
    state.open &&
    state.dockPosition !== 'floating'
  );
}
