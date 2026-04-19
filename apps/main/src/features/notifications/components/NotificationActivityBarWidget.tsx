/**
 * Notification Activity Bar Widget
 *
 * Bell icon with unread count badge in the activity bar bottom tray.
 * Click opens a floating notification panel with recent notifications.
 */
import { Badge, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { navigateToAgentProfile, navigateToPlan } from '@features/workspace';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

// ── Types ────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  category: string;
  severity: string;
  source: string;
  actorName: string | null;
  refType: string | null;
  refId: string | null;
  broadcast: boolean;
  read: boolean;
  createdAt: string;
}

interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const NOTIFICATION_WIDGET_POLL_HEADERS = { 'X-Client-Surface': 'widget:notifications-activity-bar' } as const;

// ── Hooks ────────────────────────────────────────────────────────

function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    setLoading(true);
    try {
      const res = await pixsimClient.get<NotificationListResponse>('/notifications?limit=20', {
        headers: NOTIFICATION_WIDGET_POLL_HEADERS,
      });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await pixsimClient.patch(`/notifications/${id}/read`, {});
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // silent
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    try {
      await pixsimClient.post('/notifications/mark-all-read', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, []);

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}

// ── Severity/Category styling ────────────────────────────────────

const SEVERITY_COLORS: Record<string, 'green' | 'blue' | 'orange' | 'red' | 'gray'> = {
  success: 'green',
  info: 'blue',
  warning: 'orange',
  error: 'red',
};

const CATEGORY_ICONS: Record<string, string> = {
  plan: 'fileText',
  feature: 'star',
  agent: 'activity',
  system: 'settings',
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Floating Panel ───────────────────────────────────────────────

// ── Body renderer (inline links from **bold** segments) ──────────

function NotificationBody({
  body,
  notification,
  onNavigate,
}: {
  body: string;
  notification: NotificationItem;
  onNavigate: (n: NotificationItem) => void;
}) {
  // Parse **bold** segments into clickable links if notification has a ref
  const parts = body.split(/(\*\*[^*]+\*\*)/g);

  return (
    <div className="text-[11px] text-neutral-400 mt-0.5 line-clamp-2">
      {parts.map((part, i) => {
        const boldMatch = part.match(/^\*\*(.+)\*\*$/);
        if (boldMatch) {
          const text = boldMatch[1];
          if (notification.refType) {
            return (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); onNavigate(notification); }}
                className="font-semibold text-blue-400 hover:text-blue-300 hover:underline"
              >
                {text}
              </button>
            );
          }
          return <span key={i} className="font-semibold text-neutral-200">{text}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

// ── Actor label with clickable agent name ────────────────────────

function ActorLabelWithAgent({ label, source }: { label: string; source: string }) {
  if (!source.startsWith('agent:')) return <>{label}</>;

  // Backend stores composite names like "Claude Plan Writer (stefan)".
  // Split into agent part and user part to make agent clickable.
  const parenMatch = label.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!parenMatch) return <>{label}</>;

  const [, agentName, userName] = parenMatch;
  const agentId = source.slice('agent:'.length);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigateToAgentProfile(agentId);
        }}
        className="text-blue-400 hover:text-blue-300 hover:underline"
      >
        {agentName}
      </button>
      {' '}({userName})
    </>
  );
}

// ── Navigation ───────────────────────────────────────────────────

/** Map refType to a panel ID or action. Returns null if no navigation. */
function getNavigationTarget(n: NotificationItem): { panelId: string } | null {
  if (!n.refType) return null;

  switch (n.refType) {
    case 'plan':
      return { panelId: 'plans' };
    case 'generation':
      return { panelId: 'generation-history' };
    case 'document':
      return { panelId: 'plans' };
    default:
      return null;
  }
}

// ── Floating Panel ───────────────────────────────────────────────

function NotificationPanel({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  onClose,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate: (n: NotificationItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-[360px] max-h-[480px] flex flex-col bg-neutral-900/95 border border-neutral-700/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">Notifications</span>
          {unreadCount > 0 && (
            <Badge color="blue" className="text-[10px]">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-[10px] text-neutral-400 hover:text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-700/50 transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-0.5 rounded hover:bg-neutral-700/50 transition-colors"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-neutral-500">
            No notifications yet
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {notifications.map((n) => {
                const actorLabel =
                  (n.actorName || '').trim() ||
                  formatActorLabel({ fallback: n.source || null });
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.read) onMarkRead(n.id); }}
                    className={`px-3 py-2.5 hover:bg-neutral-800/40 transition-colors ${
                      n.read ? 'opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Unread dot */}
                      <div className="mt-1.5 shrink-0">
                        {!n.read ? (
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        ) : (
                          <div className="w-2 h-2" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            name={(CATEGORY_ICONS[n.category] ?? 'bell') as any}
                            size={12}
                            className="text-neutral-400 shrink-0"
                          />
                          <span className="text-xs font-medium text-neutral-200 truncate">
                            {n.title}
                          </span>
                          <Badge
                            color={SEVERITY_COLORS[n.severity] ?? 'gray'}
                            className="text-[9px] shrink-0"
                          >
                            {n.severity}
                          </Badge>
                        </div>
                        {n.body && (
                          <NotificationBody body={n.body} notification={n} onNavigate={onNavigate} />
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-neutral-500">
                            {actorLabel ? (
                              <>
                                <ActorLabelWithAgent label={actorLabel} source={n.source} />
                                {' '}&middot;{' '}
                              </>
                            ) : null}
                            {formatTimeAgo(n.createdAt)}
                          </span>
                          {n.refType && n.refId && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onNavigate(n); }}
                              className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              Open {n.refType}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────

export function NotificationActivityBarWidget() {
  const { notifications, unreadCount, markRead, markAllRead, refresh } = useNotifications();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const [panelOpen, setPanelOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

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

  const handleNavigate = useCallback(
    (n: NotificationItem) => {
      if (n.refType === 'plan' && n.refId) {
        navigateToPlan(n.refId);
        setPanelOpen(false);
        return;
      }
      const target = getNavigationTarget(n);
      if (target) {
        openFloatingPanel(target.panelId as any);
        setPanelOpen(false);
      }
    },
    [openFloatingPanel],
  );

  // Refresh when panel opens
  useEffect(() => {
    if (panelOpen) void refresh();
  }, [panelOpen, refresh]);

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      {...handlers}
    >
      <button
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          panelOpen
            ? 'text-blue-400 bg-blue-500/15'
            : unreadCount > 0
              ? 'text-blue-400 bg-blue-500/10'
              : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Notifications: ${unreadCount} unread`}
      >
        <NavIcon name="bell" size={18} />

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {/* Tooltip (only when panel is closed) */}
      {hovered && !panelOpen && triggerRef.current && (
        <NotificationTooltip triggerRef={triggerRef} unreadCount={unreadCount} />
      )}

      {/* Floating panel */}
      {panelOpen && triggerRef.current && (
        <NotificationPanelPortal triggerRef={triggerRef}>
          <NotificationPanel
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onNavigate={handleNavigate}
            onClose={handleClose}
          />
        </NotificationPanelPortal>
      )}
    </div>
  );
}

// ── Portal components ────────────────────────────────────────────

function NotificationTooltip({
  triggerRef,
  unreadCount,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  unreadCount: number;
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
      {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'No new notifications'}
    </div>,
    document.body,
  );
}

function NotificationPanelPortal({
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
