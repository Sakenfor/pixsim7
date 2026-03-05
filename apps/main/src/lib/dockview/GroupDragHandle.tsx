/**
 * GroupDragHandle
 *
 * Rendered in the left side of each dockview group header.
 * Provides a small drag grip that, when dragged outside the dockview bounds
 * and released, floats the active panel. This allows floating panels even
 * when tabs are hidden (single panel in group).
 */

import { resolvePanelDefinitionId } from '@pixsim7/shared.ui.dockview';
import type { IDockviewHeaderActionsProps } from 'dockview-core';
import { useCallback, useEffect, useRef, useState } from 'react';


import { useDockviewContext } from './contextMenu/DockviewIdContext';
import {
  buildFloatingOriginMetaRecord,
  deriveFloatingGroupRestoreHint,
  removePanelAndPruneEmptyGroup,
} from './floatingPanelInterop';

const HANDLE_SIZE = 14;
const HANDLE_INSET = 2;
const HANDLE_GUARD_GAP = 6;

type HandleCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

const CORNER_ORDER: HandleCorner[] = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function intersectArea(a: RectLike, b: RectLike): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? width * height : 0;
}

function expandRect(rect: RectLike, amount: number): RectLike {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
  };
}

function getCornerRect(scope: RectLike, corner: HandleCorner): RectLike {
  const left = corner.endsWith('left')
    ? scope.left + HANDLE_INSET
    : scope.right - HANDLE_INSET - HANDLE_SIZE;
  const top = corner.startsWith('top')
    ? scope.top + HANDLE_INSET
    : scope.bottom - HANDLE_INSET - HANDLE_SIZE;
  return {
    left,
    top,
    right: left + HANDLE_SIZE,
    bottom: top + HANDLE_SIZE,
  };
}

function isVisibleElement(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.closest('.dv-group-float-drag-handle')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function chooseBestCorner(rootEl: HTMLElement): HandleCorner {
  const groupEl = rootEl.closest('.dv-groupview') as HTMLElement | null;
  if (!groupEl) return 'top-right';

  const contentEl = groupEl.querySelector('.dv-content-container') as HTMLElement | null;
  const scopeEl = contentEl ?? groupEl;
  const scope = scopeEl.getBoundingClientRect();
  if (scope.width < HANDLE_SIZE + 4 || scope.height < HANDLE_SIZE + 4) return 'top-right';

  const blockerSelector = [
    'button',
    '[role="button"]',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '.floating-panel-header',
    '[data-float-handle-blocker]',
  ].join(',');

  const blockers = Array.from(scopeEl.querySelectorAll<HTMLElement>(blockerSelector))
    .filter(isVisibleElement)
    .map((el) => el.getBoundingClientRect());

  let bestCorner: HandleCorner = 'top-right';
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < CORNER_ORDER.length; i += 1) {
    const corner = CORNER_ORDER[i];
    const rect = getCornerRect(scope, corner);
    const guardedRect = expandRect(rect, HANDLE_GUARD_GAP);
    let score = i * 0.001; // deterministic tie-break by preferred order
    for (const blocker of blockers) {
      score += intersectArea(guardedRect, blocker);
      if (score >= bestScore) break;
    }
    if (score < bestScore) {
      bestScore = score;
      bestCorner = corner;
    }
  }

  return bestCorner;
}

export function GroupDragHandle({
  containerApi,
  activePanel,
  api: groupApi,
}: IDockviewHeaderActionsProps) {
  const { dockviewId, dockviewApi, floatPanelHandler } = useDockviewContext();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [corner, setCorner] = useState<HandleCorner>('top-right');

  const recalculateCorner = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = chooseBestCorner(root);
    setCorner((prev) => (prev === next ? prev : next));
  }, []);

  const floatActivePanel = useCallback((sourceGroupId: string | null | undefined) => {
    if (!floatPanelHandler || !activePanel) return;

    const candidatePanelId = activePanel.id;
    const api = containerApi ?? dockviewApi;
    const panel = (api as any)?.getPanel?.(candidatePanelId) ?? activePanel;
    if (!panel) return;

    const resolvedDefinitionId = resolvePanelDefinitionId(panel);
    if (!resolvedDefinitionId) {
      console.warn('[GroupDragHandle] Could not resolve panel definition for float', {
        panelId: candidatePanelId,
        dockviewId,
      });
      return;
    }

    try {
      const sourceGroupRestoreHint = deriveFloatingGroupRestoreHint(api, sourceGroupId);
      floatPanelHandler(candidatePanelId, panel, {
        width: 600,
        height: 400,
        context: {
          ...buildFloatingOriginMetaRecord({
            sourceDockviewId: dockviewId ?? null,
            sourceGroupId: sourceGroupId ?? null,
            sourceInstanceId:
              dockviewId && dockviewId.length > 0
                ? `${dockviewId}:${candidatePanelId}`
                : candidatePanelId,
            sourceDefinitionId: resolvedDefinitionId,
            sourceGroupRestoreHint,
          }),
        },
      });
      removePanelAndPruneEmptyGroup(api, panel, {
        sourceGroupId: sourceGroupId ?? null,
      });
    } catch (error) {
      console.warn('[GroupDragHandle] Failed to float panel', {
        panelId: candidatePanelId,
        dockviewId,
        error,
      });
    }
  }, [activePanel, containerApi, dockviewApi, dockviewId, floatPanelHandler]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const group = root.closest('.dv-groupview') as HTMLElement | null;
    if (!group) return undefined;

    const content = group.querySelector('.dv-content-container') as HTMLElement | null;
    const observedRoot = content ?? group;

    const scheduleRecalc = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        recalculateCorner();
      });
    };

    scheduleRecalc();

    const resizeObserver = new ResizeObserver(() => scheduleRecalc());
    resizeObserver.observe(group);
    if (content && content !== group) resizeObserver.observe(content);

    const mutationObserver = new MutationObserver(() => scheduleRecalc());
    mutationObserver.observe(observedRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });

    window.addEventListener('scroll', scheduleRecalc, true);

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('scroll', scheduleRecalc, true);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [activePanel?.id, recalculateCorner]);

  if (!floatPanelHandler || !activePanel) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Prevent text selection or parent drag behavior from this handle.
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    floatActivePanel(groupApi?.id ?? null);
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={recalculateCorner}
      className="dv-group-float-drag-handle cursor-pointer"
      title="Double-click to float panel"
      aria-label="Double-click to float panel"
      role="button"
      data-dv-float-corner={corner}
    >
      <span className="dv-group-float-drag-corner" aria-hidden="true" />
    </div>
  );
}
