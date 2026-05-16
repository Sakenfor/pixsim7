/**
 * Notifications-derived ticker sources.
 *
 * Exports two source instances — one filtered to plan refType, one to
 * generation refType — both backed by the shared `notificationsPoll`
 * singleton so we make exactly one network call regardless of how many
 * surfaces (widget + ticker) are mounted.
 *
 * Backlog handling: the very first poll callback is treated as the
 * baseline — its notifications populate `seenIds` but emit nothing. This
 * prevents a 20-event flood every time the ticker mounts. The optional
 * `initial()` hook hydrates the most recent N as a "fresh on load" backlog
 * if the user wants to see what they missed.
 */

import {
  subscribeNotifications,
  getNotificationsSnapshot,
  type NotificationItem,
} from '@features/notifications/lib/notificationsPoll';
import { planTypeIconName } from '@features/panels/components/dev/plans/detail/types';

import type { TickerEvent, TickerSource } from '../lib/sourceRegistry';

/** How many recent matching notifications to surface on first load. */
const BACKLOG_LIMIT = 3;
/** TTL for notification-derived events. Long shelf — these are real news. */
const NOTIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

interface NotificationSourceConfig {
  id: string;
  label: string;
  description: string;
  /** Which Notification.refType this source filters to. */
  refType: string;
  icon: string;
  color: string;
  /** Optional per-notification icon override (falls back to `icon`). */
  resolveIcon?: (n: NotificationItem) => string | undefined;
}

function severityColor(severity: string, fallback: string): string {
  switch (severity) {
    case 'error':
      return 'text-red-500';
    case 'warning':
      return 'text-amber-500';
    case 'success':
      return 'text-green-500';
    default:
      return fallback;
  }
}

function toTickerEvent(
  n: NotificationItem,
  config: NotificationSourceConfig,
): TickerEvent {
  return {
    // Prefix with sourceId so plan + generation events keyed off the same
    // notification id (rare but possible across categories) don't collide
    // in the buffer.
    id: `${config.id}:${n.id}`,
    sourceId: config.id,
    message: n.title,
    icon: config.resolveIcon?.(n) ?? config.icon,
    color: severityColor(n.severity, config.color),
    refType: config.refType,
    refId: n.refId ?? undefined,
    timestamp: Date.parse(n.createdAt) || Date.now(),
    ttl: NOTIFICATION_TTL_MS,
  };
}

function makeNotificationSource(config: NotificationSourceConfig): TickerSource {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    defaultEnabled: false,

    async initial() {
      // Backlog from whatever's already in the snapshot (might be empty if
      // we mount before the first poll completes — fine, subscribe() will
      // catch up).
      const snap = getNotificationsSnapshot();
      return snap.notifications
        .filter((n) => n.refType === config.refType)
        .slice(0, BACKLOG_LIMIT)
        .map((n) => toTickerEvent(n, config));
    },

    subscribe(emit) {
      const seen = new Set<string>();
      let primed = false;

      const unsubscribe = subscribeNotifications((snap) => {
        // Skip the synchronous empty-snapshot callback that fires at
        // subscribe time AND any pre-fetch `loading: true` publish; gate
        // on having actually completed a fetch (lastFetchedAt > 0).
        if (snap.lastFetchedAt === 0) return;

        for (const n of snap.notifications) {
          if (n.refType !== config.refType) continue;
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          // First REAL payload is baseline only — record without emitting
          // so we don't flood. After that, every new id is fair game.
          if (!primed) continue;
          emit(toTickerEvent(n, config));
        }
        primed = true;
      });

      return unsubscribe;
    },
  };
}

export const notificationsPlanSource = makeNotificationSource({
  id: 'notifications:plan',
  label: 'Plan updates',
  description: 'Plan create / update / status events from the notifications stream',
  refType: 'plan',
  icon: '📋',
  color: 'text-purple-500',
  resolveIcon: (n) => {
    const planType = n.payload?.planType;
    return typeof planType === 'string' ? planTypeIconName(planType) : undefined;
  },
});

export const notificationsGenerationSource = makeNotificationSource({
  id: 'notifications:generation',
  label: 'Generation events',
  description: 'Generation milestones surfaced via notifications (longer shelf than the live source)',
  refType: 'generation',
  icon: '🎬',
  color: 'text-indigo-500',
});
