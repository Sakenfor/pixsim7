/**
 * useComponentContextMenu
 *
 * Hook for component-level context menu handling.
 */

import { useCallback, useMemo, type MouseEvent } from 'react';
import { useContextMenuOptional } from './useContextMenu';
import type { ContextMenuContext } from './types';

export interface UseComponentContextMenuOptions {
  contextType: ContextMenuContext;
  getData: () => Record<string, unknown>;
  getCapabilities?: () => Record<string, unknown>;
  disabled?: boolean;
}

export interface ComponentContextMenuResult {
  onContextMenu: (e: MouseEvent) => void;
  contextMenuProps: {
    onContextMenu: (e: MouseEvent) => void;
  };
  isAvailable: boolean;
}

export function useComponentContextMenu(
  options: UseComponentContextMenuOptions,
): ComponentContextMenuResult {
  const { contextType, getData, getCapabilities, disabled = false } = options;
  const contextMenu = useContextMenuOptional();

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (disabled || !contextMenu) return;

      e.preventDefault();
      e.stopPropagation();

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
