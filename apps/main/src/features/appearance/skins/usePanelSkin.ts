/**
 * usePanelSkin — resolve a panel's skin into props for its root element.
 *
 * A skinnable panel spreads the result onto its outermost element:
 *
 *   const skin = usePanelSkin('ai-assistant');
 *   <div className={`... ${skin.className}`} {...skin.rootProps}>
 *
 * `default` skin resolves to no class / no attrs, so the panel keeps
 * inheriting the global theme (light/dark + accent) unchanged.
 */

import { useContextMenuOptional } from '@pixsim7/shared.ui.context-menu';
import { useCallback, useEffect, type MouseEvent } from 'react';


import { selectPanelSkin, usePanelSkinStore } from './panelSkinStore';
import { getSkin } from './registry';
import { ensureSkinStyles } from './skinStyles';

export interface ResolvedPanelSkin {
  /** Class string for the panel root (e.g. `skin-terminal skin-variant-green`). */
  className: string;
  /**
   * Root attributes for the panel's outermost element. Carries the
   * `data-skin-fx` effect list and an `onContextMenu` that opens the shared
   * context menu (Skin submenu lives there) — so right-click works the same
   * whether the panel is floating, docked, or mobile-hosted.
   */
  rootProps: {
    'data-skin-fx'?: string;
    onContextMenu?: (e: MouseEvent) => void;
  };
  /** The active skin id (`default` when unset). */
  skinId: string;
}

/**
 * Right-click inside an editable element (input, textarea, contenteditable)
 * should yield the native browser menu, not ours. Mirrors the convention used
 * across the panel codebase.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
}

export function usePanelSkin(panelId: string): ResolvedPanelSkin {
  // Inject the skin stylesheet on first use (idempotent).
  useEffect(() => { ensureSkinStyles(); }, []);

  const selection = usePanelSkinStore((s) => selectPanelSkin(s, panelId));
  const skin = getSkin(selection.skinId);
  const contextMenu = useContextMenuOptional();

  const onContextMenu = useCallback((e: MouseEvent) => {
    if (!contextMenu) return;
    if (e.ctrlKey || e.metaKey) return;       // let the native menu through with a modifier
    if (isEditableTarget(e.target)) return;   // preserve native menu inside inputs / textareas
    e.preventDefault();
    e.stopPropagation();
    contextMenu.showContextMenu({
      contextType: 'panel-content',
      panelId,
      position: { x: e.clientX, y: e.clientY },
    });
  }, [contextMenu, panelId]);

  const classes: string[] = [];
  if (skin.id !== 'default') {
    classes.push(`skin-${skin.id}`);
    if (skin.variants && selection.variant && skin.variants[selection.variant]) {
      classes.push(`skin-variant-${selection.variant}`);
    }
  }

  const fx: string[] = [];
  if (skin.id !== 'default' && skin.supportsEffects) {
    if (selection.scanline) fx.push('scanline');
    if (selection.glow) fx.push('glow');
  }

  const rootProps: ResolvedPanelSkin['rootProps'] = { onContextMenu };
  if (fx.length) rootProps['data-skin-fx'] = fx.join(' ');

  return {
    className: classes.join(' '),
    rootProps,
    skinId: skin.id,
  };
}
