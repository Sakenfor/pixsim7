/**
 * useComponentContextMenu
 *
 * Hook for component-level context menu handling.
 * Reduces boilerplate for components that need custom context menu behavior.
 *
 * Usage:
 * ```tsx
 * function AssetCard({ asset }) {
 *   const { contextMenuProps } = useComponentContextMenu({
 *     contextType: 'asset',
 *     getData: () => ({ id: asset.id, name: asset.name, type: asset.type }),
 *   });
 *
 *   return <div {...contextMenuProps}>...</div>;
 * }
 * ```
 */

import { useCallback, useMemo, type MouseEvent } from 'react';
import { useContextMenuOptional } from './ContextMenuProvider';
import type { ContextMenuContext } from './types';

export interface UseComponentContextMenuOptions {
  /** Context type for the menu (e.g., 'asset', 'node', 'edge') */
  contextType: ContextMenuContext;
  /** Function to get data payload for the context menu */
  getData: () => Record<string, unknown>;
  /** Optional function to get capabilities specific to this component */
  getCapabilities?: () => Record<string, unknown>;
  /** Disable context menu (useful for conditional behavior) */
  disabled?: boolean;
}

export interface ComponentContextMenuResult {
  /** Handler to attach to onContextMenu */
  onContextMenu: (e: MouseEvent) => void;
  /** Props spread for convenience: { onContextMenu } */
  contextMenuProps: {
    onContextMenu: (e: MouseEvent) => void;
  };
  /** Whether context menu is available */
  isAvailable: boolean;
}

/**
 * Hook for component-level context menu handling.
 *
 * - Handles stopPropagation to prevent bubble to parent panel
 * - Builds payload from getData() at click time (dynamic)
 * - Returns props spread for easy attachment
 */
export function useComponentContextMenu(
  options: UseComponentContextMenuOptions,
): ComponentContextMenuResult {
  const { contextType, getData, getCapabilities, disabled = false } = options;
  const contextMenu = useContextMenuOptional();

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (disabled || !contextMenu) return;

      // Prevent bubble to parent panel/dockview
      e.preventDefault();
      e.stopPropagation();

      // Build payload at click time (dynamic data)
      const data = getData();
      const capabilities = getCapabilities?.();

      contextMenu.showContextMenu({
        contextType,
        position: { x: e.clientX, y: e.clientY },
        data,
        ...(capabilities && { capabilities }),
      });
    },
    [contextMenu, contextType, getData, getCapabilities, disabled],
  );

  const contextMenuProps = useMemo(
    () => ({
      onContextMenu: disabled ? undefined! : onContextMenu,
    }),
    [onContextMenu, disabled],
  );

  return {
    onContextMenu,
    contextMenuProps: disabled ? { onContextMenu: undefined! } : contextMenuProps,
    isAvailable: !!contextMenu && !disabled,
  };
}
