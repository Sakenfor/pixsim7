/**
 * AI Assistant Activity Bar Widget
 *
 * User-facing widget in the activity bar tray.
 * Shows connection status and opens the AI Assistant chat panel on click.
 */
import { runAnimation, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useBridgeStatus } from '@lib/agent/useBridgeStatus';

import { useChatUnread } from '@features/notifications/hooks/useChatUnread';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

import { useAssistantChatStore } from './assistantChatStore';

// Cadence of the recurring "agent is waiting on you" wiggle while the panel is
// out of sight. Slower than the 15s unread poll so a re-nudge never stacks on a
// poll-driven re-render, and slow enough not to read as frantic.
const QUESTION_NUDGE_INTERVAL_MS = 12_000;

export function AIAssistantActivityBarWidget() {
  const { bridge } = useBridgeStatus();
  const connected = bridge?.connected ?? 0;
  const { total: unreadTotal, questionsTotal, questionsByTabId } = useChatUnread();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  // The AI panel opens as a floating panel; it's "on screen" only when it's in
  // the floating list and not minimized. When it isn't, an arriving agent
  // question has no visible ConfirmationCard, so the icon escalates with a shake.
  const aiPanelVisible = useWorkspaceStore((s) => {
    const p = s.floatingPanels.find((fp) => fp.id === 'ai-assistant');
    return !!p && !p.minimized;
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  // Shake the activity-bar icon when an agent is waiting on the user while the
  // panel is out of sight (closed / minimized / dismissed). A single wiggle is
  // easy to miss if the user looked away, so we shake immediately on a fresh
  // question and then keep re-nudging on an interval until it's answered or the
  // panel comes on screen. The shake is gated on `!aiPanelVisible` because a
  // visible panel already renders the ConfirmationCard.
  const prevQuestionsRef = useRef(questionsTotal);
  useEffect(() => {
    const prev = prevQuestionsRef.current;
    prevQuestionsRef.current = questionsTotal;
    if (questionsTotal <= 0 || aiPanelVisible) return;

    const shake = () => {
      if (buttonRef.current) runAnimation(buttonRef.current, 'shake', { amplitude: 5 });
    };
    // Immediate shake only when the count just went up (a fresh question) —
    // the 15s unread poll re-reports the same total and must not re-fire on
    // entry. The interval below carries the ongoing nudge regardless.
    if (questionsTotal > prev) shake();
    const id = setInterval(shake, QUESTION_NUDGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [questionsTotal, aiPanelVisible]);

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
        ref={buttonRef}
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          connected > 0
            ? 'text-accent bg-accent/15'
            : 'text-th-muted hover:text-th hover:bg-surface-secondary'
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
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-signal-warning text-[10px] font-semibold text-white leading-none">
            {questionsTotal > 99 ? '99+' : questionsTotal}
          </div>
        ) : unreadTotal > 0 ? (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-signal-info text-[10px] font-semibold text-white leading-none">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </div>
        ) : null}

        {/* Connection dot */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            connected > 0 ? 'bg-signal-success' : 'bg-th-muted'
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
      className="fixed z-tooltip py-1.5 px-3 bg-surface-inset border border-th-secondary rounded-lg shadow-xl backdrop-blur-sm text-xs text-th whitespace-nowrap pointer-events-none"
      style={{
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${connected > 0 ? 'bg-signal-success' : 'bg-th-muted'}`} />
        <span>AI Assistant {connected > 0 ? '' : '(offline)'}</span>
      </div>
    </div>,
    document.body,
  );
}
