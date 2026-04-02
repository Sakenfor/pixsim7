/**
 * AI Assistant Activity Bar Widget
 *
 * User-facing widget in the activity bar tray.
 * Shows connection status and opens the AI Assistant chat panel on click.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { pixsimClient } from '@lib/api/client';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

const AI_ASSISTANT_WIDGET_POLL_HEADERS = { 'X-Client-Surface': 'widget:ai-assistant-activity-bar' } as const;

function useBridgeStatus() {
  const [connected, setConnected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pixsimClient
        .get<{ connected: number }>('/meta/agents/bridge', { headers: AI_ASSISTANT_WIDGET_POLL_HEADERS })
        .then((res) => { if (!cancelled) setConnected(res.connected); })
        .catch(() => { if (!cancelled) setConnected(0); });
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return connected;
}

export function AIAssistantActivityBarWidget() {
  const connected = useBridgeStatus();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    openFloatingPanel('ai-assistant' as any, {
      width: 420,
      height: 520,
    });
  }, [openFloatingPanel]);

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
        aria-label="AI Assistant"
      >
        <NavIcon name="messageSquare" size={18} />

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
