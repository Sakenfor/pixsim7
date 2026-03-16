import { createElement, lazy, Suspense } from 'react';

import { defineModule } from '@app/modules/types';

const LazyNotificationWidget = lazy(() =>
  import('./components/NotificationActivityBarWidget').then((m) => ({
    default: m.NotificationActivityBarWidget,
  }))
);

function NotificationWidgetShell() {
  return createElement(Suspense, { fallback: null }, createElement(LazyNotificationWidget));
}

export default defineModule({
  id: 'notifications',
  name: 'Notifications Module',
  updatedAt: '2026-03-16T00:00:00Z',
  changeNote: 'Notification bell widget for plan events and system announcements.',
  featureHighlights: ['Bell icon with unread count badge and floating notification panel.'],

  activityBarWidgets: [
    {
      id: 'notifications',
      order: 3,
      label: 'Notifications',
      icon: 'bell',
      component: NotificationWidgetShell,
    },
  ],
});
