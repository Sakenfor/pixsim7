/**
 * useNotifications — React hook over the shared notifications poll.
 *
 * Same surface as the previous inline hook in `NotificationActivityBarWidget`,
 * now backed by the singleton `notificationsPoll` so the activity-bar widget
 * and any other consumer (ticker sources, future status bar) share one
 * fetch loop.
 */

import { useCallback, useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

import {
  applyMarkAllRead,
  applyMarkRead,
  getNotificationsSnapshot,
  refreshNotifications,
  subscribeNotifications,
  type NotificationItem,
  type NotificationsSnapshot,
} from '../lib/notificationsPoll';

export type { NotificationItem };

export interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [snap, setSnap] = useState<NotificationsSnapshot>(getNotificationsSnapshot);

  useEffect(() => subscribeNotifications(setSnap), []);

  const refresh = useCallback(() => refreshNotifications(), []);

  const markRead = useCallback(async (id: string) => {
    try {
      await pixsimClient.patch(`/notifications/${id}/read`, {});
      applyMarkRead(id);
    } catch {
      // silent — keep prior state
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await pixsimClient.post('/notifications/mark-all-read', {});
      applyMarkAllRead();
    } catch {
      // silent
    }
  }, []);

  return {
    notifications: snap.notifications,
    unreadCount: snap.unreadCount,
    loading: snap.loading,
    refresh,
    markRead,
    markAllRead,
  };
}
