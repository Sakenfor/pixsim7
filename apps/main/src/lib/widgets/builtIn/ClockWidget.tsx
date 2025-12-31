/**
 * Clock Widget
 *
 * Simple clock widget showing current time.
 * Example of a basic info widget for the header.
 */

import { useState, useEffect } from 'react';
import { defineWidget } from '../defineWidget';
import type { WidgetComponentProps } from '../types';

interface ClockSettings {
  format: '12h' | '24h';
  showSeconds: boolean;
}

function ClockWidgetComponent({
  settings,
  surface,
}: WidgetComponentProps<ClockSettings>) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const format = settings?.format || '24h';
  const showSeconds = settings?.showSeconds ?? false;

  const formatTime = (date: Date) => {
    if (format === '12h') {
      const hours = date.getHours() % 12 || 12;
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
      return showSeconds
        ? `${hours}:${minutes}:${seconds} ${ampm}`
        : `${hours}:${minutes} ${ampm}`;
    } else {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return showSeconds
        ? `${hours}:${minutes}:${seconds}`
        : `${hours}:${minutes}`;
    }
  };

  // Compact rendering for header
  if (surface === 'header') {
    return (
      <div className="flex items-center px-2 py-1 text-xs font-mono text-neutral-600 dark:text-neutral-400">
        {formatTime(time)}
      </div>
    );
  }

  // Standard rendering for other surfaces
  return (
    <div className="flex items-center justify-center p-2 text-sm font-mono">
      {formatTime(time)}
    </div>
  );
}

export const clockWidget = defineWidget<ClockSettings>({
  id: 'clock',
  title: 'Clock',
  description: 'Displays current time',
  icon: 'C',
  category: 'info',
  domain: 'core',
  tags: ['time', 'clock', 'utility'],

  surfaces: ['header', 'statusbar'],
  surfaceConfig: {
    header: {
      area: 'right',
      size: 'small',
      priority: 100, // Low priority = renders last
    },
    statusbar: {
      area: 'right',
      priority: 100,
    },
  },

  component: ClockWidgetComponent,

  defaultSettings: {
    format: '24h',
    showSeconds: false,
  },
});
