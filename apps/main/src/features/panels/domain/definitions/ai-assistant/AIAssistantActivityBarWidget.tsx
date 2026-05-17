/**
 * AI Assistant Activity Bar Widget
 *
 * User-facing widget in the activity bar tray.
 * Shows connection status and opens the AI Assistant chat panel on click.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useBridgeStatus } from '@lib/agent/useBridgeStatus';

import { useChatUnread } from '@features/notifications/hooks/useChatUnread';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

import { useAssistantChatStore } from './assistantChatStore';

export function AIAssistantActivityBarWidget() {
  const { bridge } = useBridgeStatus();
  const connected = bridge?.connected ?? 0;
  const { total: unreadTotal, questionsTotal, questionsByTabId } = useChatUnread();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('ai-assistant' as any);
    // Phase 4b s3 (jump-to): if an agent is waiting on an answer, take the
    // user straight to the tab whose prompt is live instead of just opening
    // the panel. Pick the first such tab in store order (leftmost/oldest)
    // for deterministic navigation. The tab's clear-on-focus then dismisses
    // the orange nudge once they're looking at it.
    if (questionsTotal > 0) {
      const { tabs, setActiveTab } = useAssistantChatStore.getState();
      const target = tabs.find((t) => (questionsByTabId[t.id] ?? 0) > 0);
      if (target) setActiveTab(target.id);
    }
  }, [openFloatingPanel, questionsTotal, questionsByTabId]);

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      {...handlers}
    >
      <button
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          connected > 0
            ? 'text-blue-400 bg-blue-500/15'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`AI Assistant${
          questionsTotal > 0
            ? `: ${questionsTotal} pending question${questionsTotal === 1 ? '' : 's'}`
            : unreadTotal > 0
              ? `: ${unreadTotal} unread`
              : ''
        }`}
      >
        <NavIcon name="messageSquare" size={18} />

        {/* Aggregate badge — off the global bell (both categories are
            bell-suppressed); this is the AI Assistant's own surface. A
            pending agent question (orange, Phase 4b) takes precedence over
            unread replies (blue, Phase 4a): a blocked agent is more urgent. */}
        {questionsTotal > 0 ? (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-orange-500 text-[10px] font-semibold text-white leading-none">
            {questionsTotal > 99 ? '99+' : questionsTotal}
          </div>
        ) : unreadTotal > 0 ? (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white leading-none">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </div>
        ) : null}

        {/* Connection dot */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            connected > 0 ? 'bg-green-500' : 'bg-neutral-600'
          }`}
        />
      </button>

      {hovered && triggerRef.current && (
        <AssistantTooltip triggerRef={triggerRef} connected={connected} />
      )}
    </div>
  );
}

function AssistantTooltip({
  triggerRef,
  connected,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  connected: number;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-tooltip py-1.5 px-3 bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm text-xs text-neutral-200 whitespace-nowrap pointer-events-none"
      style={{
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${connected > 0 ? 'bg-green-500' : 'bg-neutral-500'}`} />
        <span>AI Assistant {connected > 0 ? '' : '(offline)'}</span>
      </div>
    </div>,
    document.body,
  );
}
