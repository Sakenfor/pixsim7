/**
 * Custom Tab Component with Context Menu Support
 *
 * Wraps dockview's default tab component to add right-click context menu.
 */

import { useContextMenuOptional } from '@pixsim7/shared.ui.context-menu';
import { DockviewDefaultTab } from 'dockview';
import type { IDockviewPanelHeaderProps } from 'dockview-core';
import { useCallback, useEffect, useRef } from 'react';

import { useContextHubState } from '@features/contextHub';


import {
  buildFloatingOriginMetaRecord,
  deriveFloatingGroupRestoreHint,
  removePanelAndPruneEmptyGroup,
} from '../floatingPanelInterop';

import { buildDockviewContext } from './buildDockviewContext';
import { useDockviewContext } from './DockviewIdContext';

function resolveDockviewPanelDefinitionId(panel: any): string | undefined {
  const paramsPanelId = panel?.params?.panelId ?? panel?.api?.params?.panelId;
  if (typeof paramsPanelId === 'string') return paramsPanelId;
  if (typeof panel?.component === 'string' && panel.component !== 'panel') return panel.component;
  if (typeof panel?.id === 'string') return panel.id;
  return undefined;
}

/**
 * Custom tab component that adds context menu support
 *
 * Wraps the default dockview tab and intercepts right-click events
 * to show panel-specific context menu actions.
 */
export function CustomTabComponent(props: IDockviewPanelHeaderProps) {
  const contextMenu = useContextMenuOptional();
  const { dockviewId: currentDockviewId, panelRegistry, dockviewApi, floatPanelHandler, scopedPanelIds } = useDockviewContext();
  const contextHubState = useContextHubState();
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
  const DRAG_THRESHOLD = 12;

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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!contextMenu) return;
    if (e.ctrlKey || e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const panelId = props.api.id;
    const groupId = props.api.group.id;
    const instanceId = currentDockviewId ? `${currentDockviewId}:${panelId}` : panelId;

    const baseContext = {
      currentDockviewId,
      panelRegistry,
      api: props.containerApi ?? dockviewApi,
      contextHubState,
      scopedPanelIds,
    };

    contextMenu.showContextMenu(
      buildDockviewContext(baseContext, {
        contextType: 'tab',
        panelId,
        instanceId,
        groupId,
        position: { x: e.clientX, y: e.clientY },
        data: (props.api as any)?.params,
      }),
    );
  };

  const handlePointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!floatPanelHandler) return;
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    cleanupDragListeners();

    const panelId = props.api.id;
    dragCandidateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panelId,
      groupId: props.api.group?.id,
    };

    const onPointerMove = () => {
      // movement is evaluated on pointerup; move listener exists only so we know a drag gesture is active globally
    };

    const onPointerUp = (ev: PointerEvent) => {
      const candidate = dragCandidateRef.current;
      cleanupDragListeners();
      if (!candidate) return;
      if (ev.pointerId !== candidate.pointerId) return;

      const dx = ev.clientX - candidate.startX;
      const dy = ev.clientY - candidate.startY;
      if ((dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) {
        return;
      }

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

      const containerApi = props.containerApi ?? dockviewApi;
      const panel =
        (containerApi as any)?.getPanel?.(candidate.panelId) ??
        (props as any)?.api;
      if (!panel) return;
      const resolvedDefinitionId = resolveDockviewPanelDefinitionId(panel);
      if (!resolvedDefinitionId) {
        console.warn('[CustomTabComponent] Could not resolve panel definition for float', {
          panelId: candidate.panelId,
          currentDockviewId,
        });
        return;
      }

      try {
        const sourceGroupRestoreHint = deriveFloatingGroupRestoreHint(containerApi, candidate.groupId);
        floatPanelHandler(candidate.panelId, panel, {
          width: 600,
          height: 400,
          context: {
            ...buildFloatingOriginMetaRecord({
              sourceDockviewId: currentDockviewId ?? null,
              sourceGroupId: candidate.groupId ?? null,
              sourceInstanceId:
                currentDockviewId && currentDockviewId.length > 0
                  ? `${currentDockviewId}:${candidate.panelId}`
                  : candidate.panelId,
              sourceDefinitionId: resolvedDefinitionId,
              sourceGroupRestoreHint,
            }),
          },
        });
        removePanelAndPruneEmptyGroup(containerApi, panel, {
          sourceGroupId: candidate.groupId ?? null,
        });
      } catch (error) {
        console.warn('[CustomTabComponent] Failed to float dragged-out tab', {
          panelId: candidate.panelId,
          currentDockviewId,
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
      onContextMenu={handleContextMenu}
      onPointerDownCapture={handlePointerDownCapture}
      className="h-full"
    >
      <DockviewDefaultTab {...props} tabLocation="header" />
    </div>
  );
}
