import { type AndroidDevice, DeviceStatus, DeviceType } from '../../types/automation';

interface DeviceCardProps {
  device: AndroidDevice;
}

const statusColors: Record<DeviceStatus, string> = {
  [DeviceStatus.ONLINE]: 'bg-green-500',
  [DeviceStatus.OFFLINE]: 'bg-gray-500',
  [DeviceStatus.BUSY]: 'bg-yellow-500',
  [DeviceStatus.ERROR]: 'bg-red-500',
};

const statusLabels: Record<DeviceStatus, string> = {
  [DeviceStatus.ONLINE]: 'Online',
  [DeviceStatus.OFFLINE]: 'Offline',
  [DeviceStatus.BUSY]: 'Busy',
  [DeviceStatus.ERROR]: 'Error',
};

const typeIcons: Record<DeviceType, string> = {
  [DeviceType.BLUESTACKS]: '💻',
  [DeviceType.ADB]: '📱',
};

export function DeviceCard({ device }: DeviceCardProps) {
  const statusColor = statusColors[device.status];
  const statusLabel = statusLabels[device.status];
  const typeIcon = typeIcons[device.device_type];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{typeIcon}</span>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {device.instance_name || device.device_serial || device.adb_id}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {device.device_type}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Device details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">ADB ID:</span>
          <span className="text-gray-900 dark:text-gray-100 font-mono">
            {device.adb_id}
          </span>
        </div>

        {device.instance_port && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Port:</span>
            <span className="text-gray-900 dark:text-gray-100">
              {device.instance_port}
            </span>
          </div>
        )}

        {device.assigned_account_id && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Assigned Account:</span>
            <span className="text-gray-900 dark:text-gray-100">
              #{device.assigned_account_id}
            </span>
          </div>
        )}

        {device.last_seen && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Last Seen:</span>
            <span className="text-gray-900 dark:text-gray-100">
              {new Date(device.last_seen).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
