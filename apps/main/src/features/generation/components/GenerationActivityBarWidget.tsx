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
  const { isConnected } = useGenerationWebSocket();
  const activeCount = useActiveGenerationCount();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('recent-generations');
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
            ? 'text-accent bg-accent/15'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Generations: ${activeCount} active`}
      >
        <NavIcon name="sparkles" size={18} />

        {/* Connection dot */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            isConnected
              ? 'bg-green-500'
              : 'bg-neutral-600'
          } ${isActive && isConnected ? 'animate-pulse-subtle' : ''}`}
        />

        {/* Active count badge */}
        {isActive && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white leading-none">
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
        />
      )}
    </div>
  );
}

function WidgetTooltip({
  triggerRef,
  isConnected,
  activeCount,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  activeCount: number;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-tooltip py-1.5 px-3 bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm text-xs text-neutral-200 whitespace-nowrap pointer-events-none flex flex-col gap-0.5"
      style={{
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-neutral-500'}`}
        />
        <span>{isConnected ? 'Live' : 'Offline'}</span>
      </div>
      {activeCount > 0 && (
        <span className="text-neutral-400">
          {activeCount} generating
        </span>
      )}
    </div>,
    document.body,
  );
}
