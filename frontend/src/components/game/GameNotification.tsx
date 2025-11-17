import { useEffect, useState } from 'react';
import { Panel, Badge } from '@pixsim7/ui';

export interface GameNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface GameNotificationsProps {
  notifications: GameNotification[];
  onDismiss: (id: string) => void;
}

export function GameNotifications({ notifications, onDismiss }: GameNotificationsProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <GameNotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

interface GameNotificationItemProps {
  notification: GameNotification;
  onDismiss: (id: string) => void;
}

function GameNotificationItem({ notification, onDismiss }: GameNotificationItemProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const duration = notification.duration || 5000;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(notification.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  const getColorClasses = () => {
    switch (notification.type) {
      case 'success':
        return 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20';
      case 'error':
        return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
      case 'warning':
        return 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20';
      case 'info':
      default:
        return 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  const getBadgeColor = (): 'green' | 'red' | 'yellow' | 'blue' => {
    switch (notification.type) {
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'warning':
        return 'yellow';
      case 'info':
      default:
        return 'blue';
    }
  };

  return (
    <div
      className={`transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
      }`}
    >
      <Panel className={`space-y-2 shadow-lg ${getColorClasses()}`} padded={true}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge color={getBadgeColor()}>{notification.type}</Badge>
            <span className="font-semibold text-sm">{notification.title}</span>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onDismiss(notification.id), 300);
            }}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{notification.message}</p>
      </Panel>
    </div>
  );
}
