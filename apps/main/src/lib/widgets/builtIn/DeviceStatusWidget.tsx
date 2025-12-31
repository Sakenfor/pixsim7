/**
 * Device Status Widget
 *
 * Shows status of automation devices (online/busy/offline counts).
 * Example of an automation widget that could consume capabilities.
 */

import { useState, useEffect } from 'react';
import { defineWidget } from '../defineWidget';
import type { WidgetComponentProps } from '../types';

interface DeviceStatusSettings {
  showCounts: boolean;
  refreshInterval: number; // seconds
}

interface DeviceStats {
  online: number;
  busy: number;
  offline: number;
  total: number;
}

function DeviceStatusWidgetComponent({
  settings,
  surface,
}: WidgetComponentProps<DeviceStatusSettings>) {
  const [stats, setStats] = useState<DeviceStats>({
    online: 0,
    busy: 0,
    offline: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  const showCounts = settings?.showCounts ?? true;
  const refreshInterval = settings?.refreshInterval ?? 30;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/v1/automation/devices');
        if (response.ok) {
          const data = await response.json();
          const devices = data.devices || [];
          setStats({
            online: devices.filter((d: any) => d.status === 'online').length,
            busy: devices.filter((d: any) => d.status === 'busy').length,
            offline: devices.filter((d: any) => d.status === 'offline').length,
            total: devices.length,
          });
        }
      } catch (error) {
        // Silently fail - might not have automation backend
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Status dot colors
  const getStatusColor = () => {
    if (loading) return 'bg-neutral-400';
    if (stats.online > 0) return 'bg-green-500';
    if (stats.busy > 0) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Compact rendering for header
  if (surface === 'header') {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-default"
        title={`Devices: ${stats.online} online, ${stats.busy} busy, ${stats.offline} offline`}
      >
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        {showCounts && !loading && (
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {stats.online}/{stats.total}
          </span>
        )}
      </div>
    );
  }

  // Standard rendering for other surfaces
  return (
    <div className="flex flex-col gap-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
        <span className="text-sm font-medium">Devices</span>
      </div>
      {loading ? (
        <div className="text-xs text-neutral-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>{stats.online} online</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>{stats.busy} busy</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>{stats.offline} offline</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const deviceStatusWidget = defineWidget<DeviceStatusSettings>({
  id: 'device-status',
  title: 'Device Status',
  description: 'Shows automation device status (online/busy/offline)',
  icon: 'D',
  category: 'automation',
  domain: 'automation',
  tags: ['devices', 'status', 'automation', 'android'],

  surfaces: ['header', 'panel-composer'],
  surfaceConfig: {
    header: {
      area: 'right',
      size: 'tiny',
      priority: 50,
    },
    panelComposer: {
      minWidth: 2,
      minHeight: 2,
      defaultWidth: 3,
      defaultHeight: 2,
    },
  },

  component: DeviceStatusWidgetComponent,

  defaultSettings: {
    showCounts: true,
    refreshInterval: 30,
  },

  // Could consume a deviceList capability from automation feature
  // consumesCapabilities: ['deviceList'],
});
