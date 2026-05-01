import { useCallback, useState } from 'react';

import type { GameNotification } from '@/components/game/GameNotification';

export type GameNotificationType = GameNotification['type'];

export interface UseGameNotificationsResult {
  notifications: GameNotification[];
  addNotification: (
    type: GameNotificationType,
    title: string,
    message: string,
    duration?: number,
  ) => void;
  dismissNotification: (id: string) => void;
}

/**
 * Owns the transient game-notification queue. The returned callbacks are
 * stable across renders so they can be safely included in memo dependency
 * lists.
 */
export function useGameNotifications(): UseGameNotificationsResult {
  const [notifications, setNotifications] = useState<GameNotification[]>([]);

  const addNotification = useCallback(
    (type: GameNotificationType, title: string, message: string, duration?: number) => {
      const notification: GameNotification = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        title,
        message,
        duration,
      };
      setNotifications((prev) => [...prev, notification]);
    },
    [],
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, addNotification, dismissNotification };
}
