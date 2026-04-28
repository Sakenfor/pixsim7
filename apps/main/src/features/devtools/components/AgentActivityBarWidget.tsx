/**
 * Agent Activity Bar Widget
 *
 * Compact status widget for the ActivityBar bottom tray.
 * Shows number of active AI agent sessions and bridge connection status.
 * Click opens the AI Agents floating panel.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useBridgeStatus } from '@lib/agent/useBridgeStatus';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

export function AgentActivityBarWidget() {
  const { bridge, agents } = useBridgeStatus();
  const activeAgents = (agents?.total_active as number | undefined) ?? 0;
  const bridgeConnected = bridge?.connected ?? 0;
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('agent-observability' as any);
  }, [openFloatingPanel]);

  const isActive = activeAgents > 0 || bridgeConnected > 0;

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
            ? 'text-emerald-400 bg-emerald-500/15'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`AI Agents: ${activeAgents} active, ${bridgeConnected} bridges`}
      >
        <NavIcon name="activity" size={18} />

        {/* Bridge connection dot */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            bridgeConnected > 0
              ? 'bg-green-500'
              : 'bg-neutral-600'
          } ${activeAgents > 0 ? 'animate-pulse-subtle' : ''}`}
        />

        {/* Active count badge */}
        {activeAgents > 0 && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white leading-none">
            {activeAgents}
          </div>
        )}
      </button>

      {/* Tooltip */}
      {hovered && triggerRef.current && (
        <AgentTooltip
          triggerRef={triggerRef}
          activeAgents={activeAgents}
          bridgeConnected={bridgeConnected}
        />
      )}
    </div>
  );
}

function AgentTooltip({
  triggerRef,
  activeAgents,
  bridgeConnected,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  activeAgents: number;
  bridgeConnected: number;
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
          className={`w-1.5 h-1.5 rounded-full ${bridgeConnected > 0 ? 'bg-green-500' : 'bg-neutral-500'}`}
        />
        <span>{bridgeConnected > 0 ? `${bridgeConnected} bridge${bridgeConnected !== 1 ? 's' : ''}` : 'No bridges'}</span>
      </div>
      {activeAgents > 0 && (
        <span className="text-neutral-400">
          {activeAgents} active session{activeAgents !== 1 ? 's' : ''}
        </span>
      )}
    </div>,
    document.body,
  );
}
