/**
 * Generation Activity Bar Widget
 *
 * Sparkles icon with active-generation count badge in the activity bar bottom
 * tray. Click toggles a floating activity panel for quick group-level
 * pause/cancel/retry; hover shows a small status tooltip. Interaction mirrors
 * NotificationActivityBarWidget for consistency.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';
import type { GenerationGroupBy } from '../lib/generationGrouping';
import { isActiveStatus } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

import { GenerationActivityFlyout } from './GenerationActivityFlyout';

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
  const { isConnected, forceReconnect } = useGenerationWebSocket();
  const activeCount = useActiveGenerationCount();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GenerationGroupBy>('prompt');

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleOpenFullPanel = useCallback(() => {
    setPanelOpen(false);
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
        type="button"
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          panelOpen
            ? 'text-amber-400 bg-amber-500/15'
            : isActive
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Generations: ${activeCount} active`}
      >
        <NavIcon name="sparkles" size={18} />

        {/* Connection dot — red when disconnected for visibility */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
          } ${isActive && isConnected ? 'animate-pulse-subtle' : ''}`}
        />

        {/* Active count badge */}
        {isActive && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white leading-none">
            {activeCount > 99 ? '99+' : activeCount}
          </div>
        )}
      </button>

      {/* Tooltip (only when panel is closed) */}
      {hovered && !panelOpen && triggerRef.current && (
        <GenerationTooltip
          triggerRef={triggerRef}
          activeCount={activeCount}
          isConnected={isConnected}
        />
      )}

      {/* Floating panel */}
      {panelOpen && triggerRef.current && (
        <GenerationPanelPortal triggerRef={triggerRef}>
          <GenerationActivityFlyout
            groupBy={groupBy}
            onChangeGroupBy={setGroupBy}
            onOpenFullPanel={handleOpenFullPanel}
            onClose={handleClose}
            isConnected={isConnected}
            onReconnect={forceReconnect}
          />
        </GenerationPanelPortal>
      )}
    </div>
  );
}

// ── Portal components (mirror NotificationActivityBarWidget) ──────────

function GenerationTooltip({
  triggerRef,
  activeCount,
  isConnected,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  activeCount: number;
  isConnected: boolean;
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
      <span>
        {activeCount > 0 ? `${activeCount} generating` : 'No active generations'}
      </span>
      {!isConnected && <span className="text-red-400">Disconnected</span>}
    </div>,
    document.body,
  );
}

function GenerationPanelPortal({
  triggerRef,
  children,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-popover"
      style={{
        bottom: window.innerHeight - rect.top - rect.height,
        left: rect.right + 8,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
