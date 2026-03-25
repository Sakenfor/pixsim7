/**
 * Generation Activity Bar Widget
 *
 * Compact status widget for the ActivityBar bottom tray.
 * Shows WebSocket connection status and active generation count.
 * Click opens the recent-generations floating panel.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';


import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';
import { isActiveStatus } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

function useActiveGenerationCount(): number {
  return useGenerationsStore((s) => {
    let count = 0;
    for (const g of s.generations.values()) {
      if (isActiveStatus(g.status)) count++;
    }
    return count;
  });
}

export function GenerationActivityBarWidget() {
  const { isConnected, getDebugInfo, forceReconnect } = useGenerationWebSocket();
  const activeCount = useActiveGenerationCount();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('generations');
  }, [openFloatingPanel]);

  const isActive = activeCount > 0;

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      {...handlers}
    >
      <button
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          isActive
            ? 'text-amber-400 bg-amber-500/15'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Generations: ${activeCount} active`}
      >
        <NavIcon name="sparkles" size={18} />

        {/* Connection dot — red when disconnected for visibility */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            isConnected
              ? 'bg-green-500'
              : 'bg-red-500 animate-pulse'
          } ${isActive && isConnected ? 'animate-pulse-subtle' : ''}`}
        />

        {/* Active count badge */}
        {isActive && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white leading-none">
            {activeCount}
          </div>
        )}
      </button>

      {/* Tooltip */}
      {hovered && triggerRef.current && (
        <WidgetTooltip
          triggerRef={triggerRef}
          isConnected={isConnected}
          activeCount={activeCount}
          getDebugInfo={getDebugInfo}
          onReconnect={forceReconnect}
        />
      )}
    </div>
  );
}

const WS_READY_STATE_LABELS: Record<number, string> = {
  [-1]: 'No socket',
  [WebSocket.CONNECTING]: 'Connecting',
  [WebSocket.OPEN]: 'Open',
  [WebSocket.CLOSING]: 'Closing',
  [WebSocket.CLOSED]: 'Closed',
};

function WidgetTooltip({
  triggerRef,
  isConnected,
  activeCount,
  getDebugInfo,
  onReconnect,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  activeCount: number;
  getDebugInfo: () => { url: string | null; lastError: string | null; reconnectAttempts: number; readyState: number; refCount: number };
  onReconnect: () => void;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  const debug = getDebugInfo();

  return createPortal(
    <div
      className="fixed z-tooltip py-1.5 px-3 bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm text-xs text-neutral-200 whitespace-nowrap flex flex-col gap-0.5"
      style={{
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span>{isConnected ? 'Live' : 'Disconnected'}</span>
      </div>
      {activeCount > 0 && (
        <span className="text-neutral-400">
          {activeCount} generating
        </span>
      )}
      {!isConnected && (
        <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-neutral-700/50 text-[10px] text-neutral-500">
          <span>State: {WS_READY_STATE_LABELS[debug.readyState] ?? debug.readyState}</span>
          {debug.lastError && <span className="text-red-400">{debug.lastError}</span>}
          {debug.reconnectAttempts > 0 && <span>Retries: {debug.reconnectAttempts}</span>}
          {debug.url && <span className="max-w-[220px] truncate">{debug.url}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); onReconnect(); }}
            className="mt-0.5 px-1.5 py-0.5 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-200 text-[10px] pointer-events-auto self-start"
          >
            Reconnect
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
