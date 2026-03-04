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
import { useCallback, useEffect, useRef } from 'react';


import { useDockviewContext } from './contextMenu/DockviewIdContext';
import { buildFloatingOriginMetaRecord, deriveFloatingGroupRestoreHint } from './floatingPanelInterop';

const DRAG_THRESHOLD = 12;

export function GroupDragHandle({
  containerApi,
  activePanel,
  api: groupApi,
}: IDockviewHeaderActionsProps) {
  const { dockviewId, dockviewApi, floatPanelHandler } = useDockviewContext();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragCandidateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panelId: string;
    groupId: string | undefined;
  } | null>(null);
  const dragMoveListenerRef = useRef<((e: PointerEvent) => void) | null>(null);
  const dragUpListenerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const cleanupDragListeners = useCallback(() => {
    if (dragMoveListenerRef.current) {
      window.removeEventListener('pointermove', dragMoveListenerRef.current, true);
      dragMoveListenerRef.current = null;
    }
    if (dragUpListenerRef.current) {
      window.removeEventListener('pointerup', dragUpListenerRef.current, true);
      window.removeEventListener('pointercancel', dragUpListenerRef.current, true);
      dragUpListenerRef.current = null;
    }
    dragCandidateRef.current = null;
  }, []);

  useEffect(() => cleanupDragListeners, [cleanupDragListeners]);

  if (!floatPanelHandler || !activePanel) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    cleanupDragListeners();

    const panelId = activePanel.id;
    dragCandidateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panelId,
      groupId: groupApi?.id,
    };

    const onPointerMove = () => {
      // movement evaluated on pointerup
    };

    const onPointerUp = (ev: PointerEvent) => {
      const candidate = dragCandidateRef.current;
      cleanupDragListeners();
      if (!candidate) return;
      if (ev.pointerId !== candidate.pointerId) return;

      const dx = ev.clientX - candidate.startX;
      const dy = ev.clientY - candidate.startY;
      if ((dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      const dockRoot =
        rootRef.current?.closest('[data-smart-dockview]') as HTMLElement | null;
      if (!dockRoot) return;

      const rect = dockRoot.getBoundingClientRect();
      const releasedOutside =
        ev.clientX < rect.left ||
        ev.clientX > rect.right ||
        ev.clientY < rect.top ||
        ev.clientY > rect.bottom;
      if (!releasedOutside) return;

      const api = containerApi ?? dockviewApi;
      const panel =
        (api as any)?.getPanel?.(candidate.panelId) ?? activePanel;
      if (!panel) return;
      const resolvedPanelId = resolvePanelDefinitionId(panel) ?? candidate.panelId;

      try {
        const sourceGroupRestoreHint = deriveFloatingGroupRestoreHint(api, candidate.groupId);
        floatPanelHandler(candidate.panelId, panel, {
          width: 600,
          height: 400,
          context: {
            ...buildFloatingOriginMetaRecord({
              sourceDockviewId: dockviewId ?? null,
              sourceGroupId: candidate.groupId ?? null,
              sourceDockPanelId: candidate.panelId,
              sourcePanelId: resolvedPanelId,
              sourceGroupRestoreHint,
            }),
          },
        });
        (api as any)?.removePanel?.(panel);
      } catch (error) {
        console.warn('[GroupDragHandle] Failed to float dragged-out panel', {
          panelId: candidate.panelId,
          dockviewId,
          error,
        });
      }
    };

    dragMoveListenerRef.current = onPointerMove;
    dragUpListenerRef.current = onPointerUp;
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={handlePointerDown}
      className="flex items-center px-1 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 transition-colors"
      title="Drag to float panel"
    >
      <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
        <circle cx="1" cy="1" r="1" />
        <circle cx="5" cy="1" r="1" />
        <circle cx="1" cy="5" r="1" />
        <circle cx="5" cy="5" r="1" />
        <circle cx="1" cy="9" r="1" />
        <circle cx="5" cy="9" r="1" />
      </svg>
    </div>
  );
}
