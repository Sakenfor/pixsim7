import { useState, useEffect } from 'react';
import { DeviceCard } from './DeviceCard';
import { automationService } from '../../lib/automation/automationService';
import type { AndroidDevice, DeviceStatus } from '../../types/automation';
import { logEvent } from '../../lib/logging';

export function DeviceList() {
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<DeviceStatus | 'ALL'>('ALL');

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await automationService.getDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
      console.error('Error loading devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScanDevices = async () => {
    try {
      setScanning(true);
      setError(null);
      const result = await automationService.scanDevices();

      logEvent('INFO', 'device_scan_complete', {
        scanned: result.scanned,
        added: result.added,
        updated: result.updated,
        offline: result.offline
      });

      // Reload devices
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan devices');
      console.error('Error scanning devices:', err);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    loadDevices();

    // Auto-refresh every 10 seconds
    const interval = setInterval(loadDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredDevices = filterStatus === 'ALL'
    ? devices
    : devices.filter(d => d.status === filterStatus);

  const deviceCounts = {
    total: devices.length,
    online: devices.filter(d => d.status === DeviceStatus.ONLINE).length,
    busy: devices.filter(d => d.status === DeviceStatus.BUSY).length,
    offline: devices.filter(d => d.status === DeviceStatus.OFFLINE).length,
    error: devices.filter(d => d.status === DeviceStatus.ERROR).length,
  };

  if (loading && devices.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Android Devices
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage and monitor connected devices
          </p>
        </div>

        <button
          onClick={handleScanDevices}
          disabled={scanning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {scanning ? (
            <>
              <span className="animate-spin">⟳</span>
              Scanning...
            </>
          ) : (
            <>
              <span>🔍</span>
              Scan Devices
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {deviceCounts.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-green-600">
            {deviceCounts.online}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Online</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-yellow-600">
            {deviceCounts.busy}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Busy</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-600">
            {deviceCounts.offline}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Offline</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-red-600">
            {deviceCounts.error}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Error</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
        <div className="flex gap-2">
          {(['ALL', DeviceStatus.ONLINE, DeviceStatus.BUSY, DeviceStatus.OFFLINE, DeviceStatus.ERROR] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {status === 'ALL' ? 'ALL' : status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Device grid */}
      {filteredDevices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400">
            {devices.length === 0
              ? 'No devices found. Click "Scan Devices" to discover connected devices.'
              : 'No devices match the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}
