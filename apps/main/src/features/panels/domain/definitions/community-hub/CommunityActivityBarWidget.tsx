/**
 * Community Hub Activity Bar Widget (plan `community-chat` Phase 3B).
 *
 * Mirrors `AIAssistantActivityBarWidget` shape but kept separate — the
 * community surface has its own poll + hook (no agent-question dimension,
 * no bridge-connection status). Click opens the Community Hub floating
 * panel; aggregate unread count drives the blue badge.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useCommunityUnread } from '@features/notifications/hooks/useCommunityUnread';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

export function CommunityActivityBarWidget() {
  const { total: unreadTotal } = useCommunityUnread();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('community-hub' as any);
  }, [openFloatingPanel]);

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      {...handlers}
    >
      <button
        onClick={handleClick}
        className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative text-th-muted hover:text-th hover:bg-surface-secondary"
        aria-label={`Community Chat${
          unreadTotal > 0 ? `: ${unreadTotal} unread` : ''
        }`}
      >
        <NavIcon name="users" size={18} />

        {/* Aggregate unread badge — registry-default-off category so the
            global bell stays quiet; this is the community surface's own
            pip, fed by the scoped unread-by-ref poll. */}
        {unreadTotal > 0 ? (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-signal-info text-[10px] font-semibold text-white leading-none">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </div>
        ) : null}
      </button>

      {hovered && triggerRef.current && (
        <CommunityTooltip triggerRef={triggerRef} unread={unreadTotal} />
      )}
    </div>
  );
}

function CommunityTooltip({
  triggerRef,
  unread,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  unread: number;
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
      <span>Community Chat{unread > 0 ? ` — ${unread} unread` : ''}</span>
    </div>,
    document.body,
  );
}
